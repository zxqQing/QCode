package com.qcode.service;

import com.qcode.domain.vo.ProjectVO;
import com.qcode.project.ProjectMetadata;

import java.io.IOException;
import java.util.List;

public interface ProjectService {
    ProjectMetadata create(ProjectMetadata project) throws IOException;

    List<ProjectVO> list() throws IOException;

    ProjectMetadata get(String projectId) throws IOException;

    ProjectMetadata update(ProjectMetadata project) throws IOException;

    void delete(String projectId) throws IOException;
}
