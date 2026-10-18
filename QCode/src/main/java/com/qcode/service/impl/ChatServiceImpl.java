package com.qcode.service.impl;

import com.qcode.agent.AgentManager;
import com.qcode.agent.ApprovalAgent;
import com.qcode.domain.dto.ConfirmDTO;
import com.qcode.diff.SessionDiffService;
import com.qcode.permission.PermissionManager;
import com.qcode.permission.PermissionMode;
import com.qcode.project.ProjectManager;
import com.qcode.service.ChatService;
import com.qcode.service.SkillService;
import com.qcode.session.ExecutionStatus;
import com.qcode.session.SessionExecution;
import com.qcode.session.SessionTitleManager;
import com.qcode.session.SessionTitleMetadata;
import io.agentscope.core.agent.RuntimeContext;
import io.agentscope.core.event.*;
import io.agentscope.core.message.*;
import io.agentscope.core.state.AgentState;
import io.agentscope.harness.agent.HarnessAgent;
import io.agentscope.harness.agent.filesystem.AbstractFilesystem;
import io.agentscope.harness.agent.filesystem.model.FileUploadResponse;
import io.agentscope.harness.agent.filesystem.model.WriteResult;
import io.agentscope.harness.agent.tool.PlanModeTools;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Flux;
import reactor.core.scheduler.Schedulers;

import java.io.IOException;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Service
@RequiredArgsConstructor
public class ChatServiceImpl implements ChatService {
    private static final String ATTACHMENT_DIRECTORY = "attachments/";
    private final PermissionManager permissionManager;
    private final ProjectManager projectManager;
    private final AgentManager agentManager;
    private final SessionTitleManager sessionTitleManager;
    private final ApprovalAgent approvalAgent;
    private final SessionDiffService sessionDiffService;
    private final SkillService skillService;
    private final Map<String, HarnessAgent> sessionAgents = new ConcurrentHashMap<>();
    private final Map<String, SessionExecution> sessionExecutions = new ConcurrentHashMap<>();
    @Override
    public Flux<AgentEvent> chat(String message, String sessionId, String projectId,
                                 String skill, boolean planMode, List<MultipartFile> files) throws IOException {
        if (sessionId == null || !sessionId.matches("[A-Za-z0-9_-]+")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "会话 ID 无效");
        }
        List<ChatAttachment> attachments = prepareAttachments(sessionId, files);
        if ((message == null || message.isBlank()) && attachments.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "消息和附件不能同时为空");
        }
        String prompt = withSelectedSkill(message == null ? "" : message, skill);

        // 在向现有会话写入文件之前，先验证会话归属权
        SessionTitleMetadata metadata = sessionTitleManager.load(sessionId);
        if (metadata != null && metadata.projectId() != null && !sameProject(metadata.projectId(), projectId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "会话不属于指定项目：" + sessionId);
        }
        RuntimeContext context = RuntimeContext.builder().userId("qing").sessionId(sessionId).build();
        if (!attachments.isEmpty()) {
            uploadAttachments(projectId, sessionId, context, attachments);
        }

        if (metadata == null) {
            metadata = sessionTitleManager.create(sessionId, projectId);
            sessionTitleManager.save(metadata);
            if (projectId != null && !projectId.isBlank()) {
                projectManager.addSessionIfAbsent(projectId, sessionId);
            }
        } else if (metadata.projectId() == null && projectId != null && !projectId.isBlank()) {
            sessionTitleManager.assignProject(metadata, projectId);
            projectManager.addSessionIfAbsent(projectId, sessionId);
        }
        try {
            sessionDiffService.beginTurn(sessionId, projectId);
        } catch (Exception error) {
            // Diff capture must not prevent a normal chat request from running.
            log.warn("创建本轮文件 Diff 基线失败，聊天继续执行，sessionId={}", sessionId, error);
        }
        List<ContentBlock> blocks = new ArrayList<>();
        blocks.add(TextBlock.builder().text(withAttachmentPaths(prompt, attachments)).build());
        for (ChatAttachment attachment : attachments) {
            if (attachment.imageMediaType() != null) {
                blocks.add(ImageBlock.builder()
                        .source(Base64Source.builder()
                                .data(Base64.getEncoder().encodeToString(attachment.content()))
                                .mediaType(attachment.imageMediaType())
                                .build())
                        .build());
            }
        }
        Msg userMessage = Msg.builder().role(MsgRole.USER).content(blocks).build();
        HarnessAgent agent = agentManager.createAgent(projectId,sessionId);
        // 前端始终显式传递本会话的模式；关闭后在下一轮开始前退出持久化的计划状态。
        boolean planModeActive = agent.isPlanModeActive(context);
        if (planMode && !planModeActive) {
            agent.enterPlanMode(context);
        } else if (!planMode && planModeActive) {
            agent.exitPlanMode(context);
        }
        String key = agentKey(sessionId, projectId);
        SessionExecution sessionExecution = new SessionExecution(sessionId,projectId,agent);
        // 每轮对话 新建一个 同一个session 也只能有一个
        sessionExecutions.putIfAbsent(agentKey(sessionId,projectId),sessionExecution);

        return agentLoop(userMessage, sessionId, projectId);

    }

    private List<ChatAttachment> prepareAttachments(String sessionId, List<MultipartFile> files) throws IOException {
        if (files == null || files.isEmpty()) {
            return List.of();
        }
        List<ChatAttachment> attachments = new ArrayList<>(files.size());
        for (MultipartFile file : files) {
            String originalName = file == null ? null : file.getOriginalFilename();
            if (originalName == null || originalName.isBlank() || originalName.length() > 180
                    || originalName.equals(".") || originalName.equals("..")
                    || originalName.indexOf('/') >= 0 || originalName.indexOf('\\') >= 0
                    || originalName.chars().anyMatch(ch -> Character.isISOControl((char) ch))) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "附件文件名无效");
            }
            String safeName = originalName.strip()
                    .replaceAll("[^\\p{L}\\p{N}._() +\\-]", "_")
                    .replaceAll("[. ]+$", "");
            if (safeName.isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "附件文件名无效");
            }
            String path = ATTACHMENT_DIRECTORY + sessionId + "/" + UUID.randomUUID() + "_" + safeName;
            attachments.add(new ChatAttachment(path, file.getBytes(), imageMediaType(file, safeName)));
        }
        return attachments;
    }

    private String imageMediaType(MultipartFile file, String fileName) {
        String contentType = file.getContentType();
        if (contentType != null) {
            String mediaType = contentType.split(";", 2)[0].trim().toLowerCase(Locale.ROOT);
            if (mediaType.startsWith("image/")) {
                return mediaType;
            }
            if (!mediaType.isBlank() && !mediaType.equals("application/octet-stream")) {
                return null;
            }
        }
        String lowerName = fileName.toLowerCase(Locale.ROOT);
        if (lowerName.endsWith(".png")) return "image/png";
        if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) return "image/jpeg";
        if (lowerName.endsWith(".webp")) return "image/webp";
        if (lowerName.endsWith(".gif")) return "image/gif";
        return null;
    }

    private void uploadAttachments(String projectId, String sessionId, RuntimeContext context,
                                   List<ChatAttachment> attachments) throws IOException {
        AbstractFilesystem filesystem = agentManager.createFilesystem(projectId, sessionId);
        List<Map.Entry<String, byte[]>> upload = attachments.stream()
                .map(attachment -> Map.entry(attachment.path(), attachment.content()))
                .toList();
        List<FileUploadResponse> results;
        try {
            results = filesystem.uploadFiles(context, upload);
        } catch (RuntimeException error) {
            cleanupAttachments(filesystem, context, attachments);
            throw error;
        }
        Set<String> expectedPaths = new HashSet<>();
        attachments.forEach(attachment -> expectedPaths.add(attachment.path()));
        boolean success = results != null && results.size() == attachments.size()
                && results.stream().allMatch(result -> result != null && result.isSuccess()
                && expectedPaths.contains(result.path()))
                && results.stream().map(FileUploadResponse::path).distinct().count() == attachments.size();
        if (!success) {
            cleanupAttachments(filesystem, context, attachments);
            boolean denied = results != null && results.stream().anyMatch(result -> result != null
                    && "permission_denied".equals(result.error()));
            throw new ResponseStatusException(denied ? HttpStatus.FORBIDDEN : HttpStatus.INTERNAL_SERVER_ERROR,
                    "附件上传失败");
        }
    }

    private void cleanupAttachments(AbstractFilesystem filesystem, RuntimeContext context,
                                    List<ChatAttachment> attachments) {
        for (ChatAttachment attachment : attachments) {
            try {
                WriteResult result = filesystem.delete(context, attachment.path());
                if (result == null || !result.isSuccess()) {
                    log.warn("清理上传附件失败: {}, error={}", attachment.path(),
                            result == null ? "no_result" : result.error());
                }
            } catch (RuntimeException error) {
                log.warn("清理上传附件失败: {}", attachment.path(), error);
            }
        }
    }

    private String withAttachmentPaths(String prompt, List<ChatAttachment> attachments) {
        if (attachments.isEmpty()) return prompt;
        StringBuilder text = new StringBuilder(prompt);
        text.append("\n\n已上传附件。请按需读取以下路径：\n");
        for (ChatAttachment attachment : attachments) {
            text.append("- ").append(attachment.path()).append('\n');
        }
        return text.toString();
    }


    private String withSelectedSkill(String message, String skill) throws IOException {
        if (skill == null || skill.isBlank()) {
            return message;
        }
        skillService.getSkill(skill);
        return "<qcode-selected-skill name=\"" + skill + "\">\n"
                + "用户已明确选择此技能。必须先通过 load_skill_through_path 加载它，再处理用户请求。\n"
                + "</qcode-selected-skill>\n"
                + message;
    }

    @Override
    public Flux<AgentEvent> confirmTool(ConfirmDTO dto) {
        List<ConfirmResult> confirmResults = dto.getToolCalls().stream()
                .map(tc -> new ConfirmResult(
                        dto.isConfirmed(),
                        dto.isConfirmed() ? tc : null,
                        null
                ))
                .toList();

        UserMessage confirmMsg = UserMessage.builder()
                .metadata(Map.of(Msg.METADATA_CONFIRM_RESULTS, confirmResults))
                .build();
        // 获取 这次 会话的 SessionExecution
        SessionExecution sessionExecution = sessionExecutions.get(agentKey(dto.getSessionId(), dto.getProjectId()));
        HarnessAgent agent = sessionExecution.getAgent();
        if (agent == null) {
            return Flux.error(new IllegalStateException("会话不存在或没有待审批任务"));
        }
        // 把 下轮loop的状态标记成 RUNNING
        sessionExecution.setStatus(ExecutionStatus.RUNNING);
        return agentLoop(confirmMsg, dto.getSessionId(), dto.getProjectId());

    }

    @Override
    public void stop(String sessionId, String projectId) {
        String key = agentKey(sessionId, projectId);
        SessionExecution sessionExecution = sessionExecutions.get(key);
        if (sessionExecution == null){
            throw new RuntimeException("不存在SessionExecution");
        }
        sessionExecution.stop();

    }



    public Flux<AgentEvent> agentLoop(Msg message, String sessionId, String projectId){
        RuntimeContext ctx = RuntimeContext.builder().userId("qing")
                .sessionId(sessionId).build();
        SessionExecution sessionExecution = sessionExecutions.get(agentKey(sessionId, projectId));
        HarnessAgent agent = sessionExecution.getAgent();
        return agent.streamEvents(message, ctx)
                .subscribeOn(Schedulers.boundedElastic())
                .concatMap(event -> {
                    if (!(event instanceof RequireUserConfirmEvent confirm)) {
                        return Flux.just(event);
                    }
                    // 需要审批 把 状态设置成  WAITING_APPROVAL 表示这轮循环 不是正常结束 而是因为工具调用审批
                    sessionExecution.setStatus(ExecutionStatus.WAITING_APPROVAL);
                    if (permissionManager.getPermissionMode() != PermissionMode.AUTO) {
                        return Flux.just(event);
                    }
                    // plan_exit 是计划批准，必须由用户人工决定，任何模式下都不走 AI 审批
                    boolean planExit = confirm.getToolCalls().stream()
                            .anyMatch(call -> PlanModeTools.PLAN_EXIT.equals(call.getName()));
                    if (planExit) {
                        return Flux.just(event);
                    }
                    List<ConfirmResult> results = new ArrayList<>();
                    for (ToolUseBlock call : confirm.getToolCalls()) {
                        Boolean isApproved;
                        try {
                            isApproved = approvalAgent.run(
                                    "请审批以下工具调用：\n"
                                            + "工具名：" + call.getName() + "\n"
                                            + "输入参数：" + call.getInput()+ "\n"
                                            + "内容：" + call.getContent()
                            );
                        } catch (RuntimeException error) {
                            return Flux.just(event);
                        }
                        if (!Boolean.TRUE.equals(isApproved)) {
                            return Flux.just(event);
                        }
                        results.add(new ConfirmResult(true, call));

                    }
                    UserMessage confirmMsg = UserMessage.builder()
                            .metadata(Map.of(Msg.METADATA_CONFIRM_RESULTS, results))
                            .build();
                    // 判断 所有的 工具 都通过ai审批 之后 把 状态设置为 RUNNING
                    sessionExecution.setStatus(ExecutionStatus.RUNNING);
                    return agentLoop(confirmMsg, sessionId, projectId);
                })
//                .doOnComplete(() -> {
//                    SessionTitleMetadata metadata = sessionTitleManager.incrementRoundCount(sessionId);
//                    if (metadata.roundCount() == 1 || metadata.roundCount() == 3) {
//                        AgentState state = agent.getDelegate().getAgentState("qing", sessionId);
//                        if (state != null) {
//                            List<Msg> context = state.getContext();
//                            sessionTitleManager.isExtractTitle(sessionId, context);
//                        }
//                    }
//                });
                .doFinally(signal -> {

                    if (sessionExecution.getStatus().equals(ExecutionStatus.STOPPED)){
                        sessionExecutions.remove(agentKey(sessionId, projectId));
                        return;
                    }
                    // 用 CAS 把 RUNNING 改成 FINISHED，只有第一次成功的才能进去
                    if (!sessionExecution.getStatus().compareAndSet(ExecutionStatus.RUNNING, ExecutionStatus.COMPLETED)) {
                        // 已经被其他层抢先改了，说明清理已经做过了，直接返回
                        return;
                    }
                    // 只有RUNNING状态才能 移除 SessionExecution 并 轮次+1
                    sessionExecutions.remove(agentKey(sessionId, projectId));
                    log.info("本轮对话流终止 sessionId={}, projectId={}, signal={}", sessionId, projectId, signal);
                    SessionTitleMetadata metadata = sessionTitleManager.incrementRoundCount(sessionId);
                    if (metadata.roundCount() == 1 || metadata.roundCount() == 3) {
                        AgentState state = agent.getDelegate().getAgentState("qing", sessionId);
                        if (state != null) {
                            sessionTitleManager.isExtractTitle(sessionId, state.getContext());
                        }
                    }
                });
    }

    private boolean sameProject(String left, String right) {
        String normalizedLeft = left == null || left.isBlank() ? null : left;
        String normalizedRight = right == null || right.isBlank() ? null : right;
        return java.util.Objects.equals(normalizedLeft, normalizedRight);
    }

    private String agentKey(String sessionId, String projectId) {
        return (projectId == null || projectId.isBlank() ? "default" : projectId) + ":" + sessionId;
    }
    private record ChatAttachment(String path, byte[] content, String imageMediaType) {}

}
