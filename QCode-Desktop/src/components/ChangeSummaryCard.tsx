import { useState, type FC } from "react";
import type { ChangeSummary } from "../types/chat";

const DEFAULT_VISIBLE_FILES = 3;

const ChangeSummaryCard: FC<{ summary: ChangeSummary; onOpenChanges: () => void }> = ({ summary, onOpenChanges }) => {
  const [expanded, setExpanded] = useState(false);
  const visibleFiles = expanded ? summary.files : summary.files.slice(0, DEFAULT_VISIBLE_FILES);
  const remaining = Math.max(0, summary.files.length - DEFAULT_VISIBLE_FILES);

  return <section className="change-summary-card" aria-label={`已编辑 ${summary.files.length} 个文件`}>
    <header className="change-summary-header">
      <span className="change-summary-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="3" /><path d="M9 9h6M12 6v6M8 16h8" /></svg>
      </span>
      <div className="change-summary-heading">
        <strong>已编辑 {summary.files.length} 个文件</strong>
        <span className="change-summary-totals"><b>+{summary.additions}</b><i>−{summary.deletions}</i></span>
      </div>
      <button type="button" className="change-summary-open" onClick={onOpenChanges}>查看变更</button>
    </header>
    <div className="change-summary-files">
      {visibleFiles.map((file) => <button type="button" className="change-summary-file" key={file.path} title={file.absolutePath || file.path} onClick={onOpenChanges}>
        <span>{file.absolutePath || file.path}</span>
        <small><b>+{file.additions}</b><i>−{file.deletions}</i></small>
      </button>)}
      {remaining > 0 && <button type="button" className="change-summary-more" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
        {expanded ? "收起文件" : `再显示 ${remaining} 个文件`}
        <svg className={expanded ? "expanded" : ""} viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
      </button>}
    </div>
  </section>;
};

export default ChangeSummaryCard;
