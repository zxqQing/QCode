import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchRecentSessions } from "../services/chatApi";
import { fetchProjectSessions } from "../services/projectApi";
import type { CreateProjectInput, PageResult, Project, Session } from "../types/chat";
import SidebarHeader from "./SidebarHeader";
import ProjectList from "./ProjectList";
import RecentSessions from "./RecentSessions";
import SidebarFooter from "./SidebarFooter";

type Props = {
  sessions: Session[];
  sessionsLoading?: boolean;
  projects: Project[];
  projectsLoading?: boolean;
  projectError?: string;
  activeProjectId: string | null;
  sessionId: string;
  runningSessionKeys: string[];
  onNewChat: () => void;
  onSelectProject: (project: Project | null) => void;
  onSelectSession: (session: Session, projectId?: string | null) => void | Promise<void>;
  onRefreshProjects: () => Promise<unknown>;
  onCreateProject: (input: CreateProjectInput) => Promise<Project>;
  onRenameSession: (sessionId: string, title: string, projectId?: string | null) => Promise<void>;
  onDeleteSession: (sessionId: string, projectId?: string | null) => Promise<void>;
  onRenameProject: (project: Project, name: string) => Promise<void>;
  onDeleteProject: (projectId: string) => Promise<void>;
  onOpenSettings: () => void;
};

const PROJECT_STATE_KEY = "qcode-sidebar-expanded-projects";
const PROJECTS_SECTION_KEY = "qcode-sidebar-projects-expanded";
const RECENT_SECTION_KEY = "qcode-sidebar-recent-expanded";
const WIDTH_KEY = "qcode-sidebar-width";
const THEME_KEY = "qcode-theme";
const PROJECT_SESSION_PAGE_SIZE = 5;

const titleOf = (session: Session) => session.displayTitle || session.title || session.sessionId;
const sessionKey = (session: Session) => `${session.projectId || "default"}:${session.sessionId}`;
const timestampOf = (session: Session) => {
  const value = session.updatedAt;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
};

function readBoolean(key: string, fallback: boolean): boolean {
  try {
    const value = localStorage.getItem(key);
    return value == null ? fallback : value === "true";
  } catch { return fallback; }
}

function readExpandedProjects(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(PROJECT_STATE_KEY) || "{}"); } catch { return {}; }
}

export default function Sidebar(props: Props) {
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>(readExpandedProjects);
  const [projectsExpanded, setProjectsExpanded] = useState(() => readBoolean(PROJECTS_SECTION_KEY, true));
  const [recentExpanded, setRecentExpanded] = useState(() => readBoolean(RECENT_SECTION_KEY, true));
  const [search, setSearch] = useState("");
  const [recentLoading, setRecentLoading] = useState(false);
  const [recentSessions, setRecentSessions] = useState<Session[]>(props.sessions || []);
  const [sessionStore, setSessionStore] = useState<Record<string, Session>>(() => Object.fromEntries((props.sessions || []).map((session) => [sessionKey(session), session])));
  const [projectSessions, setProjectSessions] = useState<Record<string, PageResult<Session>>>({});
  const [busyProjectId, setBusyProjectId] = useState<string | null>(null);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [width, setWidth] = useState(() => Number(localStorage.getItem(WIDTH_KEY) || 256));
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || "light");
  const recentRequestId = useRef(0);
  const projectRequestIds = useRef<Record<string, number>>({});

  const mergeSessions = useCallback((sessions: Session[]) => {
    setSessionStore((current) => {
      const next = { ...current };
      sessions.forEach((session) => {
        const key = sessionKey(session);
        next[key] = { ...next[key], ...session };
      });
      return next;
    });
  }, []);

  const loadRecent = async (query: string) => {
    const requestId = ++recentRequestId.current;
    setRecentLoading(true);
    try {
      const items = (await fetchRecentSessions(query, "", 30)).items;
      if (requestId !== recentRequestId.current) return;
      mergeSessions(items);
      setRecentSessions(items);
    } catch {
      // 搜索刷新失败时保留当前内容。
    } finally {
      if (requestId === recentRequestId.current) setRecentLoading(false);
    }
  };

  useEffect(() => { try { localStorage.setItem(PROJECT_STATE_KEY, JSON.stringify(expandedProjects)); } catch { /* ignore */ } }, [expandedProjects]);
  useEffect(() => { localStorage.setItem(PROJECTS_SECTION_KEY, String(projectsExpanded)); }, [projectsExpanded]);
  useEffect(() => { localStorage.setItem(RECENT_SECTION_KEY, String(recentExpanded)); }, [recentExpanded]);
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem(THEME_KEY, theme); }, [theme]);
  useEffect(() => {
    const nextWidth = Math.max(240, Math.min(280, width));
    document.documentElement.style.setProperty("--sidebar-width", `${nextWidth}px`);
    localStorage.setItem(WIDTH_KEY, String(nextWidth));
  }, [width]);

  const loadProject = async (project: Project, force = false) => {
    if (!force && projectSessions[project.projectId]) return;
    const requestId = (projectRequestIds.current[project.projectId] || 0) + 1;
    projectRequestIds.current[project.projectId] = requestId;
    setBusyProjectId(project.projectId);
    try {
      const page = await fetchProjectSessions(project.projectId, search, "", PROJECT_SESSION_PAGE_SIZE);
      if (projectRequestIds.current[project.projectId] !== requestId) return;
      mergeSessions(page.items);
      setProjectSessions((current) => ({ ...current, [project.projectId]: page }));
    } catch {
      // 后台刷新失败时保留上一次成功加载的项目会话。
    } finally {
      if (projectRequestIds.current[project.projectId] === requestId) {
        setBusyProjectId((current) => current === project.projectId ? null : current);
      }
    }
  };

  useEffect(() => {
    mergeSessions(props.sessions || []);
    if (!search.trim()) {
      recentRequestId.current += 1;
      setRecentLoading(false);
      setRecentSessions(props.sessions || []);
    }
    const openProjects = props.projects.filter((project) => expandedProjects[project.projectId]);
    void Promise.all(openProjects.map((project) => loadProject(project, true)));
  }, [props.sessions]);

  useEffect(() => {
    const query = search.trim();
    if (!query) {
      recentRequestId.current += 1;
      setRecentLoading(false);
      setRecentSessions(props.sessions || []);
      return;
    }
    const timer = window.setTimeout(() => { void loadRecent(query); }, 200);
    return () => window.clearTimeout(timer);
  }, [search, props.sessions, mergeSessions]);

  const toggleProject = (project: Project) => {
    const next = !expandedProjects[project.projectId];
    setExpandedProjects((current) => ({ ...current, [project.projectId]: next }));
    if (next) void loadProject(project, true);
  };

  useEffect(() => {
    const openProjects = props.projects.filter((project) => expandedProjects[project.projectId]);
    const timer = window.setTimeout(() => {
      void Promise.all(openProjects.map((project) => loadProject(project, true)));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [search]);

  const loadMore = async (project: Project) => {
    const page = projectSessions[project.projectId];
    if (!page?.hasMore || !page.nextCursor || busyProjectId === project.projectId) return;
    setBusyProjectId(project.projectId);
    try {
      const next = await fetchProjectSessions(project.projectId, search, page.nextCursor, PROJECT_SESSION_PAGE_SIZE);
      mergeSessions(next.items);
      setProjectSessions((current) => {
        const latestPage = current[project.projectId] || page;
        return { ...current, [project.projectId]: {
          ...next,
          items: [...latestPage.items, ...next.items.filter((session) => !latestPage.items.some((item) => item.sessionId === session.sessionId))]
        } };
      });
    } finally {
      setBusyProjectId((current) => current === project.projectId ? null : current);
    }
  };

  const visibleRecent = useMemo(() => {
    const query = search.trim().toLowerCase();
    return recentSessions
      .map((session) => sessionStore[sessionKey(session)] || session)
      .filter((session) => !query || `${titleOf(session)} ${session.sessionId} ${session.projectName || ""}`.toLowerCase().includes(query))
      .sort((a, b) => timestampOf(b) - timestampOf(a));
  }, [recentSessions, sessionStore, search]);

  const sharedProjectSessions = useMemo(() => Object.fromEntries(
    Object.entries(projectSessions).map(([projectId, page]) => [projectId, page ? {
      ...page,
      items: page.items.map((session) => sessionStore[sessionKey(session)] || session)
    } : page])
  ), [projectSessions, sessionStore]);

  const renameSession = async (session: Session) => {
    const value = window.prompt("重命名会话", titleOf(session));
    if (!value?.trim()) return;
    await props.onRenameSession(session.sessionId, value.trim(), session.projectId || null);
  };
  const deleteSession = async (session: Session) => {
    if (!window.confirm(`确定删除“${titleOf(session)}”？此操作不可撤销。`)) return;
    await props.onDeleteSession(session.sessionId, session.projectId || null);
  };
  const renameProject = async (project: Project) => {
    const value = window.prompt("重命名项目", project.name);
    if (value?.trim()) await props.onRenameProject(project, value.trim());
  };
  const deleteProject = async (project: Project) => {
    if (window.confirm(`删除项目“${project.name}”？会话历史会保留。`)) await props.onDeleteProject(project.projectId);
  };

  return (
    <aside className="sidebar codex-sidebar" style={{ width: "var(--sidebar-width, 256px)" }}>
      <SidebarHeader search={search} onSearchChange={setSearch} onNewChat={props.onNewChat} />
      <div className="sidebar-scroll">
        <ProjectList
          projects={props.projects}
          projectsLoading={Boolean(props.projectsLoading)}
          activeProjectId={props.activeProjectId}
          activeSessionId={props.sessionId}
          runningSessionKeys={props.runningSessionKeys}
          expandedProjects={expandedProjects}
          projectSessions={sharedProjectSessions}
          busyProjectId={busyProjectId}
          query={search}
          onToggle={toggleProject}
          onLoadMore={(project) => void loadMore(project)}
          sessionActions={{ onSelect: props.onSelectSession, onRename: (session) => void renameSession(session), onDelete: (session) => void deleteSession(session) }}
          projectActions={{ onNewChat: (project) => props.onSelectProject(project), onRefresh: (project) => void loadProject(project, true), onRename: (project) => void renameProject(project), onDelete: (project) => void deleteProject(project) }}
          onAddProject={() => setNewProjectOpen(true)}
          expanded={projectsExpanded}
          onExpandedChange={setProjectsExpanded}
        />
        <div className="sidebar-divider" />
        <RecentSessions
          sessions={visibleRecent}
          loading={recentLoading || Boolean(props.sessionsLoading)}
          activeSessionId={props.sessionId}
          activeProjectId={props.activeProjectId}
          runningSessionKeys={props.runningSessionKeys}
          onSelect={props.onSelectSession}
          onRename={(session) => void renameSession(session)}
          onDelete={(session) => void deleteSession(session)}
          expanded={recentExpanded}
          onExpandedChange={setRecentExpanded}
        />
      </div>
      <SidebarFooter onClick={props.onOpenSettings} />
      {false && <div className="sidebar-popover settings-popover">
        <b>侧边栏设置</b>
        <label>宽度 <input type="range" min="240" max="280" value={width} onChange={(event) => setWidth(Number(event.target.value))} /> {width}px</label>
        <label>主题 <select value={theme} onChange={(event) => setTheme(event.target.value)}><option value="light">浅色</option><option value="dark">深色</option></select></label>
        <button type="button" onClick={() => { localStorage.removeItem(PROJECT_STATE_KEY); setExpandedProjects({}); }}>清理折叠状态</button>
      </div>}
      {newProjectOpen && <NewProjectModal onClose={() => setNewProjectOpen(false)} onCreate={async (input) => { await props.onCreateProject(input); setNewProjectOpen(false); }} />}
    </aside>
  );
}

export function NewProjectModal({ onClose, onCreate }: { onClose: () => void; onCreate: (input: CreateProjectInput) => Promise<unknown> }) {
  const [name, setName] = useState("");
  const [folders, setFolders] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [pickerError, setPickerError] = useState("");
  const addFolder = async () => {
    setPickerError("");
    if (window.electronAPI?.selectDirectory) {
      try {
        const result = await window.electronAPI.selectDirectory();
        if (!result.canceled) addFolderPath(result.path);
        return;
      } catch (error) {
        console.warn("打开文件夹选择器失败：", error);
        setPickerError("无法打开文件夹选择器，请使用 Electron 桌面版");
      }
    } else {
      setPickerError("请在 Electron 桌面版中选择文件夹");
    }
  };
  const addFolderPath = (value: string) => {
    const path = value.trim();
    if (path && !folders.some((folder) => folder.toLowerCase() === path.toLowerCase())) {
      setFolders((current) => [...current, path]);
      setPickerError("");
    }
  };
  const removeFolder = (path: string) => setFolders((current) => current.filter((folder) => folder !== path));
  const makePrimary = (path: string) => setFolders((current) => [path, ...current.filter((folder) => folder !== path)]);
  const submit = async () => {
    if (!name.trim() || !folders.length || saving) return;
    setSaving(true);
    try {
      await onCreate({ name: name.trim(), rootPath: folders[0], additionalRoots: folders.slice(1) });
    } finally {
      setSaving(false);
    }
  };
  const folderName = (path: string) => path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || path;
  return <div className="project-modal-backdrop" role="presentation"><div className="project-modal" role="dialog" aria-modal="true" aria-labelledby="create-project-title">
    <div className="project-modal-header"><h2 id="create-project-title">创建项目</h2><button className="modal-close" type="button" aria-label="关闭" onClick={onClose}>×</button></div>
    <label className="project-name-input"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /></svg><input autoFocus placeholder="项目名称" value={name} onChange={(event) => setName(event.target.value)} /></label>
    <div className="project-form-label-row"><div className="project-form-label">源文件夹</div><span className="project-computer"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="12" rx="1.5" /><path d="M2.5 20h19" /></svg>此电脑</span></div>
    <div className={`project-path-box ${folders.length ? "has-folders" : "empty"}`}>
      {!folders.length && <div className="project-path-top"><span className="project-path-prompt">在此电脑上添加文件夹<span className="path-chevron">⌄</span></span><button className="folder-add-button" type="button" onClick={() => void addFolder()}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /><path d="M12 11v6m-3-3h6" /></svg>添加</button>{pickerError && <small className="project-picker-error">{pickerError}</small>}</div>}
      {folders.map((path, index) => <div className="project-folder-row" key={path} title={path}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /></svg><div className="project-folder-copy"><strong>{folderName(path)}</strong></div>{index === 0 ? <span className="folder-primary active">主要</span> : <button className="folder-primary" type="button" onClick={() => makePrimary(path)}>设为主要</button>}<button className="folder-remove" type="button" aria-label={`移除${folderName(path)}`} onClick={() => removeFolder(path)}>×</button></div>)}
      {folders.length > 0 && <button className="project-add-row" type="button" onClick={() => void addFolder()}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /><path d="M12 11v6m-3-3h6" /></svg>添加文件夹</button>}
    </div>
    <div className="project-modal-actions"><button className="project-cancel" type="button" onClick={onClose}>取消</button><button type="button" className="project-create" disabled={!name.trim() || !folders.length || saving} onClick={() => void submit()}>{saving ? "创建中…" : "创建项目"}</button></div>
  </div></div>;
}
