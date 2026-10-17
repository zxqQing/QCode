package com.qcode.domain.dto;

import com.qcode.permission.PermissionMode;
import lombok.Data;

@Data
public class PermissionUpdateDTO {
    private PermissionMode mode;
}
