package com.qcode.controller;

import com.qcode.domain.dto.ConfirmDTO;
import com.qcode.service.ChatService;
import io.agentscope.core.event.AgentEvent;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.io.IOException;

@RestController
@RequestMapping("/chat")
@CrossOrigin(origins = {"http://127.0.0.1:5173", "http://127.0.0.1:3000", "http://localhost:5173", "http://localhost:3000"})
@RequiredArgsConstructor
public class ChatController {
    private final ChatService chatService;

    @GetMapping(produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<AgentEvent> chat(@RequestParam String message,
                                 @RequestParam String sessionId,
                                 @RequestParam(required = false) String projectId,
                                 @RequestParam(required = false) String skill,
                                 @RequestParam(defaultValue = "false") boolean planMode) throws IOException {
        return chatService.chat(message, sessionId, projectId, skill, planMode);
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

