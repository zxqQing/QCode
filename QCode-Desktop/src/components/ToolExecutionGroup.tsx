import type { FC } from "react";
import type { ToolEvent } from "../types/chat";
import { activityStatusLabels, summarizeToolActivity } from "../utils/toolActivity";
import ToolExecutionItem from "./ToolExecutionItem";

interface ToolExecutionGroupProps {
  events: ToolEvent[];
  expanded: boolean;
  isToolExpanded: (event: ToolEvent) => boolean;
  onToggleGroup: () => void;
  onToggleTool: (event: ToolEvent) => void;
  onOpenFile: (path: string) => void;
}

const ToolExecutionGroup: FC<ToolExecutionGroupProps> = ({ events, expanded, isToolExpanded, onToggleGroup, onToggleTool, onOpenFile }) => {
  const { status, label } = summarizeToolActivity(events, events.some((event) => event.status === "running"));
  const statusIcon = status === "running" ? <i className="tool-spinner" />
    : status === "success" ? "✓"
      : status === "failed" ? "!"
        : status === "approval" ? "?" : "·";

  return (
    <div className={`tool-group tool-group-status-${status}`}>
      <button type="button" className="tool-group-summary" onClick={onToggleGroup} aria-expanded={expanded} aria-label={`${label}，${activityStatusLabels[status]}`}>
        <span className={`tool-status-icon ${status}`} aria-hidden="true" title={activityStatusLabels[status]}>{statusIcon}</span>
        <span className="tool-group-label">{label}</span>
        <svg className={`tool-chevron ${expanded ? "open" : ""}`} viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      <div className={`tool-group-collapse ${expanded ? "expanded" : ""}`} aria-hidden={!expanded}>
        <div className="tool-group-collapse-inner">
          <div className="tool-group-items">
            {events.map((event) => <ToolExecutionItem key={event.id} event={event} expanded={isToolExpanded(event)} onToggle={() => onToggleTool(event)} onOpenFile={onOpenFile} />)}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ToolExecutionGroup;
