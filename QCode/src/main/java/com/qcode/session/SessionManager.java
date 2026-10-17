package com.qcode.session;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.qcode.agent.AgentManager;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

@Slf4j
@Component
public class SessionManager {
    ObjectMapper objectMapper = new ObjectMapper().registerModule(new JavaTimeModule())
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

    /**
     * 会话记录已按项目工作区隔离，因此必须使用请求携带的 projectId 定位。
     * 不再回退到其他工作区，避免读取或删除同 ID 的其他项目会话。
     */
    private Path resolveSessionFile(String sessionId, String projectId) {
        validateSessionId(sessionId);
        if (projectId != null && !projectId.isBlank() && !projectId.matches("[A-Za-z0-9_-]+")) {
            throw new IllegalArgumentException("项目 ID 无效");
        }
        return sessionsDir(projectId).resolve(sessionId + ".jsonl");
    }

    /**
     * 指定归属项目（或默认工作区）下的框架会话记录目录。
     */
    private Path sessionsDir(String projectId) {
        return AgentManager.resolveWorkspaceBase(projectId)
                .resolve("qing")
                .resolve("agents")
                .resolve("QCode")
                .resolve("sessions");
    }

    public List<SessionMessage> getSessionById(String sessionId, String projectId){
        Path file = resolveSessionFile(sessionId, projectId);
        if (!Files.exists(file)) {
            return List.of();
        }
        List<SessionMessage> messages = new ArrayList<>();
        try (Stream<String> lines = Files.lines(file, StandardCharsets.UTF_8)) {
            lines.filter(line -> !line.isBlank())
                    .forEach(line -> {
                        try {
                            SessionMessage message = objectMapper.readValue(line, SessionMessage.class);
                            hideSelectedSkillDirective(message);
                            messages.add(message);
                        } catch (IOException e) {
                            log.warn("解析消息行失败, sessionId={}", sessionId, e);
                        }
                    });
        } catch (IOException e) {
            log.error("读取会话消息文件失败, sessionId={}", sessionId, e);
            return List.of();
        }
        return messages;
    }

    public boolean exists(String sessionId, String projectId) {
        return Files.exists(resolveSessionFile(sessionId, projectId));
    }

    /**
     * 从 AgentState（agent_state.json）读取会话历史，按块类型展开，保留思考/正文区分。
     * state 文件不存在时回退到 transcript jsonl。
     */
    public List<SessionMessage> getSessionMessagesFromState(String sessionId, String projectId) {
        Path stateFile = resolveStateFile(sessionId, projectId);
        if (!Files.exists(stateFile)) {
            return getSessionById(sessionId, projectId);
        }
        try {
            JsonNode root = objectMapper.readTree(Files.readString(stateFile, StandardCharsets.UTF_8));
            JsonNode context = root.path("context");
            if (!context.isArray()) {
                return List.of();
            }
            List<SessionMessage> result = new ArrayList<>();
            for (JsonNode msg : context) {
                String messageId = msg.path("id").asText(null);
                String role = msg.path("role").asText(null);
                String timestamp = msg.path("timestamp").asText(null);
                JsonNode blocks = msg.path("content");
                if (!blocks.isArray()) {
                    continue;
                }
                for (JsonNode block : blocks) {
                    String blockType = block.path("type").asText("");
                    SessionMessage sm = new SessionMessage();
                    sm.setBlockType(blockType);
                    sm.setMessageId(messageId);
                    sm.setRole(role);
                    sm.setTimestamp(timestamp);
                    switch (blockType) {
                        case "text" -> {
                            sm.setContent(block.path("text").asText(null));
                            hideSelectedSkillDirective(sm);
                        }
                        case "thinking" -> sm.setContent(block.path("thinking").asText(null));
                        case "tool_use" -> {
                            sm.setToolCallId(block.path("id").asText(null));
                            sm.setName(block.path("name").asText(null));
                            JsonNode inputNode = block.path("input");
                            if (inputNode.isObject()) {
                                sm.setInput(objectMapper.convertValue(inputNode, Map.class));
                            }
                            sm.setState(block.path("state").asText(null));
                        }
                        case "tool_result" -> {
                            sm.setToolCallId(block.path("id").asText(null));
                            sm.setName(block.path("name").asText(null));
                            // output 是 block 数组 [{type:"text", text:"..."}]，提取文本拼接
                            JsonNode outputNode = block.path("output");
                            if (outputNode.isArray()) {
                                StringBuilder sb = new StringBuilder();
                                for (JsonNode outBlock : outputNode) {
                                    String text = outBlock.path("text").asText("");
                                    if (!text.isEmpty()) {
                                        if (sb.length() > 0) sb.append("\n");
                                        sb.append(text);
                                    }
                                }
                                sm.setOutput(sb.length() > 0 ? sb.toString() : null);
                            }
                            sm.setState(block.path("state").asText(null));
                        }
                        default -> {
                            // 未知块类型跳过
                            continue;
                        }
                    }
                    result.add(sm);
                }
            }
            return result;
        } catch (IOException e) {
            log.error("读取 AgentState 失败, sessionId={}", sessionId, e);
            return getSessionById(sessionId, projectId);
        }
    }

    /**
     * 解析 AgentState 文件路径：workspaceBase/state/qing/sessionId/agent_state.json
     */
    private Path resolveStateFile(String sessionId, String projectId) {
        validateSessionId(sessionId);
        return AgentManager.resolveWorkspaceBase(projectId)
                .resolve("state").resolve("qing")
                .resolve(sessionId).resolve("agent_state.json");
    }

    public void deleteSession(String sessionId, String projectId) throws IOException {
        Path file = resolveSessionFile(sessionId, projectId);
        if (Files.exists(file)) Files.delete(file);
        if (projectId == null || projectId.isBlank()) deleteScratchDir(sessionId);
    }

    /**
     * 清理无项目会话的临时项目目录（整个子目录删除，best effort，失败仅告警）。
     */
    private void deleteScratchDir(String sessionId) {
        Path scratch = AgentManager.resolveScratchDir(sessionId);
        if (!Files.exists(scratch)) {
            return;
        }
        try (Stream<Path> paths = Files.walk(scratch)) {
            // 逆序遍历保证先删子内容再删目录本身
            paths.sorted(java.util.Comparator.reverseOrder()).forEach(path -> {
                try {
                    Files.delete(path);
                } catch (IOException e) {
                    log.warn("删除临时项目目录失败: {}", path, e);
                }
            });
        } catch (IOException e) {
            log.warn("遍历临时项目目录失败: {}", scratch, e);
        }
    }

    private void validateSessionId(String sessionId) {
        if (sessionId == null || !sessionId.matches("[A-Za-z0-9_-]+")) {
            throw new IllegalArgumentException("会话 ID 无效");
        }
    }

    private void hideSelectedSkillDirective(SessionMessage message) {
        if (!"USER".equalsIgnoreCase(message.getRole()) || message.getContent() == null
                || !message.getContent().startsWith("<qcode-selected-skill ")) {
            return;
        }
        String namePrefix = "name=\"";
        int nameStart = message.getContent().indexOf(namePrefix);
        if (nameStart >= 0) {
            nameStart += namePrefix.length();
            int nameEnd = message.getContent().indexOf('"', nameStart);
            if (nameEnd > nameStart) {
                message.setSkillName(message.getContent().substring(nameStart, nameEnd));
            }
        }
        String closingTag = "</qcode-selected-skill>\n";
        int contentStart = message.getContent().indexOf(closingTag);
        if (contentStart >= 0) {
            message.setContent(message.getContent().substring(contentStart + closingTag.length()));
        }
    }
}
