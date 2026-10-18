package com.qcode.mcp;

import java.util.List;
import java.util.Map;

public record McpServerConfig(
        String name,
        String type,
        String command,
        List<String> args,
        String url,
        Map<String, String> env,
        Map<String, String> headers,
        boolean enabled
) {
    public McpServerConfig withEnabled(boolean enabled) {
        return new McpServerConfig(
                name, type, command, args, url,
                env, headers, enabled
        );
    }
}