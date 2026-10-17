package com.qcode.service.impl;

import com.qcode.domain.vo.PermissionVO;
import com.qcode.permission.PermissionMode;
import com.qcode.permission.PermissionManager;
import com.qcode.service.PermissionService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class PermissionServiceImpl implements PermissionService {
    private final PermissionManager permissionManager;
    @Override
    public PermissionVO getPermissions() {
        PermissionMode mode = permissionManager.getPermissionMode();
        return PermissionVO.builder()
                .currentMode(mode.name())
                .description(mode.getDescription())
                .detail(mode.getDetail())
                .build();
    }

    @Override
    public PermissionVO updatePermission(PermissionMode mode) {
        permissionManager.updatePermissionMode(mode);

        return PermissionVO.builder()
                .currentMode(mode.name())
                .description(mode.getDescription())
                .detail(mode.getDetail())
                .build();
    }
}
