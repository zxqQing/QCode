package com.qcode.domain.dto;

import lombok.Data;

@Data
public class RenameSessionDTO {
    private String sessionId;
    private String projectId;
    private String title;
}
