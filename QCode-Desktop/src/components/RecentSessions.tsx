import type { FC } from "react";
import type { Session } from "../types/chat";
import { SessionRow } from "./ProjectSessionList";
import type { SessionActions } from "./sidebarTypes";

type Props = SessionActions & { sessions: Session[]; loading: boolean; activeSessionId: string; activeProjectId: string | null; runningSessionKeys: string[]; expanded: boolean; onExpandedChange: (expanded: boolean) => void };

const RecentSessions: FC<Props> = ({ sessions, loading, activeSessionId, activeProjectId, runningSessionKeys, onSelect, onRename, onDelete, expanded, onExpandedChange }) => (
    <section className={`sidebar-section codex-section recent-sessions ${expanded ? "section-expanded" : "section-collapsed"}`}>
      <button type="button" className="section-heading section-heading-button" onClick={() => onExpandedChange(!expanded)} aria-expanded={expanded}>
        <span className="section-heading-main"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></svg><span>最近会话</span></span>
      </button>
      <div className="section-body-collapse" aria-hidden={!expanded}>
        {expanded && <>
          {loading && !sessions.length && <div className="recent-empty">加载中…</div>}
          {!loading && !sessions.length && <div className="recent-empty">暂无会话</div>}
          {sessions.map((session) => {
            const key = `${session.projectId || "default"}:${session.sessionId}`;
            return <SessionRow key={key} session={session} active={session.sessionId === activeSessionId && (session.projectId || null) === activeProjectId} running={runningSessionKeys.includes(key)} projectName={session.projectName || undefined} onClick={() => onSelect(session, session.projectId || null)} onRename={onRename} onDelete={onDelete} />;
          })}
        </>}
      </div>
    </section>
  );

export default RecentSessions;
