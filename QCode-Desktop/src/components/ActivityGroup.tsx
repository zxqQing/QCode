import type { FC } from "react";
import type { ThinkingEvent, ToolEvent } from "../types/chat";
import type { ActivityEntry } from "../utils/conversationProjection";
import { activityStatusLabels, summarizeToolActivity } from "../utils/toolActivity";
import ThinkingItem from "./ThinkingItem";
import ToolExecutionItem from "./ToolExecutionItem";

export type { ActivityEntry } from "../utils/conversationProjection";

interface ActivityGroupProps {
  entries: ActivityEntry[];
  active: boolean;
  expanded: boolean;
  isThinkingExpanded: (event: ThinkingEvent) => boolean;
  isToolExpanded: (event: ToolEvent) => boolean;
  onToggleGroup: () => void;
  onToggleThinking: (event: ThinkingEvent) => void;
  onToggleTool: (event: ToolEvent) => void;
  onOpenFile: (path: string) => void;
}

const ActivityGroup: FC<ActivityGroupProps> = ({ entries, active, expanded, isThinkingExpanded, isToolExpanded, onToggleGroup, onToggleThinking, onToggleTool, onOpenFile }) => {
  const tools = entries.flatMap((entry) => entry.type === "tool" ? [entry.event] : []);
  const summary = tools.length
    ? summarizeToolActivity(tools, active)
    : { label: active ? "正在思考" : "已思考", status: active ? "running" as const : "success" as const };

  return (
    <div className={`activity-group ${active ? "running" : "complete"} activity-status-${summary.status}`}>
      <button type="button" className="activity-summary" onClick={onToggleGroup} aria-expanded={expanded} aria-label={`${summary.label}，${activityStatusLabels[summary.status]}`}>
        <span>{summary.label}</span>
        <svg className={`activity-chevron ${expanded ? "open" : ""}`} viewBox="0 0 24 24" aria-hidden="true"><path d="m7 9 5 5 5-5" /></svg>
      </button>
      <div className={`activity-collapse ${expanded ? "expanded" : ""}`} aria-hidden={!expanded}>
        <div className="activity-collapse-inner">
          <div className="activity-timeline">
            {entries.map((entry) => entry.type === "thinking"
                ? <ThinkingItem key={`thinking-${entry.event.id}`} event={entry.event} expanded={isThinkingExpanded(entry.event)} onToggle={() => onToggleThinking(entry.event)} />
                : <ToolExecutionItem key={`tool-${entry.event.id}`} event={entry.event} expanded={isToolExpanded(entry.event)} onToggle={() => onToggleTool(entry.event)} onOpenFile={onOpenFile} />)}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ActivityGroup;
