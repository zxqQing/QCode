import { useState, type FC } from "react";
import type { ToolEvent } from "../types/chat";
import { FilePathText } from "../utils/filePath";

interface ToolExecutionItemProps {
  event: ToolEvent;
  expanded: boolean;
  onToggle: () => void;
  onOpenFile: (path: string) => void;
}

const statusLabels: Record<ToolEvent["status"], string> = {
  queued: "等待中",
  running: "运行中",
  success: "已完成",
  failed: "执行失败",
  approval: "等待批准"
};

function readWorkingDirectory(event: ToolEvent): string | undefined {
  if (event.workingDirectory) return event.workingDirectory;
  if (!event.input || typeof event.input !== "object" || Array.isArray(event.input)) return undefined;
  const input = event.input as Record<string, unknown>;
  const value = input.working_directory ?? input.workingDirectory;
  return typeof value === "string" && value.trim() ? value : undefined;
}

function getRemainingInput(event: ToolEvent): unknown {
  if (!event.input || typeof event.input !== "object" || Array.isArray(event.input)) return event.input;
  const input = event.input as Record<string, unknown>;
  const remaining = Object.fromEntries(Object.entries(input).filter(([key]) => !["command", "working_directory", "workingDirectory"].includes(key)));
  return Object.keys(remaining).length ? remaining : undefined;
}

const ToolExecutionItem: FC<ToolExecutionItemProps> = ({ event, expanded, onToggle, onOpenFile }) => {
  const [copied, setCopied] = useState(false);
  const commandLabel = event.command || event.summary || event.name;
  const workingDirectory = readWorkingDirectory(event);
  const remainingInput = getRemainingInput(event);
  const statusIcon = event.status === "running"
    ? <i className="tool-spinner" />
    : event.status === "success" ? "✓"
      : event.status === "failed" ? "!"
        : event.status === "approval" ? "?" : "·";

  const copyCommand = async () => {
    if (!event.command) return;
    try {
      await navigator.clipboard.writeText(event.command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard access is optional.
    }
  };

  return (
    <div className={`tool-execution tool-status-${event.status}`}>
      <button type="button" className="tool-summary" onClick={onToggle} aria-expanded={expanded} aria-label={`${statusLabels[event.status]}: ${commandLabel}`}>
        <span className={`tool-status-icon ${event.status}`} aria-hidden="true" title={statusLabels[event.status]}>{statusIcon}</span>
        <span className="tool-summary-copy" title={commandLabel}><strong className={event.command ? "tool-summary-command" : ""}>{commandLabel}</strong></span>
        <svg className={`tool-chevron ${expanded ? "open" : ""}`} viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      <div className={`tool-collapse ${expanded ? "expanded" : ""}`} aria-hidden={!expanded}>
        <div className="tool-collapse-inner">
          <div className="tool-details">
            {event.command && <div className="tool-detail-section"><div className="tool-detail-label">命令</div><div className="tool-command"><code><FilePathText value={event.command} onOpenFile={onOpenFile} /></code><button type="button" onClick={copyCommand} title="复制命令">{copied ? "✓" : "▣"}</button></div></div>}
            {workingDirectory && <div className="tool-detail-section"><div className="tool-detail-label">工作目录</div><code className="tool-working-directory"><FilePathText value={workingDirectory} onOpenFile={onOpenFile} /></code></div>}
            {remainingInput != null && <div className="tool-detail-section"><div className="tool-detail-label">输入参数</div><pre className="tool-output tool-input"><FilePathText value={typeof remainingInput === "string" ? remainingInput : JSON.stringify(remainingInput, null, 2)} onOpenFile={onOpenFile} /></pre></div>}
            {event.output && <div className="tool-detail-section"><div className="tool-detail-label">执行输出</div><pre className="tool-output"><FilePathText value={event.output} onOpenFile={onOpenFile} /></pre></div>}
            {event.error && <div className="tool-detail-section"><div className="tool-detail-label">错误</div><div className="tool-error"><FilePathText value={event.error} onOpenFile={onOpenFile} /></div></div>}
            {event.status === "approval" && <div className="tool-approval-note">此操作需要确认后才能继续。</div>}
            {(event.exitCode != null || event.durationMs != null) && <div className="tool-result-meta">
              {event.exitCode != null && <span>退出代码：{event.exitCode}</span>}
              {event.durationMs != null && <span>耗时：{(event.durationMs / 1000).toFixed(1)} 秒</span>}
            </div>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ToolExecutionItem;
