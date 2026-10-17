package com.qcode.session;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.qcode.agent.SubAgent;
import io.agentscope.core.message.Msg;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.stream.Stream;
@Component
public class SessionTitleManager {
    private final Path metadataDir;
    private final ObjectMapper objectMapper;

    public SessionTitleManager() {
        this.metadataDir = Path.of(System.getProperty("user.home"))
                .resolve(".qcode")
                .resolve("title");
        this.objectMapper = new ObjectMapper()
                .registerModule(new JavaTimeModule())
                .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
    }
    // 判断 并 生成标题
    public void isExtractTitle(String sessionId, List<Msg> context) {
        SessionTitleMetadata metadata = load(sessionId);
        // 元数据不存在，或者禁止自动更新标题
        if (metadata == null || !metadata.autoTitleEnabled()) {
            return;
        }
        int roundCount = metadata.roundCount();
        // 仅在第 1 轮和第 3 轮提取标题
        if (roundCount != 1 && roundCount != 3) {
            return;
        }
        // 生成标题
        String title = new SubAgent().run(context);
        if (title == null || title.isBlank()) {
            return;
        }
        // 更新标题元数据
        updateTitle(metadata, title, TitleSource.AUTO);
    }
    public SessionTitleMetadata incrementRoundCount(String sessionId) {
        SessionTitleMetadata metadata = load(sessionId);
        // 元数据不存在，先创建
        if (metadata == null) {
            metadata = create(sessionId);
        }
        // 已完成一轮用户对话，轮次加 1
        metadata = updateRoundCount(metadata, metadata.roundCount() + 1);
        // 持久化元数据
        save(metadata);
        return metadata;
    }
    /**
     * 加载会话元数据。
     * 文件不存在时返回 null。
     */
    public SessionTitleMetadata load(String sessionId) {
        Path path = getMetadataPath(sessionId);

        if (!Files.exists(path)) {
            return null;
        }

        try {
            return objectMapper.readValue(
                    path.toFile(),
                    SessionTitleMetadata.class
            );
        } catch (IOException e) {
            throw new UncheckedIOException("加载会话元数据失败：" + sessionId, e);
        }
    }
    /**
     * 创建默认会话元数据，不负责持久化。
     */
    public SessionTitleMetadata create(String sessionId) {
        return create(sessionId, null);
    }

    public SessionTitleMetadata create(String sessionId, String projectId) {
        LocalDateTime now = LocalDateTime.now();
        return new SessionTitleMetadata(sessionId, null, TitleSource.AUTO,
                0, true, 0, now, now, projectId);
    }
    /**
     * 更新已完成的对话轮次。
     * 不修改原有对象，而是返回一个新的 record。
     */
    public SessionTitleMetadata updateRoundCount(SessionTitleMetadata metadata, int roundCount) {
        if (metadata == null) {
            throw new IllegalArgumentException("会话元数据不能为空");
        }
        if (roundCount < 0) {
            throw new IllegalArgumentException("对话轮次不能小于 0");
        }

        return new SessionTitleMetadata(metadata.sessionId(), metadata.title(), metadata.titleSource(),
                metadata.autoTitleCount(), metadata.autoTitleEnabled(),
                roundCount, metadata.createdAt(), LocalDateTime.now(), metadata.projectId()
        );
    }
    /**
     * 保存会话元数据。
     */
    public void save(SessionTitleMetadata metadata) {
        if (metadata == null) {
            throw new IllegalArgumentException("会话元数据不能为空");
        }
        Path path = getMetadataPath(metadata.sessionId());
        try {
            Files.createDirectories(metadataDir);
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(path.toFile(), metadata);
        } catch (IOException e) {
            throw new UncheckedIOException(
                    "保存会话元数据失败：" + metadata.sessionId(), e
            );
        }
    }

    public void delete(String sessionId) {
        Path path = getMetadataPath(sessionId);
        try {
            if (Files.exists(path)) Files.delete(path);
        } catch (IOException e) {
            throw new UncheckedIOException("删除会话元数据失败：" + sessionId, e);
        }
    }
    /**
     * 获取元数据文件路径。
     * 文件名格式：sessionId.title.json
     */
    private Path getMetadataPath(String sessionId) {
        if (sessionId == null || sessionId.isBlank()
                || sessionId.contains("/") || sessionId.contains("\\")
                || sessionId.equals(".") || sessionId.equals("..")) {
            throw new IllegalArgumentException("sessionId 不合法");
        }
        return metadataDir.resolve(sessionId + ".title.json");
    }

    public void updateTitle(SessionTitleMetadata metadata, String title, TitleSource titleSource) {
        if (metadata == null) {
            throw new IllegalArgumentException("会话元数据不能为空");
        }
        if (title == null || title.isBlank()) {
            throw new IllegalArgumentException("标题不能为空");
        }
        if (titleSource == null) {
            throw new IllegalArgumentException("标题来源不能为空");
        }
        LocalDateTime now = LocalDateTime.now();
        int autoTitleCount = metadata.autoTitleCount();
        boolean autoTitleEnabled = metadata.autoTitleEnabled();
        if (titleSource == TitleSource.AUTO) {
            autoTitleCount++;
            autoTitleEnabled = autoTitleCount < 2;
        }
        if (titleSource == TitleSource.MANUAL){
            autoTitleEnabled = false;
        }
        SessionTitleMetadata updated = new SessionTitleMetadata(metadata.sessionId(), title.trim(), titleSource,
                autoTitleCount, autoTitleEnabled, metadata.roundCount(),
                metadata.createdAt(), now, metadata.projectId()
        );
        save(updated);
    }

    public SessionTitleMetadata assignProject(SessionTitleMetadata metadata, String projectId) {
        if (metadata == null) throw new IllegalArgumentException("会话元数据不能为空");
        SessionTitleMetadata updated = new SessionTitleMetadata(metadata.sessionId(), metadata.title(), metadata.titleSource(),
                metadata.autoTitleCount(), metadata.autoTitleEnabled(), metadata.roundCount(),
                metadata.createdAt(), LocalDateTime.now(), projectId);
        save(updated);
        return updated;
    }

    /** Remove a deleted project's ownership while keeping the session history. */
    public SessionTitleMetadata clearProject(SessionTitleMetadata metadata) {
        if (metadata == null || metadata.projectId() == null) return metadata;
        SessionTitleMetadata updated = new SessionTitleMetadata(metadata.sessionId(), metadata.title(), metadata.titleSource(),
                metadata.autoTitleCount(), metadata.autoTitleEnabled(), metadata.roundCount(),
                metadata.createdAt(), LocalDateTime.now(), null);
        save(updated);
        return updated;
    }

    /**
     * 获取当前工作区的所有会话，按更新时间倒序排列。
     */
    public List<SessionTitleMetadata> listSessions() {
        if (!Files.isDirectory(metadataDir)) {
            return List.of();
        }
        try (Stream<Path> paths = Files.list(metadataDir)) {
            return paths
                    .filter(Files::isRegularFile)
                    .filter(path -> path.getFileName().toString().endsWith(".title.json"))
                    .map(path -> {
                        String fileName = path.getFileName().toString();
                        String sessionId = fileName.substring(
                                0, fileName.length() - ".title.json".length());
                        return load(sessionId);
                    })
                    .filter(Objects::nonNull)
                    .sorted(Comparator.comparing(
                            SessionTitleMetadata::updatedAt,
                            Comparator.nullsLast(Comparator.reverseOrder())))
                    .toList();
        } catch (IOException e) {
            throw new IllegalStateException("读取会话列表失败", e);
        }
    }

    /**
     * 打印当前工作区的会话列表，当前会话前标记 *。
     */
    public void printSessions(String currentSessionId) {
        List<SessionTitleMetadata> sessions = listSessions();
        if (sessions.isEmpty()) {
            System.out.println("当前工作区暂无会话。");
            return;
        }

        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
        System.out.printf("%-38s %-24s %-20s%n", "sessionId", "title", "updatedAt");
        System.out.println("-".repeat(86));
        for (SessionTitleMetadata metadata : sessions) {
            boolean current = metadata.sessionId().equals(currentSessionId);
            String sessionId = (current ? "* " : "  ") + metadata.sessionId();
            String title = metadata.title() == null ? "-" : metadata.title();
            String updatedAt = metadata.updatedAt() == null
                    ? "-"
                    : metadata.updatedAt().format(formatter);

            System.out.printf("%-38s %-24s %-20s%n",
                    sessionId, title, updatedAt);
        }
    }
}
