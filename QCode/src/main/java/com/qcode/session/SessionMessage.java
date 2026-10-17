package com.qcode.session;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;

import java.util.Map;

@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class SessionMessage {

    /**
     * 块类型：前端据此决定渲染方式
     * text        - 正文（用户输入 / 助手回复）
     * thinking    - 思考过程（可折叠）
     * tool_use    - 工具调用
     * tool_result - 工具结果
     */
    private String blockType;

    /**
     * 所属消息 ID（同一条消息的多个 block 共享，前端可据此分组）
     */
    private String messageId;

    /**
     * 角色：USER / ASSISTANT / TOOL
     */
    private String role;

    /**
     * 时间戳（来自 AgentState context 消息的 timestamp 字段）
     */
    private String timestamp;

    // ==================== text / thinking 块 ====================

    /**
     * 文本内容（text 块是正文，thinking 块是思考）
     */
    private String content;

    /** 当前用户消息显式选择的技能名称。 */
    private String skillName;

    // ==================== tool_use / tool_result 共用 ====================

    /**
     * 工具调用 ID（tool_use 和 tool_result 通过此字段配对）
     */
    private String toolCallId;

    /**
     * 工具名称（如 write_file / execute）
     */
    private String name;

    // ==================== tool_use 块专用 ====================

    /**
     * 工具输入参数
     */
    private Map<String, Object> input;

    // ==================== tool_result 块专用 ====================

    /**
     * 工具输出文本
     */
    private String output;

    // ==================== tool_use / tool_result 共用 ====================

    /**
     * 工具调用状态：allowed / denied / pending
     */
    private String state;
}
