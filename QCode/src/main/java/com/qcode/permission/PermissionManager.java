package com.qcode.permission;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import io.agentscope.core.permission.*;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

@Component
public class PermissionManager {
    ObjectMapper objectMapper = new ObjectMapper().registerModule(new JavaTimeModule())
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

    private final Path permissionPath = Path.of(System.getProperty("user.home"))
            .resolve(".qcode")
            .resolve("config")
            .resolve("Permission.json");
    public PermissionContextState createPermissionContext() {

        PermissionContextState.Builder builder = PermissionContextState.builder()
                .mode(io.agentscope.core.permission.PermissionMode.DEFAULT);

        // 只读文件工具：允许
        addRule(builder, "read_file", PermissionBehavior.ALLOW);
        addRule(builder, "list_files", PermissionBehavior.ALLOW);
        addRule(builder, "glob_files", PermissionBehavior.ALLOW);
        addRule(builder, "grep_files", PermissionBehavior.ALLOW);

        // 文件写入和编辑：需要确认
        addRule(builder, "write_file", PermissionBehavior.ASK);
        addRule(builder, "edit_file", PermissionBehavior.ASK);
        // shell 需要确认
        addRule(builder,"execute",PermissionBehavior.ASK);


        return builder.build();
    }

    private void addRule(PermissionContextState.Builder builder, String toolName, PermissionBehavior behavior) {
        PermissionRule rule = new PermissionRule(
                toolName,
                null,
                behavior,
                "qcode-default"
        );

        switch (behavior) {
            case ALLOW -> builder.addAllowRule(toolName, rule);
            case ASK -> builder.addAskRule(toolName, rule);
            case DENY -> builder.addDenyRule(toolName, rule);
        }
    }
    /**
     * 获取当前权限模式
     */
    public synchronized PermissionMode getPermissionMode() {
        return readConfig().getMode();
    }
    /**
     * 修改权限模式并保存到文件
     */
    public synchronized void updatePermissionMode(PermissionMode mode) {
        if (mode == null) {
            throw new IllegalArgumentException("权限模式不能为空");
        }

        writeConfig(new PermissionConfig(mode));
    }
    /**
     * 读取权限配置，不存在时创建默认配置
     */
    private PermissionConfig readConfig() {
        try {
            if (Files.notExists(permissionPath)) {
                PermissionConfig config = new PermissionConfig(PermissionMode.MANUAL);
                writeConfig(config);
                return config;
            }
            PermissionConfig config = objectMapper.readValue(
                    permissionPath.toFile(),
                    PermissionConfig.class
            );

            if (config.getMode() == null) {
                return new PermissionConfig(PermissionMode.MANUAL);
            }

            return config;
        } catch (IOException e) {
            throw new IllegalStateException("读取权限配置失败", e);
        }
    }
    /**
     * 保存权限配置
     */
    private void writeConfig(PermissionConfig config) {
        try {
            Files.createDirectories(permissionPath.getParent());
            objectMapper.writerWithDefaultPrettyPrinter()
                    .writeValue(permissionPath.toFile(), config);
        } catch (IOException e) {
            throw new IllegalStateException("保存权限配置失败", e);
        }
    }

}
