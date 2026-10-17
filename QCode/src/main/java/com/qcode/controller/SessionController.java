package com.qcode.controller;

import com.qcode.domain.dto.RenameSessionDTO;
import com.qcode.service.SessionService;
import com.qcode.session.SessionFileService;
import com.qcode.session.SessionFilePreview;
import com.qcode.session.SessionFileLocation;
import com.qcode.session.SessionMessage;
import com.qcode.session.SessionTitleMetadata;
import com.qcode.diff.SessionChangesResponse;
import com.qcode.diff.SessionDiffService;
import com.qcode.domain.vo.PageResult;
import com.qcode.domain.vo.SessionSummary;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.List;

@RestController
@RequestMapping({"/session"})
@CrossOrigin(origins = {"http://127.0.0.1:5173", "http://127.0.0.1:3000", "http://localhost:5173", "http://localhost:3000"})
@RequiredArgsConstructor
public class SessionController {

    private final SessionService sessionService;
    private final SessionFileService sessionFileService;
    private final SessionDiffService sessionDiffService;

    /**
     * 查询某个用户的所有会话列表
     * GET /session/list?userId=xxx
     */
    @GetMapping("/list")
    public PageResult<SessionSummary> listSessions(@RequestParam(required = false, defaultValue = "") String userId,
                                                   @RequestParam(required = false, defaultValue = "") String query,
                                                   @RequestParam(required = false, defaultValue = "0") String cursor,
                                                   @RequestParam(required = false, defaultValue = "20") int limit) {
        return sessionService.recent(query, parseCursor(cursor), limit);
    }

    @GetMapping("/recent")
    public PageResult<SessionSummary> recent(@RequestParam(required = false, defaultValue = "") String query,
                                             @RequestParam(required = false, defaultValue = "0") String cursor,
                                             @RequestParam(required = false, defaultValue = "20") int limit) {
        return sessionService.recent(query, parseCursor(cursor), limit);
    }

    /**
     * 查询单个会话的完整对话记录
     * GET /session/{sessionId}/messages
     */
    @GetMapping("/{sessionId}/messages")
    public List<SessionMessage> getMessages(@PathVariable String sessionId,
                                            @RequestParam(required = false) String projectId) {
        return sessionService.getMessages(sessionId, projectId);
    }

    @GetMapping("/{sessionId}/file")
    public SessionFilePreview getFile(@PathVariable String sessionId,
                                      @RequestParam(required = false) String projectId,
                                      @RequestParam String filePath) throws IOException {
        return sessionFileService.read(sessionId, projectId, filePath);
    }

    @GetMapping("/{sessionId}/file/resolve")
    public SessionFileLocation resolveFile(@PathVariable String sessionId,
                                           @RequestParam(required = false) String projectId,
                                           @RequestParam String filePath) throws IOException {
        return sessionFileService.locate(sessionId, projectId, filePath);
    }

    @GetMapping("/{sessionId}/changes")
    public SessionChangesResponse getChanges(@PathVariable String sessionId,
                                             @RequestParam(required = false) String projectId) throws IOException {
        return sessionDiffService.getChanges(sessionId, projectId);
    }

    /**
     * 修改 会话 标题
     * @param dto
     */
    @PostMapping("/rename")
    public SessionTitleMetadata rename(@RequestBody RenameSessionDTO dto) {
        return sessionService.rename(dto);
    }

    @DeleteMapping("/{sessionId}")
    public void delete(@PathVariable String sessionId,
                       @RequestParam(required = false) String projectId) throws IOException {
        sessionService.delete(sessionId, projectId);
    }

    private int parseCursor(String cursor) {
        try { return Integer.parseInt(cursor == null || cursor.isBlank() ? "0" : cursor); }
        catch (NumberFormatException e) { return 0; }
    }

}

