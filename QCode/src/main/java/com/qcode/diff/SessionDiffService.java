package com.qcode.diff;

import com.qcode.session.SessionFileService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Stream;

@Service
public class SessionDiffService {
    private static final long MAX_FILE_BYTES = 4_000_000;
    private static final Set<String> IGNORED_DIRECTORIES = Set.of(
            ".git", ".svn", ".hg", ".qcode",
            ".idea",
            "node_modules", "dist", ".next", ".nuxt", ".svelte-kit", ".vite", ".turbo",
            ".parcel-cache", "coverage", ".nyc_output",
            "target", "build", "out", ".gradle",
            "__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache", ".tox", ".nox",
            ".venv", "venv",
            "bin", "obj",
            "cmake-build-debug", "cmake-build-release",
            ".cache"
    );
    private static final Set<String> IGNORED_FILES = Set.of(
            ".ds_store", "thumbs.db", "desktop.ini"
    );
    private static final Set<String> IGNORED_FILE_SUFFIXES = Set.of(
            ".pyc", ".pyo", ".class"
    );

    private final SessionFileService sessionFileService;
    private final Path baselineRoot;

    @Autowired
    public SessionDiffService(SessionFileService sessionFileService) {
        this(sessionFileService, Path.of(System.getProperty("user.home"), ".qcode", "diff-baselines"));
    }

    SessionDiffService(SessionFileService sessionFileService, Path baselineRoot) {
        this.sessionFileService = Objects.requireNonNull(sessionFileService);
        this.baselineRoot = Objects.requireNonNull(baselineRoot).toAbsolutePath().normalize();
    }

    public synchronized void beginTurn(String sessionId, String projectId) throws IOException {
        validateSessionId(sessionId);
        Path projectRoot = sessionFileService.projectRoot(sessionId, projectId);
        Path sessionDir = sessionDir(sessionId, projectId);
        if (!sessionDir.startsWith(baselineRoot)) throw new IOException("会话快照路径无效");
        Path snapshots = sessionDir.resolve("snapshots");
        Files.createDirectories(snapshots);

        String snapshotId = UUID.randomUUID().toString();
        Path snapshot = snapshots.resolve(snapshotId);
        try {
            copyProjectFiles(projectRoot, snapshot);
            Files.writeString(sessionDir.resolve("current"), snapshotId, StandardCharsets.UTF_8);
            cleanupOldSnapshots(snapshots, snapshot);
        } catch (IOException error) {
            deleteTree(snapshot);
            throw error;
        }
    }

    public SessionChangesResponse getChanges(String sessionId, String projectId) throws IOException {
        validateSessionId(sessionId);
        Path projectRoot = sessionFileService.projectRoot(sessionId, projectId);
        Path sessionDir = sessionDir(sessionId, projectId);
        Path pointer = sessionDir.resolve("current");
        if (!Files.isRegularFile(pointer)) {
            return SessionChangesResponse.unavailable("本轮文件基线尚未创建", projectRoot.toString());
        }
        String snapshotId = Files.readString(pointer, StandardCharsets.UTF_8).trim();
        if (!snapshotId.matches("[0-9a-fA-F-]{36}")) {
            return SessionChangesResponse.unavailable("本轮文件基线无效", projectRoot.toString());
        }
        Path snapshot = sessionDir.resolve("snapshots").resolve(snapshotId).normalize();
        if (!snapshot.startsWith(sessionDir.resolve("snapshots")) || !Files.isDirectory(snapshot)) {
            return SessionChangesResponse.unavailable("本轮文件基线不存在", projectRoot.toString());
        }

        Map<String, Path> before = filesByRelativePath(snapshot);
        Map<String, Path> after = filesByRelativePath(projectRoot);
        Set<String> paths = new HashSet<>(before.keySet());
        paths.addAll(after.keySet());
        List<String> orderedPaths = paths.stream().sorted(String.CASE_INSENSITIVE_ORDER).toList();
        List<SessionChangeFile> files = new ArrayList<>();
        for (String relative : orderedPaths) {
            Path oldPath = before.get(relative);
            Path newPath = after.get(relative);
            byte[] oldBytes = oldPath == null ? new byte[0] : Files.readAllBytes(oldPath);
            byte[] newBytes = newPath == null ? new byte[0] : Files.readAllBytes(newPath);
            if (java.util.Arrays.equals(oldBytes, newBytes)) continue;

            boolean binary = isBinary(oldBytes) || isBinary(newBytes);
            String oldContent = binary || oldPath == null ? null : new String(oldBytes, StandardCharsets.UTF_8);
            String newContent = binary || newPath == null ? null : new String(newBytes, StandardCharsets.UTF_8);
            int[] counts = binary ? new int[]{0, 0} : lineChanges(oldContent == null ? "" : oldContent, newContent == null ? "" : newContent);
            String type = oldPath == null ? "added" : newPath == null ? "deleted" : "modified";
            Path displayPath = newPath == null ? projectRoot.resolve(relative) : newPath;
            files.add(new SessionChangeFile(relative, displayPath.toString(), type, counts[0], counts[1], binary, oldContent, newContent));
        }
        int additions = files.stream().mapToInt(SessionChangeFile::additions).sum();
        int deletions = files.stream().mapToInt(SessionChangeFile::deletions).sum();
        return new SessionChangesResponse(true, null, projectRoot.toString(), additions, deletions, files);
    }

    public synchronized void deleteBaseline(String sessionId, String projectId) throws IOException {
        validateSessionId(sessionId);
        deleteTree(sessionDir(sessionId, projectId));
    }

    private void copyProjectFiles(Path projectRoot, Path destination) throws IOException {
        Files.createDirectories(destination);
        Files.walkFileTree(projectRoot, new SimpleFileVisitor<>() {
            @Override
            public FileVisitResult preVisitDirectory(Path directory, BasicFileAttributes attrs) {
                if (!directory.equals(projectRoot) && isIgnoredDirectory(directory)) {
                    return FileVisitResult.SKIP_SUBTREE;
                }
                return FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                if (!attrs.isRegularFile() || Files.isSymbolicLink(file) || attrs.size() > MAX_FILE_BYTES || isIgnoredFile(file)) {
                    return FileVisitResult.CONTINUE;
                }
                Path relative = projectRoot.relativize(file);
                Path target = destination.resolve(relative).normalize();
                if (!target.startsWith(destination)) return FileVisitResult.CONTINUE;
                Files.createDirectories(target.getParent());
                Files.copy(file, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.COPY_ATTRIBUTES);
                return FileVisitResult.CONTINUE;
            }
        });
    }

    private Map<String, Path> filesByRelativePath(Path root) throws IOException {
        Map<String, Path> files = new HashMap<>();
        Files.walkFileTree(root, new SimpleFileVisitor<>() {
            @Override
            public FileVisitResult preVisitDirectory(Path directory, BasicFileAttributes attrs) {
                return !directory.equals(root) && isIgnoredDirectory(directory)
                        ? FileVisitResult.SKIP_SUBTREE
                        : FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                if (!attrs.isRegularFile() || Files.isSymbolicLink(file) || attrs.size() > MAX_FILE_BYTES || isIgnoredFile(file)) {
                    return FileVisitResult.CONTINUE;
                }
                Path relativePath = root.relativize(file);
                files.put(relativePath.toString().replace('\\', '/'), file);
                return FileVisitResult.CONTINUE;
            }
        });
        return files;
    }

    private static boolean isIgnoredDirectory(Path directory) {
        Path name = directory.getFileName();
        return name != null && IGNORED_DIRECTORIES.contains(name.toString().toLowerCase(Locale.ROOT));
    }

    private static boolean isIgnoredFile(Path file) {
        Path name = file.getFileName();
        if (name == null) return false;
        String fileName = name.toString().toLowerCase(Locale.ROOT);
        return IGNORED_FILES.contains(fileName)
                || IGNORED_FILE_SUFFIXES.stream().anyMatch(fileName::endsWith);
    }

    private int[] lineChanges(String oldContent, String newContent) {
        String[] oldLines = oldContent.split("\\R", -1);
        String[] newLines = newContent.split("\\R", -1);
        if ((long) oldLines.length * newLines.length > 2_000_000L) {
            int prefix = 0;
            while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix].equals(newLines[prefix])) prefix++;
            int suffix = 0;
            while (suffix < oldLines.length - prefix && suffix < newLines.length - prefix
                    && oldLines[oldLines.length - suffix - 1].equals(newLines[newLines.length - suffix - 1])) suffix++;
            return new int[]{newLines.length - prefix - suffix, oldLines.length - prefix - suffix};
        }
        int[] lcs = new int[newLines.length + 1];
        for (String oldLine : oldLines) {
            int diagonal = 0;
            for (int j = 1; j <= newLines.length; j++) {
                int previous = lcs[j];
                lcs[j] = oldLine.equals(newLines[j - 1]) ? diagonal + 1 : Math.max(lcs[j], lcs[j - 1]);
                diagonal = previous;
            }
        }
        int unchanged = lcs[newLines.length];
        return new int[]{newLines.length - unchanged, oldLines.length - unchanged};
    }

    private boolean isBinary(byte[] bytes) {
        for (int i = 0; i < Math.min(bytes.length, 8000); i++) if (bytes[i] == 0) return true;
        return false;
    }

    private void cleanupOldSnapshots(Path snapshots, Path keep) {
        try (Stream<Path> paths = Files.list(snapshots)) {
            for (Path path : paths.filter(path -> !path.equals(keep)).toList()) deleteTree(path);
        } catch (IOException ignored) {
            // The active snapshot is already safely published; stale snapshots are harmless.
        }
    }

    private void deleteTree(Path root) throws IOException {
        if (root == null || !Files.exists(root)) return;
        try (Stream<Path> paths = Files.walk(root)) {
            for (Path path : paths.sorted(Comparator.reverseOrder()).toList()) Files.deleteIfExists(path);
        }
    }

    private void validateSessionId(String sessionId) {
        if (sessionId == null || !sessionId.matches("[A-Za-z0-9_-]+")) throw new IllegalArgumentException("会话 ID 无效");
    }

    private Path sessionDir(String sessionId, String projectId) throws IOException {
        String scope = projectId == null || projectId.isBlank() ? "default" : projectId;
        if (!scope.matches("[A-Za-z0-9_-]+")) throw new IllegalArgumentException("项目 ID 无效");
        Path directory = baselineRoot.resolve(scope).resolve(sessionId).normalize();
        if (!directory.startsWith(baselineRoot)) throw new IOException("会话快照路径无效");
        return directory;
    }
}
