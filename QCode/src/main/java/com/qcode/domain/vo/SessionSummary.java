package com.qcode.domain.vo;

import com.qcode.session.TitleSource;

import java.time.LocalDateTime;

public record SessionSummary(
        String sessionId,
        String title,
        TitleSource titleSource,
        int autoTitleCount,
        boolean autoTitleEnabled,
        int roundCount,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        String projectId,
        String projectName
) { }
