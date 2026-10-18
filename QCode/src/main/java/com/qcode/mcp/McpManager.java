
package com.qcode.mcp;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.qcode.domain.dto.McpDTO;
import com.qcode.domain.vo.McpToolVO;
import com.qcode.domain.vo.McpVO;
import io.agentscope.core.tool.Toolkit;
import io.agentscope.core.tool.mcp.McpClientBuilder;
import io.agentscope.core.tool.mcp.McpClientWrapper;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;

@Slf4j
@Component
public class McpManager {

    private final ObjectMapper objectMapper = new ObjectMapper();

    // MCP 配置
    private final Map<String, McpServerConfig> configs =
            new LinkedHashMap<>();

    // 已连接的 MCP Client
    private final Map<String, McpClientWrapper> clients =
            new HashMap<>();

    // 连接错误
    private final Map<String, String> errors =
            new HashMap<>();

    // 工具数量缓存
    private final Map<String, Integer> toolCounts =
            new HashMap<>();

    // MCP 工具名称与描述，用于设置页展示
    private final Map<String, List<McpToolVO>> toolDetails =
            new HashMap<>();

    private final Path configPath = Path.of(
            System.getProperty("user.home"),
            ".qcode", "config", "mcp.json"
    );

    private static final Duration TIMEOUT =
            Duration.ofSeconds(30);

    /**
     * 初始化：只加载配置，不连接 MCP
     */
    @PostConstruct
    public synchronized void init() {
        try {
            load();
            log.info("MCP 配置加载完成，共 {} 个 Server",
                    configs.size());
        } catch (IOException e) {
            throw new IllegalStateException(
                    "MCP 配置加载失败", e);
        }
    }

    /**
     * 获取 MCP 列表
     */
    public synchronized List<McpVO> list() {
        return configs.values().stream()
                .map(this::toVO)
                .toList();
    }

    /**
     * 新增 MCP，默认停用
     */
    public synchronized McpVO add(McpDTO request) {
        validate(request);

        String name = request.name();

        if (configs.containsKey(name)) {
            throw new IllegalArgumentException(
                    "MCP Server 已存在: " + name);
        }

        McpServerConfig config = new McpServerConfig(
                name,
                request.type(),
                request.command(),
                request.args() == null
                        ? List.of()
                        : List.copyOf(request.args()),
                request.url(),
                request.env() == null
                        ? Map.of()
                        : Map.copyOf(request.env()),
                request.headers() == null
                        ? Map.of()
                        : Map.copyOf(request.headers()),
                false
        );

        configs.put(name, config);

        try {
            save();
        } catch (RuntimeException e) {
            configs.remove(name);
            throw e;
        }

        log.info("MCP 添加成功: {}", name);
        return toVO(config);
    }

    /**
     * 删除 MCP
     */
    public synchronized void delete(String name) {
        McpServerConfig config = requireConfig(name);

        // 先关闭连接，失败则不删除配置
        disconnect(name);

        configs.remove(name);

        try {
            save();
        } catch (RuntimeException e) {
            configs.put(name, config);
            throw e;
        }

        errors.remove(name);
        toolCounts.remove(name);
        toolDetails.remove(name);

        log.info("MCP 删除成功: {}", name);
    }

    /**
     * 启用 / 停用 MCP
     *
     * 启用：立即连接，以便返回工具列表；创建 Agent 时复用连接并注册工具
     * 停用：保存配置后关闭现有连接
     */
    public synchronized McpVO setEnabled(
            String name, boolean enabled) {

        McpServerConfig original = requireConfig(name);

        if (original.enabled() == enabled) {
            return toVO(original);
        }

        McpServerConfig updated =
                original.withEnabled(enabled);

        configs.put(name, updated);

        try {
            save();
        } catch (RuntimeException e) {
            configs.put(name, original);
            throw e;
        }

        if (!enabled) {
            try {
                disconnect(name);
            } catch (RuntimeException e) {
                // 关闭失败：恢复启用配置
                configs.put(name, original);
                try {
                    save();
                } catch (RuntimeException rollbackError) {
                    e.addSuppressed(rollbackError);
                }
                throw e;
            }
        } else {
            errors.remove(name);
            try {
                connect(updated);
            } catch (RuntimeException e) {
                // 保留启用状态和错误信息，后续创建 Agent 时可以再次连接。
                log.warn("MCP 启用后连接失败: {}", name, e);
            }
        }

        log.info("MCP {}: {}",
                enabled ? "启用" : "停用", name);

        return toVO(updated);
    }

    /**
     * 创建 Agent 时调用：
     * 懒连接所有已启用的 MCP，并注册到 Toolkit
     */
    public synchronized void registerTo(Toolkit toolkit) {
        Objects.requireNonNull(toolkit, "toolkit");

        for (McpServerConfig config : configs.values()) {

            if (!config.enabled()) {
                continue;
            }

            String name = config.name();

            try {
                McpClientWrapper client = clients.get(name);

                if (client == null) {
                    client = connect(config);
                }

                toolkit.registerMcpClient(client)
                        .block(TIMEOUT);

                errors.remove(name);

                log.info("MCP 工具注册成功: {}, 工具数: {}",
                        name, toolCounts.getOrDefault(name, 0));

            } catch (Exception e) {
                errors.put(name, errorMessage(e));

                log.error("MCP 工具注册失败: {}", name, e);

                // 如果客户端连接已失效，下次允许重建
                McpClientWrapper client = clients.get(name);
                if (client != null && !client.isInitialized()) {
                    try {
                        disconnect(name);
                    } catch (Exception closeError) {
                        log.warn("清理 MCP 失败: {}", name,
                                closeError);
                    }
                    errors.put(name, errorMessage(e));
                }
            }
        }
    }

    /**
     * 创建 MCP Client
     */
    private McpClientWrapper connect(McpServerConfig config) {
        String name = config.name();

        McpClientWrapper existing = clients.get(name);

        if (existing != null) {
            return existing;
        }

        McpClientBuilder builder =
                McpClientBuilder.create(name)
                        .timeout(TIMEOUT)
                        .initializationTimeout(TIMEOUT);

        switch (config.type()) {

            case "stdio" -> builder.stdioTransport(
                    config.command(),
                    config.args(),
                    config.env()
            );

            case "streamable-http" -> {
                builder.streamableHttpTransport(config.url());
                config.headers().forEach(builder::header);
            }

            case "sse" -> {
                builder.sseTransport(config.url());
                config.headers().forEach(builder::header);
            }

            default -> throw new IllegalArgumentException(
                    "不支持的 MCP 类型: " + config.type());
        }

        McpClientWrapper client = null;

        try {
            client = builder.buildAsync().block(TIMEOUT);

            if (client == null) {
                throw new IllegalStateException(
                        "MCP Client 创建结果为空: " + name);
            }

            // 初始化 MCP 协议连接
            if (!client.isInitialized()) {
                client.initialize().block(TIMEOUT);
            }

            // 获取工具列表并缓存数量
            var tools = client.listTools().block(TIMEOUT);

            int count = tools == null ? 0 : tools.size();

            List<McpToolVO> details = tools == null
                    ? List.of()
                    : tools.stream()
                    .map(tool -> new McpToolVO(
                            tool.name(),
                            tool.description() == null ? "" : tool.description()
                    ))
                    .toList();

            clients.put(name, client);
            toolCounts.put(name, count);
            toolDetails.put(name, details);
            errors.remove(name);

            log.info("MCP 连接成功: {}, 工具数量: {}",
                    name, count);

            return client;

        } catch (Exception e) {
            if (client != null) {
                try {
                    client.close();
                } catch (Exception closeError) {
                    e.addSuppressed(closeError);
                }
            }

            toolCounts.remove(name);
            toolDetails.remove(name);
            errors.put(name, errorMessage(e));

            throw new IllegalStateException(
                    "MCP 连接失败: " + name, e);
        }
    }

    /**
     * 断开 MCP Client
     */
    private void disconnect(String name) {
        McpClientWrapper client = clients.get(name);

        if (client == null) {
            toolCounts.remove(name);
            toolDetails.remove(name);
            errors.remove(name);
            return;
        }

        try {
            client.close();

            clients.remove(name);
            toolCounts.remove(name);
            toolDetails.remove(name);
            errors.remove(name);

            log.info("MCP 已断开: {}", name);

        } catch (Exception e) {
            errors.put(name, errorMessage(e));

            throw new IllegalStateException(
                    "MCP 关闭失败: " + name, e);
        }
    }

    /**
     * 查询配置
     */
    private McpServerConfig requireConfig(String name) {
        McpServerConfig config = configs.get(name);

        if (config == null) {
            throw new IllegalArgumentException(
                    "MCP Server 不存在: " + name);
        }

        return config;
    }

    /**
     * 转换 VO
     */
    private McpVO toVO(McpServerConfig config) {
        String name = config.name();

        String status;

        if (errors.containsKey(name)) {
            status = "ERROR";
        } else if (clients.containsKey(name)) {
            status = "CONNECTED";
        } else {
            status = "DISCONNECTED";
        }

        return new McpVO(
                name,
                config.type(),
                config.command(),
                config.args(),
                config.url(),
                config.enabled(),
                status,
                toolCounts.getOrDefault(name, 0),
                toolDetails.getOrDefault(name, List.of()),
                errors.get(name)
        );
    }

    /**
     * 校验配置
     */
    private void validate(McpDTO request) {
        if (request == null
                || request.name() == null
                || !request.name().matches(
                "[a-zA-Z0-9_-]{1,64}")) {
            throw new IllegalArgumentException(
                    "MCP 名称只能包含字母、数字、下划线和横线");
        }

        String type = request.type();

        if (type == null
                || !Set.of("stdio", "streamable-http", "sse")
                .contains(type)) {
            throw new IllegalArgumentException(
                    "不支持的 MCP 类型");
        }

        if ("stdio".equals(type)) {
            if (request.command() == null
                    || request.command().isBlank()) {
                throw new IllegalArgumentException(
                        "stdio 类型必须提供 command");
            }
        } else {
            if (request.url() == null
                    || request.url().isBlank()) {
                throw new IllegalArgumentException(
                        "远程 MCP 必须提供 URL");
            }

            try {
                URI uri = URI.create(request.url());

                if (!Set.of("http", "https")
                        .contains(uri.getScheme())) {
                    throw new IllegalArgumentException(
                            "MCP URL 必须使用 HTTP 或 HTTPS");
                }

                if (uri.getHost() == null) {
                    throw new IllegalArgumentException(
                            "MCP URL 缺少主机名");
                }
            } catch (IllegalArgumentException e) {
                throw new IllegalArgumentException(
                        "MCP URL 无效: " + e.getMessage(), e);
            }
        }
    }

    /**
     * 读取 mcp.json
     */
    private void load() throws IOException {
        if (!Files.exists(configPath)) {
            return;
        }

        Map<String, McpServerConfig> loaded =
                objectMapper.readValue(
                        configPath.toFile(),
                        new TypeReference<
                                Map<String, McpServerConfig>>() {}
                );

        configs.clear();

        if (loaded != null) {
            configs.putAll(loaded);
        }
    }

    /**
     * 持久化 MCP 配置
     */
    private void save() {
        try {
            Files.createDirectories(configPath.getParent());

            Path temp = Files.createTempFile(
                    configPath.getParent(),
                    "mcp-", ".tmp"
            );

            try {
                objectMapper.writerWithDefaultPrettyPrinter()
                        .writeValue(temp.toFile(), configs);

                try {
                    Files.move(
                            temp,
                            configPath,
                            StandardCopyOption.REPLACE_EXISTING,
                            StandardCopyOption.ATOMIC_MOVE
                    );
                } catch (AtomicMoveNotSupportedException e) {
                    Files.move(
                            temp,
                            configPath,
                            StandardCopyOption.REPLACE_EXISTING
                    );
                }
            } finally {
                Files.deleteIfExists(temp);
            }

        } catch (IOException e) {
            throw new IllegalStateException(
                    "保存 MCP 配置失败", e);
        }
    }

    private String errorMessage(Throwable e) {
        String message = e.getMessage();
        return message == null || message.isBlank()
                ? e.getClass().getSimpleName()
                : message;
    }

    /**
     * Spring Boot 关闭时释放 MCP 资源
     */
    @PreDestroy
    public synchronized void shutdown() {
        for (String name :
                new ArrayList<>(clients.keySet())) {
            try {
                disconnect(name);
            } catch (Exception e) {
                log.warn("MCP 关闭失败: {}", name, e);
            }
        }
    }
}
