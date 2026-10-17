package com.qcode.service;

import com.qcode.domain.dto.ConfirmDTO;
import io.agentscope.core.event.AgentEvent;
import reactor.core.publisher.Flux;

import java.io.IOException;

public interface ChatService {
    Flux<AgentEvent> chat(String message, String sessionId, String projectId, String skill, boolean planMode) throws IOException;

    Flux<AgentEvent> confirmTool(ConfirmDTO dto);

    void stop(String sessionId,String projectId);
}
