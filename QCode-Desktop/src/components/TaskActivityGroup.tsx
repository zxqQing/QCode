import type { FC, ReactNode } from "react";

interface TaskActivityGroupProps {
  active: boolean;
  expanded: boolean;
  durationMs?: number;
  startedAt?: number;
  onToggle: () => void;
  children: ReactNode;
}

const TaskActivityGroup: FC<TaskActivityGroupProps> = ({ active, expanded, onToggle, children }) => {
  const label = active ? "思考中" : "任务已完成";

  return <div className={`task-activity-group ${active ? "running" : "complete"}`}>
    <button type="button" className="task-activity-summary" onClick={onToggle} aria-expanded={expanded}>
      <span className="task-activity-summary-label">
        <span>{label}</span>
        <svg className={`activity-chevron ${expanded ? "open" : ""}`} viewBox="0 0 24 24" aria-hidden="true"><path d="m7 9 5 5 5-5" /></svg>
      </span>
      <i aria-hidden="true" />
    </button>
    <div className={`task-activity-collapse ${expanded ? "expanded" : ""}`} aria-hidden={!expanded}>
      <div className="task-activity-collapse-inner">{children}</div>
    </div>
  </div>;
};

export default TaskActivityGroup;
