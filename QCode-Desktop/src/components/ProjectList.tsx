import type { FC } from "react";
import ProjectGroup from "./ProjectGroup";
import type { SidebarProjectProps } from "./sidebarTypes";

type Props = SidebarProjectProps & { onAddProject: () => void; expanded: boolean; onExpandedChange: (expanded: boolean) => void };

const ProjectList: FC<Props> = ({ projects, projectsLoading, activeProjectId, activeSessionId, runningSessionKeys, expandedProjects, projectSessions, busyProjectId, onToggle, onLoadMore, sessionActions, projectActions, onAddProject, expanded, onExpandedChange }) => (
    <section className={`sidebar-section codex-section project-list ${expanded ? "section-expanded" : "section-collapsed"}`} role="tree" aria-label="项目文件树">
      <div className="section-heading">
        <button type="button" className="section-heading-main" onClick={() => onExpandedChange(!expanded)} aria-expanded={expanded}>
          <svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /></svg><span>项目</span>
        </button>
        <button type="button" className="section-action" title="添加项目" aria-label="添加项目" onClick={onAddProject}>+</button>
      </div>
      <div className="section-body-collapse" aria-hidden={!expanded}>
        {expanded && <>
          {projectsLoading && <div className="recent-empty">加载项目中…</div>}
          {!projectsLoading && !projects.length && <div className="recent-empty">暂无项目</div>}
          {projects.map((project) => <ProjectGroup key={project.projectId} project={project} open={Boolean(expandedProjects[project.projectId])} active={project.projectId === activeProjectId} activeSessionId={activeSessionId} runningSessionKeys={runningSessionKeys} page={projectSessions[project.projectId]} loading={busyProjectId === project.projectId} query="" onToggle={onToggle} onLoadMore={onLoadMore} sessionActions={sessionActions} projectActions={projectActions} />)}
        </>}
      </div>
    </section>
  );

export default ProjectList;
