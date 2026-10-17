package com.qcode.skill;

import org.springframework.web.multipart.MultipartFile;
import java.nio.file.FileAlreadyExistsException;
import java.nio.file.StandardCopyOption;
import com.qcode.domain.vo.SkillVO;
import org.springframework.stereotype.Component;
import java.util.Comparator;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.Objects;
import java.util.stream.Stream;

@Component
public class SkillManager {
    private final Path skillsDir = Paths.get(System.getProperty("user.home"), ".qcode", "skills");
    public List<SkillVO> listSkills() throws IOException {
        if (!Files.isDirectory(skillsDir)) {
            return List.of();
        }

        try (Stream<Path> stream = Files.list(skillsDir)) {
            return stream
                    .filter(Files::isDirectory)
                    .map(this::readSkill)
                    .filter(Objects::nonNull)
                    .sorted(Comparator.comparing(SkillVO::name))
                    .toList();
        }
    }
    public String getSkill(String name) throws IOException {
        Path dir = resolveSkillDir(name);
        Path skillFile = dir.resolve("SKILL.md");

        if (!Files.isRegularFile(skillFile)) {
            throw new IOException("Skill 不存在：" + name);
        }

        return Files.readString(skillFile);
    }
    public void deleteSkill(String name) throws IOException {
        Path dir = resolveSkillDir(name);

        if (!Files.isDirectory(dir)) {
            throw new IOException("Skill 不存在：" + name);
        }

        deleteDirectory(dir);
    }

    private void deleteDirectory(Path dir) throws IOException {
        if (!Files.exists(dir)) {
            return;
        }
        try (Stream<Path> stream = Files.walk(dir)) {
            List<Path> paths = stream
                    .sorted(Comparator.reverseOrder())
                    .toList();

            for (Path path : paths) {
                Files.delete(path);
            }
        }
    }
    public SkillVO uploadSkill(List<MultipartFile> files, List<String> paths) throws IOException {
        if (files == null || paths == null || files.isEmpty() || files.size() != paths.size()) {
            throw new IOException("请选择一个包含 SKILL.md 的文件夹");
        }
        if (files.size() > 1000) {
            throw new IOException("文件夹内文件数量超过限制");
        }

        Files.createDirectories(skillsDir);
        Path tempDir = Files.createTempDirectory("qcode-skill-");

        try {
            long totalSize = 0;
            for (int i = 0; i < files.size(); i++) {
                MultipartFile file = files.get(i);
                String relativePath = paths.get(i);
                if (file == null || relativePath == null || relativePath.isBlank()) {
                    throw new IOException("文件夹中包含无效文件");
                }

                Path target = tempDir.resolve(relativePath.replace('\\', '/')).normalize();
                if (!target.startsWith(tempDir) || target.equals(tempDir)) {
                    throw new IOException("非法文件夹路径");
                }

                Files.createDirectories(target.getParent());
                try (var input = file.getInputStream(); var output = Files.newOutputStream(target)) {
                    byte[] buffer = new byte[8192];
                    int len;
                    while ((len = input.read(buffer)) != -1) {
                        totalSize += len;
                        if (totalSize > 50L * 1024 * 1024) {
                            throw new IOException("文件夹大小不能超过 50MB");
                        }
                        output.write(buffer, 0, len);
                    }
                }
            }

            return installSkill(tempDir);
        } finally {
            deleteDirectory(tempDir);
        }
    }

    private SkillVO installSkill(Path sourceDir) throws IOException {
        Path skillFile = sourceDir.resolve("SKILL.md");
        if (!Files.isRegularFile(skillFile)) {
            throw new IOException("上传文件夹的根目录必须包含 SKILL.md");
        }
        String content = Files.readString(skillFile);
        String name = null;
        String description = null;
        String[] lines = content.split("\\R");
        if (lines.length == 0 || !lines[0].trim().equals("---")) {
            throw new IOException("SKILL.md 缺少 YAML Front Matter");
        }
        boolean frontMatterClosed = false;
        for (int i = 1; i < lines.length; i++) {
            String line = lines[i].trim();

            if (line.equals("---")) {
                frontMatterClosed = true;
                break;
            }
            if (line.startsWith("name:")) {
                name = line.substring(5).trim().replaceAll("^['\"]|['\"]$", "");
            }
            if (line.startsWith("description:")) {
                description = line.substring(12).trim().replaceAll("^['\"]|['\"]$", "");
            }
        }

        if (!frontMatterClosed || name == null || name.isBlank() || description == null || description.isBlank()) {
            throw new IOException("SKILL.md 必须包含 name 和 description");
        }
        if (!name.matches("[a-zA-Z0-9_-]+")) {
            throw new IOException("Skill 名称只能包含字母、数字、- 和 _");
        }

        Path targetDir = resolveSkillDir(name);
        try {
            Files.createDirectory(targetDir);
        } catch (FileAlreadyExistsException error) {
            throw new FileAlreadyExistsException("Skill 已存在：" + name);
        }

        try {
            copyDirectory(sourceDir, targetDir);
        } catch (IOException error) {
            deleteDirectory(targetDir);
            throw error;
        }
        return readSkill(targetDir);
    }

    private void copyDirectory(Path sourceDir, Path targetDir) throws IOException {
        try (Stream<Path> stream = Files.walk(sourceDir)) {
            for (Path source : stream.toList()) {
                Path target = targetDir.resolve(sourceDir.relativize(source).toString());
                if (Files.isDirectory(source)) {
                    Files.createDirectories(target);
                } else {
                    Files.createDirectories(target.getParent());
                    Files.copy(source, target, StandardCopyOption.COPY_ATTRIBUTES);
                }
            }
        }
    }
    private SkillVO readSkill(Path dir) {
        Path skillFile = dir.resolve("SKILL.md");

        if (!Files.isRegularFile(skillFile)) {
            return null;
        }
        try {
            List<String> lines = Files.readAllLines(skillFile);
            String name = dir.getFileName().toString();
            String description = "";
            if (!lines.isEmpty() && lines.get(0).trim().equals("---")) {
                for (int i = 1; i < lines.size(); i++) {
                    String line = lines.get(i).trim();
                    if (line.equals("---")) {
                        break;
                    }
                    if (line.startsWith("name:")) {
                        name = line.substring(5).trim()
                                .replaceAll("^['\"]|['\"]$", "");
                    }
                    if (line.startsWith("description:")) {
                        description = line.substring(12).trim()
                                .replaceAll("^['\"]|['\"]$", "");
                    }
                }
            }
            return new SkillVO(name, description, skillFile.toString());
        } catch (IOException e) {
            return null;
        }
    }
    private Path resolveSkillDir(String name) throws IOException {

        if (name == null || !name.matches("[a-zA-Z0-9_-]+")) {
            throw new IOException("非法 Skill 名称");
        }
        Path dir = skillsDir.resolve(name).normalize();
        if (!dir.startsWith(skillsDir)) {
            throw new IOException("非法 Skill 路径");
        }
        if (Files.isSymbolicLink(dir)) {
            throw new IOException("不允许访问符号链接 Skill");
        }
        return dir;
    }

}
