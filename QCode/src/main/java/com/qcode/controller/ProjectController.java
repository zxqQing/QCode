package com.qcode.controller;

import com.qcode.domain.vo.ProjectVO;
import com.qcode.project.ProjectManager;
import com.qcode.project.ProjectMetadata;
import com.qcode.service.ProjectService;
import com.qcode.service.SessionService;
import com.qcode.domain.vo.PageResult;
import com.qcode.domain.vo.SessionSummary;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.util.List;

@RestController
@RequestMapping("/project")
@CrossOrigin(origins = {"http://127.0.0.1:5173", "http://127.0.0.1:3000", "http://localhost:5173", "http://localhost:3000"})
@RequiredArgsConstructor
public class ProjectController {
    private final ProjectService projectService;
    private final SessionService sessionService;

    // 创建项目
    @PostMapping
    public ProjectMetadata create(@RequestBody ProjectMetadata project) throws IOException {
        return projectService.create(project);
    }
    // 查询所有项目和对应session
    @GetMapping
    public List<ProjectVO> list() throws IOException {
        return projectService.list();
    }
    // 根据 ID 查询项目
    @GetMapping("/{projectId}")
    public ProjectMetadata get(@PathVariable String projectId) throws IOException {
        return projectService.get(projectId);
    }

    // 全量更新 更新项目
    @PutMapping("/{projectId}")
    public ProjectMetadata update(@PathVariable String projectId, @RequestBody ProjectMetadata project) throws IOException {
        project.setProjectId(projectId);
        return projectService.update(project);
    }

    @GetMapping("/{projectId}/sessions")
    public PageResult<SessionSummary> sessions(@PathVariable String projectId,
                                               @RequestParam(required = false, defaultValue = "") String query,
                                               @RequestParam(required = false, defaultValue = "0") String cursor,
                                               @RequestParam(required = false, defaultValue = "20") int limit) {
        return sessionService.projectSessions(projectId, query, parseCursor(cursor), limit);
    }

    @DeleteMapping("/{projectId}")
    public void delete(@PathVariable String projectId) throws IOException {
        projectService.delete(projectId);
    }

    private int parseCursor(String cursor) {
        try { return Integer.parseInt(cursor == null || cursor.isBlank() ? "0" : cursor); }
        catch (NumberFormatException e) { return 0; }
    }
}

