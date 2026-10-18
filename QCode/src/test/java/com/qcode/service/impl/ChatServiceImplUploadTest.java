package com.qcode.service.impl;

import com.qcode.agent.AgentManager;
import com.qcode.agent.ApprovalAgent;
import com.qcode.diff.SessionDiffService;
import com.qcode.permission.PermissionManager;
import com.qcode.project.ProjectManager;
import com.qcode.service.SkillService;
import com.qcode.session.SessionTitleManager;
import com.qcode.session.SessionTitleMetadata;
import io.agentscope.core.agent.RuntimeContext;
import io.agentscope.core.message.Base64Source;
import io.agentscope.core.message.ImageBlock;
import io.agentscope.core.message.Msg;
import io.agentscope.harness.agent.HarnessAgent;
import io.agentscope.harness.agent.filesystem.AbstractFilesystem;
import io.agentscope.harness.agent.filesystem.model.FileUploadResponse;
import io.agentscope.harness.agent.filesystem.model.WriteResult;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Flux;

import java.time.Duration;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ChatServiceImplUploadTest {
    @Mock PermissionManager permissionManager;
    @Mock ProjectManager projectManager;
    @Mock AgentManager agentManager;
    @Mock SessionTitleManager sessionTitleManager;
    @Mock ApprovalAgent approvalAgent;
    @Mock SessionDiffService sessionDiffService;
    @Mock SkillService skillService;
    @Mock HarnessAgent agent;
    @Mock AbstractFilesystem filesystem;
    @Mock SessionTitleMetadata metadata;

    private ChatServiceImpl service;

    @BeforeEach
    void setUp() {
        service = new ChatServiceImpl(permissionManager, projectManager, agentManager,
                sessionTitleManager, approvalAgent, sessionDiffService, skillService);
    }

    @Test
    void textOnlyChatDoesNotCreateUploadFilesystem() throws Exception {
        prepareProjectChat();

        service.chat("hello", "session", "project-1", null, false, List.of())
                .collectList().block(Duration.ofSeconds(5));

        verify(agentManager, never()).createFilesystem(any(), any());
        assertEquals("hello", capturedMessage().getTextContent());
        assertEquals(0, capturedMessage().getContentBlocks(ImageBlock.class).size());
    }

    @Test
    void fileOnlyChatUploadsDocumentsAndImagesBeforeDiffBaseline() throws Exception {
        prepareProjectChat();
        prepareSuccessfulUpload();
        MockMultipartFile image = file("diagram.png", "image/png", new byte[]{1, 2, 3});
        MockMultipartFile pdf = file("report.pdf", "application/pdf", new byte[]{4, 5});
        MockMultipartFile word = file("draft.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", new byte[]{6});
        MockMultipartFile markdown = file("notes.md", "text/markdown", "# Notes".getBytes());

        service.chat(null, "session", "project-1", null, false, List.of(image, pdf, word, markdown))
                .collectList().block(Duration.ofSeconds(5));

        List<Map.Entry<String, byte[]>> uploaded = capturedUploads();
        assertEquals(4, uploaded.size());
        assertEquals(4, uploaded.stream().map(Map.Entry::getKey).distinct().count());
        assertTrue(uploaded.stream().allMatch(entry -> entry.getKey().startsWith("attachments/session/")));
        assertArrayEquals(new byte[]{4, 5}, uploaded.get(1).getValue());
        Msg message = capturedMessage();
        uploaded.forEach(entry -> assertTrue(message.getTextContent().contains(entry.getKey())));
        assertEquals(1, message.getContentBlocks(ImageBlock.class).size());
        Base64Source source = (Base64Source) message.getContentBlocks(ImageBlock.class).getFirst().getSource();
        assertEquals("image/png", source.getMediaType());
        assertEquals("AQID", source.getData());
        var order = inOrder(filesystem, sessionDiffService, agent);
        order.verify(filesystem).uploadFiles(any(RuntimeContext.class), anyList());
        order.verify(sessionDiffService).beginTurn("session", "project-1");
        order.verify(agent).streamEvents(any(Msg.class), any(RuntimeContext.class));
    }

    @Test
    void mixedChatKeepsTextAndAddsAnImageBlockForEachImage() throws Exception {
        prepareProjectChat();
        prepareSuccessfulUpload();

        service.chat("Describe these", "session", "project-1", null, false,
                List.of(file("one.png", "image/png", new byte[]{1}),
                        file("two.jpg", "image/jpeg", new byte[]{2})))
                .collectList().block(Duration.ofSeconds(5));

        assertTrue(capturedMessage().getTextContent().startsWith("Describe these"));
        assertEquals(2, capturedMessage().getContentBlocks(ImageBlock.class).size());
    }

    @Test
    void duplicateNamesGetDifferentPaths() throws Exception {
        prepareProjectChat();
        prepareSuccessfulUpload();

        service.chat("Compare", "session", "project-1", null, false,
                List.of(file("same.md", "text/markdown", new byte[]{1}),
                        file("same.md", "text/markdown", new byte[]{2})))
                .collectList().block(Duration.ofSeconds(5));

        List<Map.Entry<String, byte[]>> uploaded = capturedUploads();
        assertNotEquals(uploaded.get(0).getKey(), uploaded.get(1).getKey());
    }

    @Test
    void invalidNamesAndEmptyRequestsFailBeforeWriting() {
        ResponseStatusException badName = assertThrows(ResponseStatusException.class,
                () -> service.chat("read", "session", "project-1", null, false,
                        List.of(file("../escape.md", "text/markdown", new byte[]{1}))));
        assertEquals(HttpStatus.BAD_REQUEST, badName.getStatusCode());
        ResponseStatusException empty = assertThrows(ResponseStatusException.class,
                () -> service.chat(" ", "session", "project-1", null, false, List.of()));
        assertEquals(HttpStatus.BAD_REQUEST, empty.getStatusCode());
        ResponseStatusException badSession = assertThrows(ResponseStatusException.class,
                () -> service.chat("read", "../other", "project-1", null, false, List.of()));
        assertEquals(HttpStatus.BAD_REQUEST, badSession.getStatusCode());
        verifyNoInteractions(agentManager);
    }

    @Test
    void partialUploadFailureCleansEveryAttemptedPathAndDoesNotStartChat() throws Exception {
        when(sessionTitleManager.load("session")).thenReturn(metadata);
        when(metadata.projectId()).thenReturn("project-1");
        when(agentManager.createFilesystem("project-1", "session")).thenReturn(filesystem);
        when(filesystem.uploadFiles(any(RuntimeContext.class), anyList())).thenAnswer(invocation -> {
            List<Map.Entry<String, byte[]>> upload = invocation.getArgument(1);
            return List.of(FileUploadResponse.success(upload.get(0).getKey()),
                    FileUploadResponse.fail(upload.get(1).getKey(), "disk_full"));
        });
        when(filesystem.delete(any(RuntimeContext.class), anyString())).thenAnswer(invocation ->
                WriteResult.ok(invocation.getArgument(1)));

        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> service.chat("read", "session", "project-1", null, false,
                        List.of(file("a.md", "text/markdown", new byte[]{1}),
                                file("b.pdf", "application/pdf", new byte[]{2}))));

        assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, error.getStatusCode());
        List<Map.Entry<String, byte[]>> uploaded = capturedUploads();
        verify(filesystem).delete(any(RuntimeContext.class), eq(uploaded.get(0).getKey()));
        verify(filesystem).delete(any(RuntimeContext.class), eq(uploaded.get(1).getKey()));
        verify(agentManager, never()).createAgent(any(), any());
        verifyNoInteractions(sessionDiffService);
    }

    @Test
    void projectMismatchCannotUpload() throws Exception {
        when(sessionTitleManager.load("session")).thenReturn(metadata);
        when(metadata.projectId()).thenReturn("project-1");

        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> service.chat("read", "session", "project-2", null, false,
                        List.of(file("a.md", "text/markdown", new byte[]{1}))));
        assertEquals(HttpStatus.FORBIDDEN, error.getStatusCode());

        verify(agentManager, never()).createFilesystem(any(), any());
    }

    private void prepareProjectChat() throws Exception {
        when(sessionTitleManager.load("session")).thenReturn(metadata);
        when(metadata.projectId()).thenReturn("project-1");
        when(agentManager.createAgent("project-1", "session")).thenReturn(agent);
        when(agent.streamEvents(any(Msg.class), any(RuntimeContext.class))).thenReturn(Flux.empty());
        when(sessionTitleManager.incrementRoundCount("session")).thenReturn(metadata);
        when(metadata.roundCount()).thenReturn(2);
    }

    private void prepareSuccessfulUpload() throws Exception {
        when(agentManager.createFilesystem("project-1", "session")).thenReturn(filesystem);
        when(filesystem.uploadFiles(any(RuntimeContext.class), anyList())).thenAnswer(invocation -> {
            List<Map.Entry<String, byte[]>> upload = invocation.getArgument(1);
            return upload.stream().map(entry -> FileUploadResponse.success(entry.getKey())).toList();
        });
    }

    private MockMultipartFile file(String name, String type, byte[] bytes) {
        return new MockMultipartFile("files", name, type, bytes);
    }

    private Msg capturedMessage() {
        ArgumentCaptor<Msg> captor = ArgumentCaptor.forClass(Msg.class);
        verify(agent).streamEvents(captor.capture(), any(RuntimeContext.class));
        return captor.getValue();
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    private List<Map.Entry<String, byte[]>> capturedUploads() {
        ArgumentCaptor<List> captor = ArgumentCaptor.forClass(List.class);
        verify(filesystem).uploadFiles(any(RuntimeContext.class), captor.capture());
        return (List<Map.Entry<String, byte[]>>) captor.getValue();
    }
}
