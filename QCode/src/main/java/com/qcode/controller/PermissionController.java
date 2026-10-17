package com.qcode.controller;

import com.qcode.domain.dto.PermissionUpdateDTO;
import com.qcode.domain.vo.PermissionVO;
import com.qcode.service.PermissionService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/permission")
@CrossOrigin(origins = {"http://127.0.0.1:5173", "http://127.0.0.1:3000", "http://localhost:5173", "http://localhost:3000"})
@RequiredArgsConstructor
public class PermissionController {

    private final PermissionService permissionService;

    /**
     * 查询当前权限模式及权限列表
     */
    @GetMapping("list")
    public PermissionVO getPermissions() {
        return permissionService.getPermissions();
    }
    /**
     * 切换权限模式
     */
    @PutMapping
    public PermissionVO updatePermission(@RequestBody PermissionUpdateDTO dto) {
        return permissionService.updatePermission(dto.getMode());
    }
}
