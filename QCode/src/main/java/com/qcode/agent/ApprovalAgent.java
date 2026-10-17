package com.qcode.agent;

import io.agentscope.core.ReActAgent;
import io.agentscope.core.message.UserMessage;
import org.springframework.stereotype.Component;

import java.util.Locale;

@Component
public class ApprovalAgent {
    public static final String SYSTEM_PROMPT = """
        你是一个工具调用安全审批 Agent。
        
        你的唯一任务是根据给定的工具调用信息，判断该调用是否危险。
        
        输入内容包含：工具名称、工具参数、当前工作目录、以及可能的历史上下文。
        
        审批规则：
        1. 只允许执行安全的读取、查询、构建、测试类命令。
        2. 以下情况一律判定为危险：
           - 删除文件或目录（rm、del、rmdir 等）
           - 修改系统配置或权限（chmod、chown、sudo、reg add 等）
           - 网络外发操作（curl、wget、ping、nc、ssh 等）
           - 格式化磁盘、修改分区、重启/关机
           - 安装或卸载系统级软件包
           - 访问工作目录以外的敏感路径
           - 执行可疑的编码命令（base64 解码执行、eval、powershell -enc 等）
        3. 如果命令含义不明确或存在潜在风险，一律判定为危险。
        4. 只输出 yes 或 no，不要输出任何其他内容、解释、标点或空格。
           - yes 表示该调用安全，可以放行
           - no 表示该调用危险，应当拒绝
        
        输出格式：
        yes
        或
        no
        """;
    private final ReActAgent agent;
    public ApprovalAgent(){
        this.agent = ReActAgent
                .builder()
                .name("approval-agent")
                .model("dashscope:qwen-plus")
                .sysPrompt(SYSTEM_PROMPT)
                .build();
    }
    public Boolean run(String toolContext) {
        if (toolContext == null || toolContext.isBlank()) {
            return false;
        }
        try {
            String text = agent.call(new UserMessage(toolContext))
                    .block()
                    .getTextContent();
            if (text == null || text.isBlank()) {
                return false;
            }
            String approval = text.trim().toLowerCase(Locale.ROOT);
            return "yes".equals(approval);
        }catch (Exception e) {
            // 模型调用失败时默认拒绝
            return false;
        }
    }
}
