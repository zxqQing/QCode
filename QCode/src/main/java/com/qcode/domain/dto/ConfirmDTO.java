package com.qcode.domain.dto;

import io.agentscope.core.message.ToolUseBlock;
import lombok.Data;

import java.util.List;

@Data
public class ConfirmDTO {
    /** 会话ID，必须和之前 /chat 调用时一致 */
    private String sessionId;

    /** 项目ID，必须和之前 /chat 调用时一致；无项目会话可为空 */
    private String projectId;

    /** 用户是否允许执行 */
    private boolean confirmed;

    /** 待确认的工具调用列表 */
    private List<ToolUseBlock> toolCalls;
}
