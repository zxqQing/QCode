import { useEffect, useRef, useState, type FC, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import type { Session } from "../types/chat";
import type { SessionActions } from "./sidebarTypes";

const titleOf = (session: Session) => session.displayTitle || session.title || session.sessionId;

type Props = SessionActions & {
  projectId: string;
  sessions: Session[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  activeSessionId: string;
  activeProject: boolean;
  runningSessionKeys: string[];
};

const ProjectSessionList: FC<Props> = ({ projectId, sessions, loading, hasMore, onLoadMore, activeSessionId, activeProject, runningSessionKeys, onSelect, onRename, onDelete }) => (
  <div className="project-sessions-panel">
    {loading && !sessions.length && <div className="recent-empty">加载中…</div>}
    {!loading && !sessions.length && <div className="recent-empty">暂无会话</div>}
    {sessions.map((session) => (
      <SessionRow key={`${projectId}:${session.sessionId}`} session={session} active={activeProject && session.sessionId === activeSessionId} running={runningSessionKeys.includes(`${projectId}:${session.sessionId}`)} onClick={() => onSelect(session, projectId)} onRename={onRename} onDelete={onDelete} />
    ))}
    {hasMore && <button type="button" className="load-more-btn" disabled={loading} onClick={onLoadMore}>{loading ? "加载中…" : "展开显示"}</button>}
  </div>
);

type SessionRowProps = {
  session: Session;
  active?: boolean;
  running?: boolean;
  projectName?: string;
  onClick: () => void;
  onRename: (session: Session) => void;
  onDelete: (session: Session) => void;
};

export const SessionRow: FC<SessionRowProps> = ({ session, active, running, projectName, onClick, onRename, onDelete }) => {
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuPosition) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setMenuPosition(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuPosition(null);
    };
    const close = () => setMenuPosition(null);
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menuPosition]);

  const openContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const width = 140;
    const height = 40;
    setMenuPosition({
      top: Math.max(8, Math.min(event.clientY, window.innerHeight - height - 8)),
      left: Math.max(8, Math.min(event.clientX, window.innerWidth - width - 8))
    });
  };

  return <>
    <div className={`session-item codex-session-item ${active ? "active" : ""}`} role="treeitem" aria-level={2} title={`${titleOf(session)}${projectName ? ` · ${projectName}` : ""}`} onClick={onClick} onContextMenu={openContextMenu}>
      <span className="session-dot" />
      <span className="session-copy">
        <b>{titleOf(session)}</b>
        {projectName && <small>{projectName}</small>}
      </span>
      <span className="session-actions">
        <button type="button" aria-label="重命名会话" onClick={(event) => { event.stopPropagation(); onRename(session); }}>✎</button>
      </span>
      {running && <span className="session-running-spinner" role="status" title="正在运行" aria-label="正在运行" />}
    </div>
    {menuPosition && createPortal(
      <div ref={menuRef} className="project-actions-menu session-context-menu" role="menu" style={{ top: menuPosition.top, left: menuPosition.left }} onContextMenu={(event) => event.preventDefault()}>
        <button type="button" className="danger" role="menuitem" onClick={() => { setMenuPosition(null); onDelete(session); }}>删除会话</button>
      </div>,
      document.body
    )}
  </>;
};

export default ProjectSessionList;
