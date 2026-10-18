package com.qcode.controller;

import com.qcode.domain.dto.McpDTO;
import com.qcode.domain.dto.McpEnabledDTO;
import com.qcode.domain.vo.McpVO;
import com.qcode.service.McpService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/mcp")
@CrossOrigin(origins = {"http://127.0.0.1:5173", "http://127.0.0.1:3000", "http://localhost:5173", "http://localhost:3000"})
@RequiredArgsConstructor
public class McpController {
    private final McpService mcpService;

    /**
     * 获取 MCP Server 列表
     */
    @GetMapping
    public List<McpVO> list() {
        return mcpService.list();
    }

    /**
     * 新增 MCP Server
     */
    @PostMapping
    public McpVO add(@RequestBody McpDTO request) {
        return mcpService.add(request);
    }

    /**
     * 删除 MCP Server
     */
    @DeleteMapping("/{name}")
    public void delete(@PathVariable String name) {
        mcpService.delete(name);
    }

    /**
     * 启用 / 停用 MCP Server
     */
    @PutMapping("/{name}/enabled")
    public McpVO setEnabled(@PathVariable String name, @RequestBody McpEnabledDTO request) {
        return mcpService.setEnabled(name, request.enabled());
    }
}
