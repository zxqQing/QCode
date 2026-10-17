package com.qcode.service.impl;

import com.qcode.domain.dto.RenameSessionDTO;
import com.qcode.diff.SessionDiffService;
import com.qcode.service.SessionService;
import com.qcode.domain.vo.PageResult;
import com.qcode.domain.vo.SessionSummary;
import com.qcode.project.ProjectManager;
import com.qcode.project.ProjectMetadata;
import com.qcode.session.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Stream;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class SessionServiceImpl implements SessionService {
    private final SessionTitleManager sessionTitleManager;
    private final SessionManager sessionManager;
    private final ProjectManager projectManager;
    private final SessionDiffService sessionDiffService;
    @Override
    public List<SessionTitleMetadata> listByUserId(String userId) {
        return sessionTitleManager.listSessions();
    }

    @Override
    public List<SessionMessage> getMessages(String sessionId,String projectId) {
        return sessionManager.getSessionMessagesFromState(sessionId,projectId);
    }

    @Override
    public SessionTitleMetadata rename(RenameSessionDTO dto) {
        String sessionId = dto.getSessionId();
        String title = dto.getTitle();
        SessionTitleMetadata load = ownedMetadata(sessionId, dto.getProjectId());
        if (load == null) throw new IllegalArgumentException("会话不存在：" + sessionId);
        sessionTitleManager.updateTitle(load,title, TitleSource.MANUAL);
        return sessionTitleManager.load(sessionId);
    }

    @Override
    public PageResult<SessionSummary> recent(String query, int offset, int limit) {
        Map<String, ProjectMetadata> projectsById = projectMap();
        Map<String, String> projectNames = new HashMap<>();
        Map<String, String> projectIds = new HashMap<>();
        projectsById.forEach((id, project) -> {
            if (project.getSessionIds() != null) project.getSessionIds().forEach(sessionId -> {
                projectIds.putIfAbsent(sessionId, id);
                projectNames.putIfAbsent(sessionId, project.getName());
            });
        });
        List<SessionSummary> all = sessionTitleManager.listSessions().stream()
                .map(metadata -> {
                    String metadataProjectId = metadata.projectId();
                    String resolvedId = metadataProjectId != null && projectsById.containsKey(metadataProjectId)
                            ? metadataProjectId : projectIds.get(metadata.sessionId());
                    String resolvedName = resolvedId == null ? null : projectsById.get(resolvedId) == null ? null : projectsById.get(resolvedId).getName();
                    return toSummary(metadata, resolvedId, resolvedName != null ? resolvedName : projectNames.get(metadata.sessionId()));
                })
                .filter(item -> matches(item, query))
                .sorted(Comparator.comparing(SessionSummary::updatedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .toList();
        return page(all, offset, limit);
    }

    @Override
    public PageResult<SessionSummary> projectSessions(String projectId, String query, int offset, int limit) {
        try {
            ProjectMetadata project = projectManager.get(projectId)
                    .orElseThrow(() -> new IllegalArgumentException("项目不存在：" + projectId));
            List<SessionSummary> all = (project.getSessionIds() == null ? List.<String>of() : project.getSessionIds()).stream()
                    .map(sessionTitleManager::load)
                    .filter(Objects::nonNull)
                    .map(metadata -> toSummary(metadata, projectId, project.getName()))
                    .filter(item -> matches(item, query))
                    .sorted(Comparator.comparing(SessionSummary::updatedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                    .toList();
            return page(all, offset, limit);
        } catch (IOException e) {
            throw new IllegalStateException("读取项目会话失败", e);
        }
    }

    @Override
    public void delete(String sessionId, String projectId) throws IOException {
        SessionTitleMetadata metadata = ownedMetadata(sessionId, projectId);
        if (metadata == null && !sessionManager.exists(sessionId, projectId)) {
            throw new IllegalArgumentException("会话不存在：" + sessionId);
        }
        if (metadata != null) sessionTitleManager.delete(sessionId);
        sessionManager.deleteSession(sessionId, projectId);
        projectManager.removeSession(projectId, sessionId);
        sessionDiffService.deleteBaseline(sessionId, projectId);
    }

    private SessionTitleMetadata ownedMetadata(String sessionId, String projectId) {
        SessionTitleMetadata metadata = sessionTitleManager.load(sessionId);
        if (metadata == null) return null;
        String owner = metadata.projectId();
        boolean requestedDefault = projectId == null || projectId.isBlank();
        boolean ownedByDefault = owner == null || owner.isBlank();
        if (requestedDefault ? ownedByDefault : projectId.equals(owner)) return metadata;
        if (!requestedDefault && ownedByDefault) {
            try {
                boolean legacyMembership = projectManager.get(projectId)
                        .map(ProjectMetadata::getSessionIds)
                        .filter(Objects::nonNull)
                        .map(ids -> ids.contains(sessionId))
                        .orElse(false);
                if (legacyMembership) return metadata;
            } catch (IOException error) {
                throw new IllegalStateException("读取会话所属项目失败", error);
            }
        }
        throw new IllegalArgumentException("会话不属于指定项目：" + sessionId);
    }

    private Map<String, ProjectMetadata> projectMap() {
        try {
            return projectManager.list().stream().collect(Collectors.toMap(ProjectMetadata::getProjectId, project -> project));
        } catch (IOException e) {
            throw new IllegalStateException("读取项目失败", e);
        }
    }

    private SessionSummary toSummary(SessionTitleMetadata metadata, String projectId, String projectName) {
        String resolvedProjectId = metadata.projectId() != null ? metadata.projectId() : projectId;
        return new SessionSummary(metadata.sessionId(), metadata.title(), metadata.titleSource(), metadata.autoTitleCount(),
                metadata.autoTitleEnabled(), metadata.roundCount(), metadata.createdAt(), metadata.updatedAt(), resolvedProjectId, projectName);
    }

    private boolean matches(SessionSummary item, String query) {
        if (query == null || query.isBlank()) return true;
        String q = query.trim().toLowerCase();
        return item.sessionId().toLowerCase().contains(q)
                || (item.title() != null && item.title().toLowerCase().contains(q))
                || (item.projectName() != null && item.projectName().toLowerCase().contains(q));
    }

    private PageResult<SessionSummary> page(List<SessionSummary> all, int offset, int limit) {
        int safeOffset = Math.max(offset, 0);
        int safeLimit = Math.min(Math.max(limit, 1), 100);
        if (safeOffset >= all.size()) return new PageResult<>(List.of(), null, false);
        List<SessionSummary> items = all.subList(safeOffset, Math.min(safeOffset + safeLimit, all.size()));
        return PageResult.of(items, safeOffset, safeLimit, all.size());
    }
}
