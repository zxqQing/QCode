package com.qcode.domain.vo;

import com.qcode.session.SessionTitleMetadata;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

@Data
public class ProjectVO {
    private String projectId;
    private String name;
    private String rootPath;
    private List<String> additionalRoots;
    private List<SessionTitleMetadata> sessions;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private LocalDateTime lastOpenedAt;
}
