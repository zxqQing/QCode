package com.qcode.tools;

import io.agentscope.core.agent.RuntimeContext;
import io.agentscope.core.message.TextBlock;
import io.agentscope.core.message.ToolResultBlock;
import io.agentscope.core.message.ToolUseBlock;
import io.agentscope.core.tool.ToolBase;
import io.agentscope.core.tool.ToolCallParam;
import io.agentscope.harness.agent.filesystem.model.ExecuteResponse;
import io.agentscope.harness.agent.filesystem.sandbox.AbstractSandboxFilesystem;
import io.agentscope.harness.agent.sandbox.ExecResult;
import io.agentscope.harness.agent.sandbox.SandboxAcquireResult;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import java.util.List;
import java.util.Map;

/** A custom shell tool that executes through the sandbox acquired for this call. */
public class QCodeShellExecuteTool extends ToolBase {
    public static final String NAME = "qcode-execute";
    private final AbstractSandboxFilesystem filesystem;

    public QCodeShellExecuteTool() {
        this(null);
    }

    /**
     * Use the same filesystem adapter that HarnessAgent gives to its built-in shell tool.
     * This constructor is used with LocalFilesystemSpec.
     */
    public QCodeShellExecuteTool(AbstractSandboxFilesystem filesystem) {
        super(ToolBase.builder()
                .name(NAME)
                .description("Execute a shell command in the workspace. Returns output and exit code.")
                .inputSchema(Map.of(
                        "type", "object",
                        "properties", Map.of(
                                "command", Map.of("type", "string", "description", "Shell command to execute"),
                                "working_directory", Map.of("type", "string", "description", "Relative working directory", "default", ""),
                                "timeout", Map.of("type", "integer", "description", "Timeout in seconds", "default", 30)),
                        "required", List.of("command")))
                .readOnly(false)
                .concurrencySafe(false));
        this.filesystem = filesystem;
    }

    @Override
    public boolean matchRule(String ruleContent, Map<String, Object> toolInput) {
        if (ruleContent == null || ruleContent.isBlank() || toolInput == null) {
            return false;
        }
        Object value = toolInput.get("command");
        if (!(value instanceof String command) || command.isBlank()) {
            return false;
        }
        String actual = normalizeCommand(command);
        String rule = normalizeCommand(ruleContent);
        if (actual.isEmpty() || rule.isEmpty()) {
            return false;
        }
        // 默认使用完整命令精确匹配，避免只匹配 "del" 而误放行任意删除命令。
        if (actual.equals(rule)) {
            return true;
        }
        // 需要匹配命令前缀时，必须在规则末尾显式写 '*', 例如 "del *"。
        if (rule.endsWith("*")) {
            String prefix = rule.substring(0, rule.length() - 1);
            return !prefix.isEmpty() && actual.startsWith(prefix);
        }
        return false;
    }

    private static String normalizeCommand(String command) {
        return command == null ? "" : command.strip().replaceAll("\\s+", " ");
    }

    @Override
    public Mono<ToolResultBlock> callAsync(ToolCallParam param) {
        return Mono.fromCallable(() -> {
            Map<String, Object> input = param.getInput();
            Object value = input.get("command");
            if (!(value instanceof String command) || command.isBlank()) {
                return result(param, "Error: command is required.");
            }

            String workingDirectory = input.get("working_directory") instanceof String s ? s : "";
            int timeout = input.get("timeout") instanceof Number n && n.intValue() > 0
                    ? Math.min(n.intValue(), 600) : 30;
            RuntimeContext runtimeContext = param.getRuntimeContext();
            return execute(runtimeContext, param, command, workingDirectory, timeout);
        }).subscribeOn(Schedulers.boundedElastic())
                .onErrorResume(ex -> Mono.just(result(param, "Error: " + ex.getMessage())));
    }

    private ToolResultBlock execute(RuntimeContext runtimeContext, ToolCallParam param,
                                    String command, String workingDirectory, int timeout)
            throws Exception {
        // HarnessAgent's sandbox middleware puts this value into the per-call context.
        // It is removed again when the call is released; no isReleased() API exists in 2.0.3.
        String wd = workingDirectory == null ? "" : workingDirectory.strip();
        boolean windows = filesystem != null
                && System.getProperty("os.name").toLowerCase().contains("win");
        if (!wd.isBlank() && (wd.startsWith("/") || wd.startsWith("~") || wd.contains("..")
                || wd.matches("^[A-Za-z]:[\\\\/].*"))) {
            return result(param, "Error: working_directory must be a relative path within "
                    + "the workspace (absolute paths, '~', and '..' are not allowed).");
        }

        String effectiveCommand = wd.isBlank()
                ? command
                : commandWithWorkingDirectory(command, wd, windows);

        if (filesystem != null) {
            ExecuteResponse execution = filesystem.execute(runtimeContext, effectiveCommand, timeout);
            return result(param, format(execution.exitCode(), execution.output(), execution.truncated()));
        }

        // Docker/remote sandbox mode: the lifecycle middleware binds this per-call lease.
        SandboxAcquireResult acquired = runtimeContext == null
                ? null : runtimeContext.get(SandboxAcquireResult.class);
        if (acquired == null || acquired.getSandbox() == null) {
            return result(param, "Error: no active sandbox for this call. "
                    + "Configure a sandbox filesystem spec on HarnessAgent.");
        }
        ExecResult execution = acquired.getSandbox().exec(runtimeContext, effectiveCommand, timeout);
        return result(param, format(execution.exitCode(), execution.combinedOutput(), execution.truncated()));
    }

    private static String format(Integer exitCode, String output, boolean truncated) {
        StringBuilder response = new StringBuilder("Exit code: ").append(exitCode).append('\n');
        if (output != null && !output.isBlank()) response.append('\n').append(output);
        if (truncated) response.append("\n(output was truncated)");
        return response.toString();
    }

    private static String commandWithWorkingDirectory(String command, String workingDirectory,
                                                       boolean windows) {
        if (windows) {
            String escaped = workingDirectory.replace("\"", "\"\"");
            return "cd /d \"" + escaped + "\" && " + command;
        }
        String escaped = workingDirectory.replace("'", "'\\''");
        return "cd -- '" + escaped + "' && " + command;
    }

    private static ToolResultBlock result(ToolCallParam param, String text) {
        ToolUseBlock use = param.getToolUseBlock();
        return ToolResultBlock.of(use.getId(), use.getName(),
                TextBlock.builder().text(text).build());
    }
}

