import type { CreateProjectInput, PageResult, Project, Session } from "../types/chat";

export type SessionActions = {
  onSelect: (session: Session, projectId?: string | null) => void | Promise<void>;
  onRename: (session: Session) => void;
  onDelete: (session: Session) => void;
};

export type ProjectActions = {
  onNewChat: (project: Project) => void;
  onRefresh: (project: Project) => void;
  onRename: (project: Project) => void;
  onDelete: (project: Project) => void;
};

export type ProjectSessionState = Record<string, PageResult<Session> | undefined>;

export type SidebarProjectProps = {
  projects: Project[];
  projectsLoading: boolean;
  activeProjectId: string | null;
  activeSessionId: string;
  runningSessionKeys: string[];
  expandedProjects: Record<string, boolean>;
  projectSessions: ProjectSessionState;
  busyProjectId: string | null;
  query: string;
  onToggle: (project: Project) => void;
  onLoadMore: (project: Project) => void;
  sessionActions: SessionActions;
  projectActions: ProjectActions;
};

export type SidebarHeaderProps = {
  search: string;
  onSearchChange: (value: string) => void;
  onNewChat: () => void;
};

export type NewProjectInput = {
  onClose: () => void;
  onCreate: (input: CreateProjectInput) => Promise<void>;
};
