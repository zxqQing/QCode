package com.qcode.project;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Data
public class ProjectMetadata {
    private String projectId;
    private String name;

    /** 主要项目路径 */
    private String rootPath;

    /** 额外允许访问的路径 */
    private List<String> additionalRoots = new ArrayList<>();

    /** 项目下的所有会话 ID */
    private List<String> sessionIds = new ArrayList<>();

    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private LocalDateTime lastOpenedAt;
}
