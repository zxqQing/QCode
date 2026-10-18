package com.qcode.service;

import com.qcode.domain.dto.ConfirmDTO;
import io.agentscope.core.event.AgentEvent;
import org.springframework.web.multipart.MultipartFile;
import reactor.core.publisher.Flux;

import java.io.IOException;
import java.util.List;

public interface ChatService {
    Flux<AgentEvent> chat(String message, String sessionId, String projectId, String skill, boolean planMode,
                          List<MultipartFile> files) throws IOException;

    Flux<AgentEvent> confirmTool(ConfirmDTO dto);

    void stop(String sessionId,String projectId);
}
