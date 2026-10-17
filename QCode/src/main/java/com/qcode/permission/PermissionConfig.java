package com.qcode.permission;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class PermissionConfig {
    private PermissionMode mode = PermissionMode.MANUAL;
}