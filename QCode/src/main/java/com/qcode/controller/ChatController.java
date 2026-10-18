package com.qcode.controller;

import com.qcode.domain.dto.ConfirmDTO;
import com.qcode.service.ChatService;
import io.agentscope.core.event.AgentEvent;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import reactor.core.publisher.Flux;

import java.io.IOException;
import java.util.List;

@RestController
@RequestMapping("/chat")
@CrossOrigin(origins = {"http://127.0.0.1:5173", "http://127.0.0.1:3000", "http://localhost:5173", "http://localhost:3000"})
@RequiredArgsConstructor
public class ChatController {
    private final ChatService chatService;

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<AgentEvent> chat(@RequestParam(required = false) String message,
                                 @RequestParam String sessionId,
                                 @RequestParam(required = false) String projectId,
                                 @RequestParam(required = false) String skill,
                                 @RequestParam(defaultValue = "false") boolean planMode,
                                 @RequestParam(value = "files", required = false) List<MultipartFile> files) throws IOException {
        return chatService.chat(message, sessionId, projectId, skill, planMode, files);
    }
    @PostMapping(value = "/confirm", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<AgentEvent> confirmTool(@RequestBody ConfirmDTO dto){
        return chatService.confirmTool(dto);
    }

    @PostMapping("/stop")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public void stop(@RequestParam String sessionId, @RequestParam String projectId) {
        chatService.stop(sessionId, projectId);
    }
}

