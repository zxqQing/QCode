package com.qcode.domain.dto;

import java.util.List;
import java.util.Map;

public record McpDTO(
        String name,
        String type,
        String command,
        List<String> args,
        String url,
        Map<String, String> env,
        Map<String, String> headers
) {}
