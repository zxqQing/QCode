package com.qcode.service.impl;

import com.qcode.agent.AgentManager;
import com.qcode.agent.ApprovalAgent;
import com.qcode.diff.SessionDiffService;
import com.qcode.domain.dto.ConfirmDTO;
import com.qcode.permission.PermissionManager;
import com.qcode.permission.PermissionMode;
import com.qcode.project.ProjectManager;
import com.qcode.service.SkillService;
import com.qcode.session.SessionExecution;
import com.qcode.session.SessionTitleManager;
import com.qcode.session.SessionTitleMetadata;
import io.agentscope.core.agent.RuntimeContext;
import io.agentscope.core.event.AgentEvent;
import io.agentscope.core.event.RequireUserConfirmEvent;
import io.agentscope.core.message.Msg;
import io.agentscope.core.message.ToolUseBlock;
import io.agentscope.core.message.UserMessage;
import io.agentscope.harness.agent.HarnessAgent;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import reactor.core.publisher.Flux;

import java.time.Duration;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ChatServiceImplPermissionTest {
    @Mock PermissionManager permissionManager;
    @Mock ProjectManager projectManager;
    @Mock AgentManager agentManager;
    @Mock SessionTitleManager sessionTitleManager;
    @Mock ApprovalAgent approvalAgent;
    @Mock SessionDiffService sessionDiffService;
    @Mock SkillService skillService;
    @Mock HarnessAgent agent;
    @Mock SessionTitleMetadata metadata;

    private ChatServiceImpl service;

    @BeforeEach
    void setUp() {
        service = new ChatServiceImpl(permissionManager, projectManager, agentManager,
                sessionTitleManager, approvalAgent, sessionDiffService, skillService);
        lenient().when(sessionTitleManager.incrementRoundCount("session")).thenReturn(metadata);
        lenient().when(metadata.roundCount()).thenReturn(2);
    }

    @Test
    void manualModeAlwaysPassesConfirmationToUser() {
        RequireUserConfirmEvent confirmation = mock(RequireUserConfirmEvent.class);
        when(permissionManager.getPermissionMode()).thenReturn(PermissionMode.MANUAL);
        when(agent.streamEvents(any(Msg.class), any(RuntimeContext.class)))
                .thenReturn(Flux.<AgentEvent>just(confirmation));

        List<AgentEvent> events = run();

        assertEquals(1, events.size());
        assertSame(confirmation, events.get(0));
        verifyNoInteractions(approvalAgent);
        verify(confirmation, never()).getToolCalls();
        verify(agent, times(1)).streamEvents(any(Msg.class), any(RuntimeContext.class));
    }

    @Test
    void autoModeResumesOnlyWhenEveryToolCallIsApproved() {
        RequireUserConfirmEvent confirmation = confirmationWith(toolCall(), toolCall());
        AgentEvent continued = mock(AgentEvent.class);
        when(permissionManager.getPermissionMode()).thenReturn(PermissionMode.AUTO);
        when(approvalAgent.run(anyString())).thenReturn(true);
        when(agent.streamEvents(any(Msg.class), any(RuntimeContext.class)))
                .thenReturn(Flux.<AgentEvent>just(confirmation), Flux.just(continued));

        List<AgentEvent> events = run();

        assertEquals(1, events.size());
        assertSame(continued, events.get(0));
        verify(approvalAgent, times(2)).run(anyString());
        verify(agent, times(2)).streamEvents(any(Msg.class), any(RuntimeContext.class));
    }

    @Test
    void autoModePassesWholeRequestToUserWhenAiRejectsAnyCall() {
        RequireUserConfirmEvent confirmation = confirmationWith(toolCall(), toolCall());
        when(permissionManager.getPermissionMode()).thenReturn(PermissionMode.AUTO);
        when(approvalAgent.run(anyString())).thenReturn(true, false);
        when(agent.streamEvents(any(Msg.class), any(RuntimeContext.class)))
                .thenReturn(Flux.<AgentEvent>just(confirmation));

        List<AgentEvent> events = run();

        assertEquals(1, events.size());
        assertSame(confirmation, events.get(0));
        verify(approvalAgent, times(2)).run(anyString());
        verify(agent, times(1)).streamEvents(any(Msg.class), any(RuntimeContext.class));
    }

    @Test
    void autoModePassesConfirmationToUserWhenAiFails() {
        RequireUserConfirmEvent confirmation = confirmationWith(toolCall());
        when(permissionManager.getPermissionMode()).thenReturn(PermissionMode.AUTO);
        when(approvalAgent.run(anyString())).thenThrow(new IllegalStateException("AI unavailable"));
        when(agent.streamEvents(any(Msg.class), any(RuntimeContext.class)))
                .thenReturn(Flux.<AgentEvent>just(confirmation));

        List<AgentEvent> events = run();

        assertEquals(1, events.size());
        assertSame(confirmation, events.get(0));
        verify(agent, times(1)).streamEvents(any(Msg.class), any(RuntimeContext.class));
    }

    @Test
    void userApprovalContinuationDoesNotResetTheDiffBaseline() throws Exception {
        ConfirmDTO dto = new ConfirmDTO();
        dto.setSessionId("session");
        dto.setProjectId("project-1");
        dto.setConfirmed(true);
        dto.setToolCalls(List.of(toolCall()));
        when(agent.streamEvents(any(Msg.class), any(RuntimeContext.class))).thenReturn(Flux.empty());
        executions().put("project-1:session", new SessionExecution("session", "project-1", agent));

        service.confirmTool(dto).collectList().block(Duration.ofSeconds(5));

        verifyNoInteractions(sessionDiffService);
    }

    @Test
    void chatEntersPlanModeWhenRequested() throws Exception {
        prepareChat();

        service.chat("test", "session", "project-1", null, true, List.of())
                .collectList().block(Duration.ofSeconds(5));

        verify(agent).enterPlanMode(any(RuntimeContext.class));
        verify(agent, never()).exitPlanMode(any(RuntimeContext.class));
    }

    @Test
    void chatExitsPersistedPlanModeWhenDisabled() throws Exception {
        prepareChat();
        when(agent.isPlanModeActive(any(RuntimeContext.class))).thenReturn(true);

        service.chat("test", "session", "project-1", null, false, List.of())
                .collectList().block(Duration.ofSeconds(5));

        verify(agent).exitPlanMode(any(RuntimeContext.class));
        verify(agent, never()).enterPlanMode(any(RuntimeContext.class));
    }

    @Test
    void chatKeepsPersistedPlanModeWithoutEnteringAgain() throws Exception {
        prepareChat();
        when(agent.isPlanModeActive(any(RuntimeContext.class))).thenReturn(true);

        service.chat("test", "session", "project-1", null, true, List.of())
                .collectList().block(Duration.ofSeconds(5));

        verify(agent, never()).enterPlanMode(any(RuntimeContext.class));
        verify(agent, never()).exitPlanMode(any(RuntimeContext.class));
    }



    private void prepareChat() throws Exception {
        when(sessionTitleManager.load("session")).thenReturn(metadata);
        when(metadata.projectId()).thenReturn("project-1");
        when(agentManager.createAgent("project-1", "session")).thenReturn(agent);
        when(agent.streamEvents(any(Msg.class), any(RuntimeContext.class))).thenReturn(Flux.empty());
    }

    private List<AgentEvent> run() {
        executions().put("project-1:session", new SessionExecution("session", "project-1", agent));
        return service.agentLoop(new UserMessage("test"), "session", "project-1")
                .collectList().block(Duration.ofSeconds(5));
    }

    @SuppressWarnings("unchecked")
    private Map<String, SessionExecution> executions() {
        return (Map<String, SessionExecution>) ReflectionTestUtils.getField(service, "sessionExecutions");
    }

    private RequireUserConfirmEvent confirmationWith(ToolUseBlock... calls) {
        RequireUserConfirmEvent confirmation = mock(RequireUserConfirmEvent.class);
        when(confirmation.getToolCalls()).thenReturn(List.of(calls));
        return confirmation;
    }

    private ToolUseBlock toolCall() {
        return mock(ToolUseBlock.class);
    }
}
