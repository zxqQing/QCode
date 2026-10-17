package com.qcode.project;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.springframework.stereotype.Component;
import org.springframework.beans.factory.annotation.Autowired;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Stream;

@Component
public class ProjectManager {
    private final ObjectMapper objectMapper = new ObjectMapper()
            .registerModule(new JavaTimeModule())
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
    private final Path projectDir;

    @Autowired
    public ProjectManager() throws IOException {
        this(Paths.get(System.getProperty("user.home"), ".qcode","projects"));
    }

    public ProjectManager(Path projectDir) throws IOException {
        this.projectDir = projectDir;
        Files.createDirectories(projectDir);
    }
    // 首次关联 Session，重复调用不会重复添加
    public ProjectMetadata addSessionIfAbsent(String projectId, String sessionId)
            throws IOException {
        ProjectMetadata project = get(projectId)
                .orElseThrow(() -> new IllegalArgumentException(
                        "项目不存在：" + projectId));

        if (project.getSessionIds() == null) project.setSessionIds(new ArrayList<>());
        // 已经关联过，直接返回
        if (project.getSessionIds().contains(sessionId)) {
            return project;
        }

        // 首次关联，添加 Session ID
        project.getSessionIds().add(sessionId);
        project.setUpdatedAt(LocalDateTime.now());

        // 保存项目 JSON 文件
        save(getProjectPath(projectId), project);
        return project;
    }
    // 创建项目
    public ProjectMetadata create(ProjectMetadata project) throws IOException {
        if (project.getProjectId() == null || project.getProjectId().isBlank()) {
            project.setProjectId("project-"+UUID.randomUUID().toString());
        }
        LocalDateTime now = LocalDateTime.now();
        project.setCreatedAt(now);
        project.setUpdatedAt(now);
        Path path = getProjectPath(project.getProjectId());
        if (Files.exists(path)) {
            throw new IllegalArgumentException("项目已存在：" + project.getProjectId());
        }
        save(path, project);
        return project;
    }

    // 根据 ID 读取项目
    public Optional<ProjectMetadata> get(String projectId) throws IOException {
        Path path = getProjectPath(projectId);
        if (!Files.exists(path)) {
            return Optional.empty();
        }
        return Optional.of(objectMapper.readValue(path.toFile(), ProjectMetadata.class));
    }

    // 读取所有项目
    public List<ProjectMetadata> list() throws IOException {
        try (Stream<Path> paths = Files.list(projectDir)) {
            List<ProjectMetadata> projects = new ArrayList<>();
            for (Path path : paths.filter(p -> p.toString().endsWith(".json")).toList()) {
                projects.add(objectMapper.readValue(path.toFile(), ProjectMetadata.class));
            }
            return projects;
        }
    }

    // 更新项目
    public ProjectMetadata update(ProjectMetadata project) throws IOException {
        if (project.getProjectId() == null || project.getProjectId().isBlank()) {
            throw new IllegalArgumentException("projectId 不能为空");
        }
        Path path = getProjectPath(project.getProjectId());
        if (!Files.exists(path)) {
            throw new IllegalArgumentException("项目不存在：" + project.getProjectId());
        }
        ProjectMetadata old = objectMapper.readValue(path.toFile(), ProjectMetadata.class);
        project.setCreatedAt(old.getCreatedAt());
        project.setUpdatedAt(LocalDateTime.now());
        save(path, project);
        return project;
    }

    public void delete(String projectId) throws IOException {
        Path path = getProjectPath(projectId);
        if (!Files.exists(path)) throw new IllegalArgumentException("项目不存在：" + projectId);
        Files.delete(path);
    }

    public void removeSession(String projectId, String sessionId) throws IOException {
        if (projectId == null || projectId.isBlank()) return;
        ProjectMetadata project = get(projectId).orElse(null);
        if (project != null && project.getSessionIds() != null && project.getSessionIds().removeIf(sessionId::equals)) {
            project.setUpdatedAt(LocalDateTime.now());
            save(getProjectPath(projectId), project);
        }
    }

    private Path getProjectPath(String projectId) {
        if (projectId == null || !projectId.matches("[a-zA-Z0-9_-]+")) {
            throw new IllegalArgumentException("非法 projectId");
        }
        return projectDir.resolve(projectId + ".json");
    }

    private void save(Path path, ProjectMetadata project) throws IOException {
        objectMapper.writerWithDefaultPrettyPrinter().writeValue(path.toFile(), project);
    }
}
