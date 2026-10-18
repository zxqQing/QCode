package com.qcode.domain.vo;

import java.util.List;

public record McpVO (
        String name,
        String type,
        String command,
        List<String> args,
        String url,
        boolean enabled,
        String status,
        int toolCount,
        List<McpToolVO> tools,
        String error
) {}
