package com.qcode.domain.vo;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class PermissionVO {
    private String currentMode;
    private String description;
    private String detail;
}
