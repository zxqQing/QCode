package com.qcode.controller;

import com.qcode.service.ChatService;
import io.agentscope.core.event.AgentEvent;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.multipart.MultipartFile;
import reactor.core.publisher.Flux;

import java.util.List;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ChatControllerTest {
    @Test
    void postChatBindsRepeatedFilesAndStreamsEvents() throws Exception {
        ChatService chatService = mock(ChatService.class);
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new ChatController(chatService)).build();
        when(chatService.chat(eq("read"), eq("session"), eq("project-1"), isNull(), eq(false), anyList()))
                .thenReturn(Flux.<AgentEvent>empty());

        mvc.perform(multipart("/chat")
                        .file(new MockMultipartFile("files", "a.pdf", "application/pdf", new byte[]{1}))
                        .file(new MockMultipartFile("files", "b.md", "text/markdown", new byte[]{2}))
                        .param("message", "read")
                        .param("sessionId", "session")
                        .param("projectId", "project-1")
                        .accept(MediaType.TEXT_EVENT_STREAM))
                .andExpect(status().isOk());

        @SuppressWarnings({"unchecked", "rawtypes"})
        var files = org.mockito.ArgumentCaptor.forClass(List.class);
        verify(chatService).chat(eq("read"), eq("session"), eq("project-1"), isNull(), eq(false), files.capture());
        List<MultipartFile> uploaded = files.getValue();
        org.junit.jupiter.api.Assertions.assertEquals(2, uploaded.size());
        org.junit.jupiter.api.Assertions.assertEquals("b.md", uploaded.get(1).getOriginalFilename());
    }

    @Test
    void getChatIsNoLongerMapped() throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new ChatController(mock(ChatService.class))).build();
        mvc.perform(get("/chat").param("message", "hello").param("sessionId", "session"))
                .andExpect(status().isMethodNotAllowed());
    }

    @Test
    void postChatAllowsFilesWithoutMessage() throws Exception {
        ChatService chatService = mock(ChatService.class);
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new ChatController(chatService)).build();
        when(chatService.chat(isNull(), eq("session"), isNull(), isNull(), eq(false), anyList()))
                .thenReturn(Flux.empty());

        mvc.perform(multipart("/chat")
                        .file(new MockMultipartFile("files", "notes.md", "text/markdown", new byte[]{1}))
                        .param("sessionId", "session")
                        .accept(MediaType.TEXT_EVENT_STREAM))
                .andExpect(status().isOk());

        verify(chatService).chat(isNull(), eq("session"), isNull(), isNull(), eq(false), anyList());
    }
}
