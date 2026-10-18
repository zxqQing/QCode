package com.qcode.agent;

import com.qcode.project.ProjectManager;
import com.qcode.project.ProjectMetadata;
import io.agentscope.core.agent.RuntimeContext;
import io.agentscope.harness.agent.filesystem.AbstractFilesystem;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AgentManagerFilesystemTest {
    @TempDir Path tempDir;

    @Test
    void uploadsUseProjectRootOrIsolatedScratchRoot() throws Exception {
        String previousHome = System.getProperty("user.home");
        System.setProperty("user.home", tempDir.toString());
        try {
            AgentManager manager = mock(AgentManager.class, CALLS_REAL_METHODS);
            ProjectManager projects = mock(ProjectManager.class);
            ReflectionTestUtils.setField(manager, "projectManager", projects);
            Path projectRoot = Files.createDirectory(tempDir.resolve("project"));
            ProjectMetadata project = new ProjectMetadata();
            project.setRootPath(projectRoot.toString());
            when(projects.get("project-1")).thenReturn(Optional.of(project));

            Path attachmentPath = AgentManager.resolveAttachmentsRoot().resolve("first/document.md");
            byte[] content = "hello".getBytes();
            AbstractFilesystem projectFs = manager.createFilesystem("project-1", "first");
            assertTrue(projectFs.uploadFiles(context("first"), List.of(Map.entry(attachmentPath.toString(), content)))
                    .getFirst().isSuccess());
            assertArrayEquals(content, Files.readAllBytes(attachmentPath));

            AbstractFilesystem firstScratch = manager.createFilesystem(null, "first");
            AbstractFilesystem secondScratch = manager.createFilesystem(null, "second");
            assertTrue(firstScratch.uploadFiles(context("first"), List.of(Map.entry(attachmentPath.toString(), content)))
                    .getFirst().isSuccess());
            Path secondAttachmentPath = AgentManager.resolveAttachmentsRoot().resolve("second/document.md");
            assertTrue(secondScratch.uploadFiles(context("second"),
                    List.of(Map.entry(secondAttachmentPath.toString(), new byte[]{2})))
                    .getFirst().isSuccess());
            assertArrayEquals(content, Files.readAllBytes(attachmentPath));
            assertArrayEquals(new byte[]{2}, Files.readAllBytes(secondAttachmentPath));
            assertNotEquals(AgentManager.resolveScratchDir("first"), AgentManager.resolveScratchDir("second"));
        } finally {
            if (previousHome == null) System.clearProperty("user.home");
            else System.setProperty("user.home", previousHome);
        }
    }

    private RuntimeContext context(String sessionId) {
        return RuntimeContext.builder().userId("qing").sessionId(sessionId).build();
    }
}
