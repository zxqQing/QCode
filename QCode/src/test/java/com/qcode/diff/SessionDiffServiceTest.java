package com.qcode.diff;

import com.qcode.session.SessionFileService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SessionDiffServiceTest {
    @TempDir
    Path tempDir;

    @Test
    void reportsAddedModifiedAndDeletedFilesWithoutGit() throws Exception {
        Path project = Files.createDirectory(tempDir.resolve("project"));
        Files.writeString(project.resolve("modified.txt"), "one\ntwo\nthree\n");
        Files.writeString(project.resolve("deleted.txt"), "remove me\n");
        SessionDiffService service = serviceFor(project);

        service.beginTurn("session-1", "project-1");
        Files.writeString(project.resolve("modified.txt"), "one\nthree\nfour\n");
        Files.delete(project.resolve("deleted.txt"));
        Files.writeString(project.resolve("added.txt"), "new file\n");

        SessionChangesResponse response = service.getChanges("session-1", "project-1");
        Map<String, SessionChangeFile> files = response.files().stream()
                .collect(Collectors.toMap(SessionChangeFile::path, Function.identity()));

        assertTrue(response.available());
        assertEquals("modified", files.get("modified.txt").type());
        assertEquals(1, files.get("modified.txt").additions());
        assertEquals(1, files.get("modified.txt").deletions());
        assertEquals("added", files.get("added.txt").type());
        assertEquals("deleted", files.get("deleted.txt").type());
        assertEquals("one\ntwo\nthree\n", files.get("modified.txt").oldContent());
        assertEquals("one\nthree\nfour\n", files.get("modified.txt").newContent());
    }

    @Test
    void nextUserTurnReplacesTheCurrentBaseline() throws Exception {
        Path project = Files.createDirectory(tempDir.resolve("project"));
        Path file = project.resolve("file.txt");
        Files.writeString(file, "before\n");
        SessionDiffService service = serviceFor(project);

        service.beginTurn("session-1", "project-1");
        Files.writeString(file, "first turn\n");
        assertFalse(service.getChanges("session-1", "project-1").files().isEmpty());

        service.beginTurn("session-1", "project-1");

        assertTrue(service.getChanges("session-1", "project-1").files().isEmpty());
    }

    @Test
    void marksBinaryFilesWithoutReturningTheirContents() throws Exception {
        Path project = Files.createDirectory(tempDir.resolve("project"));
        Path file = project.resolve("asset.bin");
        Files.write(file, new byte[]{0, 1, 2});
        SessionDiffService service = serviceFor(project);

        service.beginTurn("session-1", "project-1");
        Files.write(file, new byte[]{0, 1, 3});

        SessionChangeFile change = service.getChanges("session-1", "project-1").files().getFirst();
        assertTrue(change.binary());
        assertEquals(null, change.oldContent());
        assertEquals(null, change.newContent());
    }

    @Test
    void keepsBaselinesIsolatedByProjectForTheSameSessionId() throws Exception {
        Path project = Files.createDirectory(tempDir.resolve("project"));
        Files.writeString(project.resolve("file.txt"), "before\n");
        SessionDiffService service = serviceFor(project);

        service.beginTurn("session-1", "project-1");
        service.beginTurn("session-1", "project-2");
        service.deleteBaseline("session-1", "project-1");

        assertFalse(service.getChanges("session-1", "project-1").available());
        assertTrue(service.getChanges("session-1", "project-2").available());
    }

    private SessionDiffService serviceFor(Path project) throws Exception {
        SessionFileService fileService = new StubSessionFileService(project.toRealPath());
        return new SessionDiffService(fileService, tempDir.resolve("baselines"));
    }

    private static final class StubSessionFileService extends SessionFileService {
        private final Path projectRoot;

        private StubSessionFileService(Path projectRoot) {
            super(null, null);
            this.projectRoot = projectRoot;
        }

        @Override
        public Path projectRoot(String sessionId, String projectId) {
            return projectRoot;
        }
    }
}
