package com.qcode.service;

import com.qcode.domain.dto.RenameSessionDTO;
import com.qcode.session.SessionMessage;
import com.qcode.session.SessionTitleMetadata;
import com.qcode.domain.vo.PageResult;
import com.qcode.domain.vo.SessionSummary;
import io.agentscope.core.message.Msg;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.util.List;

@Service
public interface SessionService {
    List<SessionTitleMetadata> listByUserId(String userId);

    List<SessionMessage> getMessages(String sessionId, String projectId);

    SessionTitleMetadata rename(RenameSessionDTO dto);

    PageResult<SessionSummary> recent(String query, int offset, int limit);

    PageResult<SessionSummary> projectSessions(String projectId, String query, int offset, int limit);

    void delete(String sessionId, String projectId) throws IOException;
}
