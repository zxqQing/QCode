import { useLayoutEffect, useRef, useState, type FC } from "react";
import { createPortal } from "react-dom";
import type { Project, Session } from "../types/chat";
import ProjectSessionList from "./ProjectSessionList";
import type { ProjectSessionState, ProjectActions, SessionActions } from "./sidebarTypes";

type Props = {
  project: Project;
  open: boolean;
  active: boolean;
  activeSessionId: string;
  runningSessionKeys: string[];
  page: ProjectSessionState[string];
  loading: boolean;
  query: string;
  onToggle: (project: Project) => void;
  onLoadMore: (project: Project) => void;
  sessionActions: SessionActions;
  projectActions: ProjectActions;
};

const ProjectGroup: FC<Props> = ({ project, open, active, activeSessionId, runningSessionKeys, page, loading, onToggle, onLoadMore, sessionActions, projectActions }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!menuOpen) {
      setMenuPosition(null);
      return;
    }

    const updatePosition = () => {
      const anchor = menuButtonRef.current?.getBoundingClientRect();
      const menu = menuRef.current;
      if (!anchor || !menu) return;

      const bounds = menu.getBoundingClientRect();
      const gap = 6;
      const openAbove = window.innerHeight - anchor.bottom < bounds.height + gap && anchor.top > bounds.height + gap;
      const top = openAbove ? anchor.top - bounds.height - gap : anchor.bottom + gap;
      const left = Math.max(8, Math.min(anchor.right - bounds.width, window.innerWidth - bounds.width - 8));
      setMenuPosition({ top, left });
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !menuButtonRef.current?.contains(target)) setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    updatePosition();
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [menuOpen]);

  return <section className={`project-group ${open ? "expanded" : "collapsed"}`} role="treeitem" aria-expanded={open} aria-level={1}>
    <div className={`project-header codex-project-header ${active ? "active" : ""}`} title={project.rootPath || project.name}>
      <button type="button" className="project-name-button" onClick={() => onToggle(project)}>
        <svg className="folder-icon" viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /></svg>
        <span className="tree-label">{project.name}</span>
      </button>
      <button type="button" className="project-new-chat-btn" title={`在${project.name}中新建会话`} aria-label={`在${project.name}中新建会话`} onClick={(event) => { event.stopPropagation(); projectActions.onNewChat(project); }}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7.5" /><path d="m11 13 8.8-8.8a1.6 1.6 0 0 1 2.2 2.2L13.2 15.2 10 16Z" /></svg>
      </button>
      <button ref={menuButtonRef} type="button" className="project-menu-btn" title="项目操作" aria-label="项目操作" aria-expanded={menuOpen} onClick={(event) => { event.stopPropagation(); setMenuOpen((value) => !value); }}>•••</button>
      {menuOpen && createPortal(<div ref={menuRef} className="project-actions-menu" style={{ top: menuPosition?.top ?? 0, left: menuPosition?.left ?? 0, visibility: menuPosition ? "visible" : "hidden" }} onClick={(event) => event.stopPropagation()}>
        <button type="button" onClick={() => { setMenuOpen(false); projectActions.onRefresh(project); }}>刷新会话</button>
        <button type="button" onClick={() => { setMenuOpen(false); projectActions.onRename(project); }}>重命名项目</button>
        <button type="button" className="danger" onClick={() => { setMenuOpen(false); projectActions.onDelete(project); }}>删除项目</button>
      </div>, document.body)}
    </div>
    <div className="project-session-collapse" role="group" aria-hidden={!open}>
      {open && <ProjectSessionList projectId={project.projectId} sessions={page?.items || []} loading={loading} hasMore={Boolean(page?.hasMore)} activeSessionId={activeSessionId} activeProject={active} runningSessionKeys={runningSessionKeys} onLoadMore={() => onLoadMore(project)} {...sessionActions} />}
    </div>
  </section>;
};

export default ProjectGroup;
