import { useId, type FC } from "react";
import type { ThinkingEvent } from "../types/chat";
import { renderMarkdown } from "../utils/markdown";

interface ThinkingItemProps {
  event: ThinkingEvent;
  expanded: boolean;
  onToggle: () => void;
}

const ThinkingItem: FC<ThinkingItemProps> = ({ event, expanded, onToggle }) => {
  const contentId = useId();

  return (
    <div className={`thinking-item ${event.streaming ? "streaming" : ""}`}>
      <button type="button" className="thinking-item-summary" onClick={onToggle} aria-expanded={expanded} aria-controls={contentId}>
        <span className="thinking-item-icon" aria-hidden="true">
          {event.streaming ? <i className="tool-spinner" /> : <svg viewBox="0 0 24 24"><path d="M9 4a3 3 0 0 0-3 3v1a3 3 0 0 0-2 5.2A3 3 0 0 0 7 18h2m6-14a3 3 0 0 1 3 3v1a3 3 0 0 1 2 5.2 3 3 0 0 1-3 4.8h-2M9 4v16m6-16v16M9 9H7m8 0h2M9 15H7m8 0h2" /></svg>}
        </span>
        <span>{event.streaming ? "思考中" : "思考"}</span>
        <svg className={`tool-chevron ${expanded ? "open" : ""}`} viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      <div className={`thinking-item-collapse ${expanded ? "expanded" : ""}`} aria-hidden={!expanded}>
        <div className="thinking-item-collapse-inner">
          <div className="thinking-item-card">
            <div
              id={contentId}
              className="thinking-item-content markdown-content"
              tabIndex={expanded ? 0 : undefined}
              dangerouslySetInnerHTML={{ __html: renderMarkdown(event.content || (event.streaming ? "正在分析…" : "")) }}
            />
            <button type="button" className="thinking-item-card-toggle" onClick={onToggle} aria-expanded={expanded} aria-controls={contentId} aria-label="收起思考内容">
              <svg className="tool-chevron open" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ThinkingItem;
