package com.qcode.service.impl;

import com.qcode.project.ProjectManager;
import com.qcode.project.ProjectMetadata;
import com.qcode.session.SessionFileService;
import com.qcode.session.SessionTitleManager;
import com.qcode.session.SessionTitleMetadata;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

class SessionFileServiceTest {
    @TempDir Path temp;

    private SessionTitleManager titleManager;
    private ProjectManager projectManager;
    private SessionFileService service;
    private ProjectMetadata project;
    private Path projectRoot;
    private Path extraRoot;
    private SessionTitleMetadata sessionMetadata;
    private boolean metadataExists;

    @BeforeEach
    void setUp() throws IOException {
        projectManager = new ProjectManager(temp.resolve("project-metadata"));
        metadataExists = true;
        sessionMetadata = metadata("project-1");
        titleManager = new SessionTitleManager() {
            @Override public SessionTitleMetadata load(String sessionId) { return metadataExists ? sessionMetadata : null; }
        };
        service = new SessionFileService(titleManager, projectManager);
        projectRoot = Files.createDirectories(temp.resolve("project"));
        extraRoot = Files.createDirectories(temp.resolve("shared"));
        project = new ProjectMetadata();
        project.setProjectId("project-1");
        project.setName("Project");
        project.setRootPath(projectRoot.toString());
        project.setAdditionalRoots(List.of(extraRoot.toString()));
        projectManager.create(project);
        projectManager.addSessionIfAbsent("project-1", "session-1");
    }

    @Test
    void readsProjectAndAdditionalRootFilesWithLanguageAndBreadcrumb() throws Exception {
        Path source = Files.createDirectories(projectRoot.resolve("src")).resolve("App.tsx");
        Files.writeString(source, "export const App = 1;");
        Files.writeString(extraRoot.resolve("shared.json"), "{}\n");

        var result = service.read("session-1", "project-1", "src/App.tsx");
        assertEquals(source.toRealPath().toString(), result.absolutePath());
        assertEquals("src/App.tsx", result.relativePath());
        assertEquals("project", result.rootName());
        assertEquals("typescript", result.language());
        assertEquals("export const App = 1;", result.content());
        assertEquals(projectRoot.toRealPath(), service.projectRoot("session-1", "project-1"));
        assertEquals("{}\n", service.read("session-1", "project-1", "shared.json").content());
    }

    @Test
    void findsBareFileNameOnlyWhenItHasOneMatch() throws Exception {
        Files.createDirectories(projectRoot.resolve("src")).resolve("Unique.java").toFile().createNewFile();
        assertEquals("src/Unique.java", service.read("session-1", "project-1", "Unique.java").relativePath());

        Files.createDirectories(extraRoot.resolve("other")).resolve("Unique.java").toFile().createNewFile();
        ResponseStatusException error = assertThrows(ResponseStatusException.class, () -> service.read("session-1", "project-1", "Unique.java"));
        assertEquals(409, error.getStatusCode().value());
    }

    @Test
    void rejectsTraversalAndFilesOutsideAuthorizedRoots() throws Exception {
        Path outside = temp.resolve("secret.txt");
        Files.writeString(outside, "secret");
        ResponseStatusException traversal = assertThrows(ResponseStatusException.class, () -> service.read("session-1", "project-1", "../secret.txt"));
        assertEquals(403, traversal.getStatusCode().value());
        ResponseStatusException absolute = assertThrows(ResponseStatusException.class, () -> service.read("session-1", "project-1", outside.toString()));
        assertEquals(403, absolute.getStatusCode().value());

        ResponseStatusException missing = assertThrows(ResponseStatusException.class, () -> service.read("session-1", "project-1", "src/missing.ts"));
        assertEquals(404, missing.getStatusCode().value());
        Files.createDirectory(projectRoot.resolve("folder"));
        ResponseStatusException directory = assertThrows(ResponseStatusException.class, () -> service.read("session-1", "project-1", "folder"));
        assertEquals(404, directory.getStatusCode().value());
    }

    @Test
    void rejectsSessionWithoutAProjectOwner() throws Exception {
        sessionMetadata = metadata(null);
        project.setSessionIds(List.of());
        projectManager.update(project);
        ResponseStatusException denied = assertThrows(ResponseStatusException.class, () -> service.projectRoot("session-1", null));
        assertEquals(403, denied.getStatusCode().value());
    }

    @Test
    void rejectsSymlinkThatResolvesOutsideAuthorizedRoot() throws Exception {
        Path outside = temp.resolve("outside.txt");
        Files.writeString(outside, "secret");
        Path link = projectRoot.resolve("link.txt");
        try {
            Files.createSymbolicLink(link, outside);
        } catch (UnsupportedOperationException | IOException | SecurityException error) {
            assumeTrue(false, "Symbolic links are unavailable in this environment");
        }
        ResponseStatusException denied = assertThrows(ResponseStatusException.class, () -> service.read("session-1", "project-1", "link.txt"));
        assertEquals(404, denied.getStatusCode().value());
    }

    @Test
    void resolvesLegacyProjectMembershipButRejectsAmbiguousOwnership() throws Exception {
        sessionMetadata = metadata(null);
        project.setSessionIds(List.of("session-1"));
        projectManager.update(project);
        Files.writeString(projectRoot.resolve("legacy.md"), "legacy");
        assertEquals("legacy", service.read("session-1", null, "legacy.md").content());
        assertEquals(projectRoot.toRealPath(), service.projectRoot("session-1", null));

        ProjectMetadata secondOwner = new ProjectMetadata();
        secondOwner.setProjectId("project-2");
        secondOwner.setName("Second");
        secondOwner.setRootPath(projectRoot.toString());
        secondOwner.setSessionIds(List.of("session-1"));
        projectManager.create(secondOwner);
        ResponseStatusException conflict = assertThrows(ResponseStatusException.class, () -> service.projectRoot("session-1", null));
        assertEquals(409, conflict.getStatusCode().value());
    }

    @Test
    void rejectsAnExplicitProjectThatDoesNotOwnTheSession() throws Exception {
        ProjectMetadata other = new ProjectMetadata();
        other.setProjectId("project-2");
        other.setName("Other");
        other.setRootPath(Files.createDirectories(temp.resolve("other-project")).toString());
        projectManager.create(other);

        ResponseStatusException denied = assertThrows(ResponseStatusException.class,
                () -> service.projectRoot("session-1", "project-2"));

        assertEquals(403, denied.getStatusCode().value());
    }

    private SessionTitleMetadata metadata(String projectId) {
        return new SessionTitleMetadata("session-1", null, null, 0, true, 0, null, null, projectId);
    }
}
