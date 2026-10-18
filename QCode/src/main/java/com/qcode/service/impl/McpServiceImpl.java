package com.qcode.service.impl;

import com.qcode.domain.dto.McpDTO;
import com.qcode.domain.vo.McpVO;
import com.qcode.mcp.McpManager;
import com.qcode.service.McpService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class McpServiceImpl implements McpService {

    private final McpManager mcpManager;

    @Override
    public List<McpVO> list() {
        return mcpManager.list();
    }

    @Override
    public McpVO add(McpDTO request) {
        return mcpManager.add(request);
    }

    @Override
    public void delete(String name) {
        mcpManager.delete(name);
    }

    @Override
    public McpVO setEnabled(String name, boolean enabled) {
        return mcpManager.setEnabled(name, enabled);
    }
}