package com.qcode.service.impl;

import com.qcode.domain.vo.ProjectVO;
import com.qcode.project.ProjectManager;
import com.qcode.project.ProjectMetadata;
import com.qcode.service.ProjectService;
import com.qcode.session.SessionTitleManager;
import com.qcode.session.SessionTitleMetadata;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ProjectServiceImpl implements ProjectService {
    private final ProjectManager projectManager;
    private final SessionTitleManager sessionTitleManager;
    @Override
    public ProjectMetadata create(ProjectMetadata project) throws IOException {
        return projectManager.create(project);
    }

    // 项目和对应的Session标题
    @Override
    public List<ProjectVO> list() throws IOException {
        // 1. 查询所有项目，并转换为 Stream 流
        return projectManager.list().stream().map(project -> {
            // 2. 遍历每个项目，将 ProjectMetadata 转换为 ProjectVO
            ProjectVO vo = new ProjectVO();
            vo.setProjectId(project.getProjectId());
            vo.setName(project.getName());
            vo.setRootPath(project.getRootPath());
            vo.setAdditionalRoots(project.getAdditionalRoots());
            vo.setCreatedAt(project.getCreatedAt());
            vo.setUpdatedAt(project.getUpdatedAt());
            vo.setLastOpenedAt(project.getLastOpenedAt());
            // 3. 获取当前项目关联的所有 Session ID
            List<SessionTitleMetadata> sessions = (project.getSessionIds() == null ? List.<String>of() : project.getSessionIds()).stream()
                    // 4. 根据 Session ID 读取会话的标题元数据
                    .map(sessionTitleManager::load)
                    // 5. 过滤掉不存在的会话（load 返回 null 的情况）
                    .filter(Objects::nonNull)
                    // 6. 按照更新时间倒序排列，最近更新的排在前面
                    // updatedAt 为 null 的会话排在最后
                    .sorted(Comparator.comparing(
                            SessionTitleMetadata::updatedAt,
                            Comparator.nullsLast(Comparator.reverseOrder())))
                    .toList();

            vo.setSessions(sessions);
            return vo;
        }).toList();
    }

    @Override
    public ProjectMetadata get(String projectId) throws IOException {
        return projectManager.get(projectId).orElse(null);
    }

    @Override
    public ProjectMetadata update(ProjectMetadata project) throws IOException {
        return projectManager.update(project);
    }

    @Override
    public void delete(String projectId) throws IOException {
        ProjectMetadata project = projectManager.get(projectId)
                .orElseThrow(() -> new IllegalArgumentException("项目不存在：" + projectId));
        if (project.getSessionIds() != null) {
            project.getSessionIds().stream().map(sessionTitleManager::load)
                    .filter(Objects::nonNull)
                    .filter(metadata -> projectId.equals(metadata.projectId()))
                    .forEach(sessionTitleManager::clearProject);
        }
        projectManager.delete(projectId);
    }

}
