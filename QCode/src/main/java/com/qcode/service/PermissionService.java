package com.qcode.service;

import com.qcode.domain.vo.PermissionVO;
import com.qcode.permission.PermissionMode;

public interface PermissionService {
    PermissionVO getPermissions();

    PermissionVO updatePermission(PermissionMode mode);
}
