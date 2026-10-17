package com.qcode.session;

import java.time.LocalDateTime;

public record SessionTitleMetadata(
        String sessionId,
        String title,
        TitleSource titleSource,
        int autoTitleCount,
        boolean autoTitleEnabled, // 是否允许系统自动生成或更新标题
        int roundCount,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        String projectId
) { }
