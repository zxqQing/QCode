import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import ChatMessages from "./components/ChatMessages";
import Composer from "./components/Composer";
import EmptyState from "./components/EmptyState";
import Sidebar from "./components/Sidebar";
import WorkspacePanel from "./components/WorkspacePanel";
import ModelSettingsPage from "./components/ModelSettingsPage";
import { NewProjectModal } from "./components/Sidebar";
import { useChat } from "./hooks/useChat";
import { usePermissionMode } from "./hooks/usePermissionMode";
import { fetchSessionFile } from "./services/filePreviewApi";
import type { FilePreview } from "./types/chat";
import "./styles/components.css";

const ChatPaneSplitter = ({ value, onMove, onStep }: { value: number; onMove: (event: PointerEvent<HTMLDivElement>) => void; onStep: (delta: number) => void }) => (
  <div className="file-preview-splitter" role="separator" aria-label="调整对话和右侧面板宽度" aria-orientation="vertical" aria-valuemin={25} aria-valuemax={70} aria-valuenow={Math.round(value)} tabIndex={0}
    onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); }}
    onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) onMove(event); }}
    onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); onStep(event.key === "ArrowRight" ? 2 : -2); } }} />
);

const FilePreviewPanel = lazy(() => import("./components/FilePreviewPanel"));
const normalizeFilePath = (path: string) => path.trim().replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\.\//, "");

function App() {
  const chat = useChat();
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [fileTabs, setFileTabs] = useState<FilePreview[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [filePreviewError, setFilePreviewError] = useState("");
  const [pendingFileCount, setPendingFileCount] = useState(0);
  const [chatPaneRatio, setChatPaneRatio] = useState(65);
  const sessionKey = `${chat.activeProjectId || "default"}:${chat.sessionId}`;
  const [fileStateSessionKey, setFileStateSessionKey] = useState(sessionKey);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const activeSessionRef = useRef(sessionKey);
  const pendingFileRequests = useRef(new Set<AbortController>());
  if (activeSessionRef.current !== sessionKey) activeSessionRef.current = sessionKey;
  const permissionState = usePermissionMode();

  useEffect(() => {
    pendingFileRequests.current.forEach((request) => request.abort());
    pendingFileRequests.current.clear();
    setFileStateSessionKey(sessionKey);
    setFileTabs([]);
    setActiveFilePath(null);
    setPendingFileCount(0);
    setFilePreviewError("");
  }, [sessionKey]);

  const openFile = async (filePath: string) => {
    const requestedPath = filePath.trim();
    if (!requestedPath) return;
    const normalizedPath = normalizeFilePath(requestedPath);
    const alreadyOpen = fileTabs.find((file) => [file.absolutePath, file.relativePath, file.requestedPath].some((path) => path && normalizeFilePath(path) === normalizedPath));
    if (alreadyOpen) {
      setActiveFilePath(alreadyOpen.absolutePath);
      setFilePreviewError("");
      return;
    }
    const sessionId = chat.sessionId;
    const projectId = chat.activeProjectId;
    const requestKey = `${projectId || "default"}:${sessionId}`;
    const controller = new AbortController();
    pendingFileRequests.current.add(controller);
    setPendingFileCount((count) => count + 1);
    setFilePreviewError("");
    try {
      const file = { ...(await fetchSessionFile(sessionId, projectId, requestedPath, controller.signal)), requestedPath };
      if (activeSessionRef.current !== requestKey) return;
      setFileTabs((current) => current.some((tab) => tab.absolutePath === file.absolutePath) ? current : [...current, file]);
      setActiveFilePath(file.absolutePath);
    } catch (error) {
      if (activeSessionRef.current === requestKey && !(error instanceof DOMException && error.name === "AbortError")) {
        setFilePreviewError(error instanceof Error ? error.message : "读取文件失败");
      }
    } finally {
      pendingFileRequests.current.delete(controller);
      if (activeSessionRef.current === requestKey) setPendingFileCount((count) => Math.max(0, count - 1));
    }
  };

  const closeFilePreview = () => {
    pendingFileRequests.current.forEach((request) => request.abort());
    pendingFileRequests.current.clear();
    setPendingFileCount(0);
    setFileTabs([]);
    setActiveFilePath(null);
    setFilePreviewError("");
  };

  const openChanges = () => {
    closeFilePreview();
    setWorkspaceOpen(true);
  };

  const closeFileTab = (path: string) => {
    const index = fileTabs.findIndex((file) => file.absolutePath === path);
    const nextFiles = fileTabs.filter((file) => file.absolutePath !== path);
    setFileTabs(nextFiles);
    if (!nextFiles.length) setFilePreviewError("");
    if (activeFilePath === path) setActiveFilePath(nextFiles[Math.min(index, nextFiles.length - 1)]?.absolutePath || null);
  };

  const resizeChatPane = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = workspaceRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const available = bounds.width - 6;
    const minimumChat = Math.min(320, available);
    const maximumChat = Math.max(minimumChat, available - Math.min(360, available / 2));
    const chatWidth = Math.max(minimumChat, Math.min(maximumChat, event.clientX - bounds.left));
    setChatPaneRatio((chatWidth / available) * 100);
  };

  const isFilePreviewOpen = fileStateSessionKey === sessionKey && (fileTabs.length > 0 || pendingFileCount > 0 || Boolean(filePreviewError));
  const isReviewOpen = workspaceOpen && !isFilePreviewOpen;
  const isSplitPaneOpen = isFilePreviewOpen || isReviewOpen;

  if (settingsOpen) return <ModelSettingsPage onBack={() => setSettingsOpen(false)} permissionState={permissionState} />;

  return (
    <div className={`app sidebar-is-open ${workspaceOpen ? "workspace-is-open" : "workspace-is-closed"}`}>
      <div className="main-container">
        <div className="sidebar-slot"><Sidebar sessions={chat.sessions} sessionsLoading={chat.sessionsLoading} projects={chat.projects} projectsLoading={chat.projectsLoading} projectError={chat.projectError} activeProjectId={chat.activeProjectId} sessionId={chat.sessionId} runningSessionKeys={chat.runningSessionKeys} onNewChat={chat.newChat} onSelectProject={chat.selectProject} onSelectSession={chat.selectSession} onRefreshProjects={chat.loadProjects} onCreateProject={chat.createNewProject} onRenameSession={chat.renameSession} onDeleteSession={chat.deleteSession} onRenameProject={chat.renameProject} onDeleteProject={chat.deleteProject} onOpenSettings={() => { void permissionState.refresh(); setSettingsOpen(true); }} /></div>
        <div ref={workspaceRef} className={`chat-workspace ${isSplitPaneOpen ? "file-preview-open" : ""} ${isReviewOpen ? "change-review-open" : ""}`} style={{ "--chat-pane-ratio": `${chatPaneRatio}%` } as CSSProperties}>
          <main className={`content ${isSplitPaneOpen ? "file-preview-chat" : ""}`}>
            <header className="content-header"><div className="content-title"><span className="content-project" role="img" tabIndex={0} aria-label={`项目：${chat.activeProject?.name || "未选择项目"}`}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /></svg><span className="content-project-tooltip" role="tooltip">{chat.activeProject?.name || "未选择项目"}</span></span><span className="content-session" title={chat.sessionTitle}>{chat.sessionTitle}</span></div><div className="content-header-actions"><span className="connection-status"><i /> 已连接</span><button className="header-icon-btn" title="新建会话" onClick={chat.newChat}>＋</button>{!isSplitPaneOpen && <button className="workspace-trigger" onClick={() => setWorkspaceOpen((open) => !open)}>{workspaceOpen ? "隐藏工作区" : "打开工作区"}</button>}</div></header>
            <div className="conversation-area">
              {!chat.messages.length && <EmptyState />}
              {Boolean(chat.messages.length) && <ChatMessages messages={chat.messages} pendingConfirm={chat.pendingConfirm} errorMessage={chat.errorMessage} onConfirm={chat.confirmTool} onOpenFile={(path) => { void openFile(path); }} onOpenChanges={openChanges} />}
            </div>
            <Composer projects={chat.projects} activeProject={chat.activeProject} onSelectProject={chat.selectProject} onCreateProject={() => setProjectDialogOpen(true)} disabled={chat.isStreaming || Boolean(chat.pendingConfirm)} stopping={chat.isStopping} sessionId={chat.sessionId} onStop={chat.stopStreaming} workspaceOpen={workspaceOpen && !isFilePreviewOpen} showContext={chat.isNewChat} onSend={chat.sendMessage} permissionState={permissionState} planMode={chat.planMode} onPlanModeChange={chat.setPlanMode} />
          </main>
          {isReviewOpen
            ? <>
                <ChatPaneSplitter value={chatPaneRatio} onMove={resizeChatPane} onStep={(delta) => setChatPaneRatio((ratio) => Math.max(25, Math.min(70, ratio + delta)))} />
                <WorkspacePanel sessionId={chat.sessionId} projectId={chat.activeProjectId} requestRevision={chat.requestRevision} open={workspaceOpen} expanded onClose={() => setWorkspaceOpen(false)} />
              </>
            : isFilePreviewOpen
            ? <>
                <ChatPaneSplitter value={chatPaneRatio} onMove={resizeChatPane} onStep={(delta) => setChatPaneRatio((ratio) => Math.max(25, Math.min(70, ratio + delta)))} />
                <Suspense fallback={<aside className="file-preview-panel"><div className="file-preview-loading">正在加载编辑器…</div></aside>}>
                  <FilePreviewPanel sessionId={chat.sessionId} files={fileTabs} activePath={activeFilePath} loading={pendingFileCount > 0} error={filePreviewError} onSelect={setActiveFilePath} onCloseTab={closeFileTab} onClosePreview={closeFilePreview} />
                </Suspense>
              </>
            : <WorkspacePanel sessionId={chat.sessionId} projectId={chat.activeProjectId} requestRevision={chat.requestRevision} open={workspaceOpen} onClose={() => setWorkspaceOpen(false)} />}
        </div>
      </div>
      {projectDialogOpen && <NewProjectModal onClose={() => setProjectDialogOpen(false)} onCreate={async (input) => { const project = await chat.createNewProject(input); chat.selectProject(project); setProjectDialogOpen(false); }} />}
    </div>
  );
}

export default App;
