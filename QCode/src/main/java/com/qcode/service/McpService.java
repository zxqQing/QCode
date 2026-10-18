package com.qcode.service;

import com.qcode.domain.dto.McpDTO;
import com.qcode.domain.vo.McpVO;

import java.util.List;

public interface McpService {
    List<McpVO> list();

    McpVO add(McpDTO request);

    void delete(String name);

    McpVO setEnabled(String name, boolean enabled);
}
