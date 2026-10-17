package com.qcode.session;

import com.qcode.project.ProjectManager;
import com.qcode.project.ProjectMetadata;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Component
@RequiredArgsConstructor
public class SessionFileService {
    private final SessionTitleManager sessionTitleManager;
    private final ProjectManager projectManager;

    public SessionFilePreview read(String sessionId, String projectId, String filePath) throws IOException {
        ResolvedFile resolved = resolveRequestedFile(sessionId, projectId, filePath);
        String content = Files.readString(resolved.file());
        return new SessionFilePreview(
                resolved.file().toString(),
                resolved.root().path().relativize(resolved.file()).toString().replace('\\', '/'),
                resolved.root().name(),
                languageOf(resolved.file()),
                content
        );
    }

    public SessionFileLocation locate(String sessionId, String projectId, String filePath) throws IOException {
        return new SessionFileLocation(resolveRequestedFile(sessionId, projectId, filePath).file().toString());
    }

    /** Resolves the single project root owned by a session. Additional roots are intentionally excluded. */
    public Path projectRoot(String sessionId, String projectId) throws IOException {
        if (sessionId == null || !sessionId.matches("[A-Za-z0-9_-]+")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "会话 ID 无效");
        }
        ProjectMetadata project = findSessionProject(sessionId, projectId);
        if (project.getRootPath() == null || project.getRootPath().isBlank()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "当前项目没有有效的项目根目录");
        }
        Path root;
        try {
            root = Path.of(project.getRootPath()).toRealPath();
        } catch (InvalidPathException | java.nio.file.NoSuchFileException error) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "当前项目根目录不可用", error);
        }
        if (!Files.isDirectory(root)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "当前项目根目录不可用");
        }
        return root;
    }

    private ResolvedFile resolveRequestedFile(String sessionId, String projectId, String filePath) throws IOException {
        if (sessionId == null || !sessionId.matches("[A-Za-z0-9_-]+")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "会话 ID 无效");
        }
        if (filePath == null || filePath.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "文件路径不能为空");
        }

        ProjectMetadata project = findSessionProject(sessionId, projectId);
        List<AuthorizedRoot> roots = authorizedRoots(project);
        Path requested;
        try {
            requested = Path.of(filePath.trim());
        } catch (InvalidPathException error) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "文件路径无效", error);
        }

        return resolve(requested, roots);
    }

    private ProjectMetadata findSessionProject(String sessionId, String projectId) throws IOException {
        if (projectId != null && !projectId.isBlank()) {
            ProjectMetadata project = projectManager.get(projectId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "会话所属项目不可用"));
            SessionTitleMetadata metadata = sessionTitleManager.load(sessionId);
            boolean metadataOwner = metadata != null && projectId.equals(metadata.projectId());
            boolean projectOwner = project.getSessionIds() != null && project.getSessionIds().contains(sessionId);
            if (!metadataOwner && !projectOwner) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "会话不属于指定项目");
            }
            return project;
        }
        SessionTitleMetadata metadata = sessionTitleManager.load(sessionId);
        if (metadata != null && metadata.projectId() != null && !metadata.projectId().isBlank()) {
            return projectManager.get(metadata.projectId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "会话所属项目不可用"));
        }
        List<ProjectMetadata> owners = projectManager.list().stream()
                .filter(project -> project.getSessionIds() != null && project.getSessionIds().contains(sessionId))
                .toList();
        if (owners.isEmpty()) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "此会话未关联可访问的项目");
        if (owners.size() != 1) throw new ResponseStatusException(HttpStatus.CONFLICT, "会话项目归属不唯一，无法安全读取文件");
        return owners.get(0);
    }

    private List<AuthorizedRoot> authorizedRoots(ProjectMetadata project) throws IOException {
        List<String> configured = new ArrayList<>();
        if (project.getRootPath() != null && !project.getRootPath().isBlank()) configured.add(project.getRootPath());
        if (project.getAdditionalRoots() != null) configured.addAll(project.getAdditionalRoots());
        Map<Path, AuthorizedRoot> roots = new LinkedHashMap<>();
        for (String value : configured) {
            if (value == null || value.isBlank()) continue;
            try {
                Path path = Path.of(value).toRealPath();
                if (Files.isDirectory(path)) roots.putIfAbsent(path, new AuthorizedRoot(path, Path.of(value).getFileName() == null ? path.toString() : Path.of(value).getFileName().toString()));
            } catch (InvalidPathException | java.nio.file.NoSuchFileException ignored) {
                // Missing or invalid configured roots cannot grant file access.
            }
        }
        if (roots.isEmpty()) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "项目没有可访问的文件目录");
        return List.copyOf(roots.values());
    }

    private ResolvedFile resolve(Path requested, List<AuthorizedRoot> roots) throws IOException {
        Map<Path, AuthorizedRoot> matches = new LinkedHashMap<>();
        boolean pathOutsideRoots = false;

        if (requested.isAbsolute()) {
            Path normalized = requested.normalize();
            boolean belongsToRoot = false;
            for (AuthorizedRoot root : roots) {
                if (normalized.startsWith(root.path())) belongsToRoot = true;
                try {
                    Path realCandidate = requested.toRealPath();
                    if (realCandidate.startsWith(root.path())) {
                        belongsToRoot = true;
                        if (Files.isRegularFile(realCandidate)) matches.putIfAbsent(realCandidate, root);
                    }
                } catch (java.nio.file.NoSuchFileException ignored) {
                    // Keep the normalized path check so missing in-root files report as not found.
                }
            }
            if (matches.isEmpty()) {
                if (!belongsToRoot) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "文件不在当前会话项目的授权目录中");
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "项目中找不到该文件");
            }
        } else if (isBareName(requested)) {
            String fileName = requested.getFileName().toString();
            for (AuthorizedRoot root : roots) {
                try (var paths = Files.walk(root.path())) {
                    for (Path candidate : paths.filter(path -> path.getFileName() != null && path.getFileName().toString().equals(fileName)).toList()) {
                        collectExisting(candidate, root, matches);
                    }
                }
            }
        } else {
            for (AuthorizedRoot root : roots) {
                Path candidate = root.path().resolve(requested).normalize();
                if (!candidate.startsWith(root.path())) {
                    pathOutsideRoots = true;
                    continue;
                }
                collectExisting(candidate, root, matches);
            }
            if (matches.isEmpty() && pathOutsideRoots) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "文件不在当前会话项目的授权目录中");
            }
        }

        if (matches.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "项目中找不到该文件");
        if (matches.size() > 1) throw new ResponseStatusException(HttpStatus.CONFLICT, "文件名匹配到多个文件，请使用包含目录的路径");
        Map.Entry<Path, AuthorizedRoot> match = matches.entrySet().iterator().next();
        return new ResolvedFile(match.getKey(), match.getValue());
    }

    private void collectExisting(Path candidate, AuthorizedRoot root, Map<Path, AuthorizedRoot> matches) throws IOException {
        if (!Files.exists(candidate)) return;
        Path realFile;
        try {
            realFile = candidate.toRealPath();
        } catch (java.nio.file.NoSuchFileException ignored) {
            return;
        }
        if (!realFile.startsWith(root.path())) return;
        if (Files.isRegularFile(realFile)) matches.putIfAbsent(realFile, root);
    }

    private boolean isBareName(Path path) {
        return path.getNameCount() == 1 && !path.toString().contains("/") && !path.toString().contains("\\");
    }

    private String languageOf(Path file) {
        String name = file.getFileName().toString();
        int dot = name.lastIndexOf('.');
        if (dot < 0 || dot == name.length() - 1) return "plaintext";
        String extension = name.substring(dot + 1).toLowerCase(Locale.ROOT);
        return switch (extension) {
            case "js", "mjs", "cjs" -> "javascript";
            case "jsx" -> "javascript";
            case "ts", "mts", "cts" -> "typescript";
            case "tsx" -> "typescript";
            case "json", "jsonc" -> "json";
            case "md", "markdown" -> "markdown";
            case "yml", "yaml" -> "yaml";
            case "html", "htm" -> "html";
            case "xml", "svg" -> "xml";
            case "css", "scss", "less" -> "css";
            case "java" -> "java";
            case "py" -> "python";
            case "sh", "bash" -> "shell";
            case "sql" -> "sql";
            case "go" -> "go";
            case "rs" -> "rust";
            case "kt", "kts" -> "kotlin";
            case "c", "h" -> "c";
            case "cc", "cpp", "cxx", "hpp" -> "cpp";
            case "cs" -> "csharp";
            case "php" -> "php";
            case "swift" -> "swift";
            case "toml" -> "ini";
            default -> "plaintext";
        };
    }

    private record AuthorizedRoot(Path path, String name) { }
    private record ResolvedFile(Path file, AuthorizedRoot root) { }
}
