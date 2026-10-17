import { DiffEditor } from "@monaco-editor/react";
import { useEffect, useRef, useState, type CSSProperties, type FC, type PointerEvent, type ReactNode } from "react";
import type { editor } from "monaco-editor";
import { fetchSessionChanges, type SessionChangeFile, type SessionChangesResponse } from "../services/sessionChangesApi";

interface WorkspacePanelProps {
  sessionId: string;
  projectId: string | null;
  requestRevision: number;
  open: boolean;
  onClose: () => void;
  expanded?: boolean;
}

const Icon: FC<{ name: string; size?: number }> = ({ name, size = 16 }) => {
  const paths: Record<string, ReactNode> = {
    chevron: <path d="m6 9 6 6 6-6" />,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    tree: <><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  };
  return <svg className="ui-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
};

type ChangeTreeNode = { name: string; path: string; file?: SessionChangeFile; children: ChangeTreeNode[] };

const DIFF_EDITOR_OPTIONS: editor.IDiffEditorConstructionOptions = {
  readOnly: true,
  originalEditable: false,
  renderSideBySide: true,
  minimap: { enabled: false },
  automaticLayout: true,
  scrollBeyondLastLine: false,
  fontSize: 12,
  lineNumbers: "on",
  glyphMargin: true,
  wordWrap: "off",
  hideUnchangedRegions: { enabled: true, contextLineCount: 3, minimumLineCount: 5 },
};

function buildChangeTree(files: SessionChangeFile[]): ChangeTreeNode[] {
  const roots: ChangeTreeNode[] = [];
  const folders = new Map<string, ChangeTreeNode>();
  for (const file of files) {
    const parts = file.path.replace(/\\/g, "/").split("/").filter(Boolean);
    let siblings = roots;
    let parentPath = "";
    parts.forEach((part, index) => {
      const path = parentPath ? `${parentPath}/${part}` : part;
      if (index === parts.length - 1) {
        siblings.push({ name: part, path: file.path, file, children: [] });
      } else {
        let folder = folders.get(path);
        if (!folder) {
          folder = { name: part, path, children: [] };
          folders.set(path, folder);
          siblings.push(folder);
        }
        siblings = folder.children;
        parentPath = path;
      }
    });
  }
  const sortNodes = (nodes: ChangeTreeNode[]) => {
    nodes.sort((a, b) => Number(Boolean(a.file)) - Number(Boolean(b.file)) || a.name.localeCompare(b.name));
    nodes.forEach((node) => sortNodes(node.children));
  };
  sortNodes(roots);
  return roots;
}

function diffEditorHeight(file: SessionChangeFile): number {
  const oldLines = (file.oldContent ?? "").split(/\r?\n/).length;
  const newLines = (file.newContent ?? "").split(/\r?\n/).length;
  return Math.max(140, Math.min(520, Math.max(oldLines, newLines) * 19 + 48));
}

const DiffReview: FC<{ sessionId: string; projectId: string | null; requestRevision: number }> = ({ sessionId, projectId, requestRevision }) => {
  const [data, setData] = useState<SessionChangesResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedPath, setSelectedPath] = useState("");
  const [treeVisible, setTreeVisible] = useState(false);
  const [treeWidth, setTreeWidth] = useState(290);
  const [filter, setFilter] = useState("");
  const [collapsedDirs, setCollapsedDirs] = useState<Record<string, boolean>>({});
  const [collapsedDiffs, setCollapsedDiffs] = useState<Record<string, boolean>>({});
  const fileRefs = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetchSessionChanges(sessionId, projectId, controller.signal).then((result) => {
      setData(result);
      setSelectedPath((current) => result.files.some((file) => file.path === current) ? current : result.files[0]?.path ?? "");
    }).catch((cause) => {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) setError(cause instanceof Error ? cause.message : "读取本轮变更失败");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [sessionId, projectId, requestRevision]);

  const files = data?.files ?? [];
  const filteredFiles = filter.trim()
    ? files.filter((file) => file.path.toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase()))
    : files;
  const tree = buildChangeTree(filteredFiles);

  const resizeTree = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!bounds) return;
    setTreeWidth(Math.max(210, Math.min(500, bounds.right - event.clientX)));
  };

  const showFile = (path: string) => {
    setSelectedPath(path);
    fileRefs.current.get(path)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const renderTreeNodes = (nodes: ChangeTreeNode[], depth = 0): ReactNode => nodes.map((node) => {
    if (node.file) {
      const file = node.file;
      const selected = selectedPath === file.path;
      return <button key={file.path} className={`change-tree-file ${selected ? "selected" : ""}`} style={{ paddingLeft: 10 + depth * 15 }} title={file.path} onClick={() => showFile(file.path)}>
        <span className={`change-review-status change-review-status-${file.type}`}>{file.type === "added" ? "A" : file.type === "deleted" ? "D" : "M"}</span>
        <span className="change-tree-name">{node.name}</span>
        <small><b>+{file.additions}</b><i>−{file.deletions}</i></small>
      </button>;
    }
    const collapsed = !filter.trim() && Boolean(collapsedDirs[node.path]);
    return <div className="change-tree-folder" key={node.path}>
      <button className="change-tree-folder-row" style={{ paddingLeft: 10 + depth * 15 }} aria-expanded={!collapsed} onClick={() => setCollapsedDirs((current) => ({ ...current, [node.path]: !current[node.path] }))}>
        <span className={`change-tree-caret ${collapsed ? "" : "open"}`}><Icon name="chevron" size={12} /></span>
        <span className="change-tree-folder-name">{node.name}</span>
      </button>
      {!collapsed && renderTreeNodes(node.children, depth + 1)}
    </div>;
  });

  return <div className={`change-review ${treeVisible ? "" : "change-review-tree-hidden"}`} style={{ "--change-tree-width": `${treeWidth}px` } as CSSProperties}>
    <section className="change-review-editor-pane">
      <header className="change-review-summary">
        <div><strong>本轮对话变更</strong><span>{files.length} 个文件</span></div>
        <div className="change-review-summary-actions">
          <div className="change-review-counts"><b>+{data?.additions ?? 0}</b><i>−{data?.deletions ?? 0}</i></div>
          <button className="change-tree-toggle" title={treeVisible ? "隐藏变更目录" : "显示变更目录"} aria-label={treeVisible ? "隐藏变更目录" : "显示变更目录"} aria-expanded={treeVisible} onClick={() => setTreeVisible((visible) => !visible)}><Icon name="tree" /></button>
        </div>
      </header>
      {loading && <div className="change-review-state">正在读取本轮文件变更…</div>}
      {error && <div className="change-review-state change-review-error">{error}</div>}
      {!loading && !error && data && !data.available && <div className="change-review-state change-review-error">{data.reason || "当前无法读取本轮变更"}</div>}
      {!loading && !error && data?.available && files.length === 0 && <div className="change-review-state">本轮没有文件变更。</div>}
      {data?.available && files.length > 0 && <div className="change-review-all-files">
        {files.map((file) => {
          const collapsed = Boolean(collapsedDiffs[file.path]);
          return <section key={file.path} ref={(element) => { if (element) fileRefs.current.set(file.path, element); else fileRefs.current.delete(file.path); }} className={`change-review-file-card ${selectedPath === file.path ? "selected" : ""}`}>
            <div className="change-review-file-header">
              <div className="change-review-active-path" title={file.path}>{file.path}</div>
              <div className="change-review-counts"><b>+{file.additions}</b><i>−{file.deletions}</i></div>
              {!file.binary && <div className="change-fold-actions">
                <button title={collapsed ? "展开当前文件差异" : "折叠当前文件差异"} onClick={() => setCollapsedDiffs((current) => ({ ...current, [file.path]: !collapsed }))}>{collapsed ? "展开" : "折叠"}</button>
              </div>}
            </div>
            {!file.binary && !collapsed && <div className="change-review-file-diff" style={{ height: diffEditorHeight(file) }}>
                    <DiffEditor
                      key={`${sessionId}:${file.path}`}
                      height="100%"
                      language={languageForPath(file.path)}
                      original={file.oldContent ?? ""}
                      modified={file.newContent ?? ""}
                      theme="vs"
                      options={DIFF_EDITOR_OPTIONS}
                    />
                  </div>}
          </section>;
        })}
      </div>}
    </section>
    {treeVisible && <>
      <div className="change-review-splitter" role="separator" aria-label="调整变更目录宽度" aria-orientation="vertical" aria-valuemin={210} aria-valuemax={500} aria-valuenow={treeWidth} tabIndex={0}
        onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerMove={(event) => { if (event.buttons === 1) resizeTree(event); }}
        onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); setTreeWidth((width) => Math.max(210, Math.min(500, width + (event.key === "ArrowLeft" ? 16 : -16)))); } }} />
      <aside className="change-review-file-pane">
        <div className="change-review-file-heading"><span>本轮变更文件</span></div>
        <label className="change-tree-search"><Icon name="search" size={15} /><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="筛选文件…" aria-label="筛选变更文件" /></label>
        <div className="change-review-file-list">
          {filteredFiles.length ? renderTreeNodes(tree) : <div className="change-tree-empty">没有匹配的变更文件</div>}
        </div>
      </aside>
    </>}
  </div>;
};

function languageForPath(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase();
  const languages: Record<string, string> = { ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript", java: "java", css: "css", scss: "scss", json: "json", md: "markdown", py: "python", html: "html", yml: "yaml", yaml: "yaml", xml: "xml", sql: "sql", go: "go", rs: "rust" };
  return languages[extension ?? ""] ?? "plaintext";
}

const WorkspacePanel: FC<WorkspacePanelProps> = ({ sessionId, projectId, requestRevision, open, onClose, expanded = false }) => {
  if (!open) return null;
  return <aside className={`workspace-panel ${expanded ? "workspace-panel-expanded" : ""}`} aria-label="工作区">
    <div className="workspace-header"><div><span className="eyebrow">DIFF</span><h2>本轮变更</h2></div><button className="panel-icon-btn" title="关闭变更面板" aria-label="关闭变更面板" onClick={onClose}><Icon name="close" /></button></div>
    <div className="workspace-body workspace-body-review">
      <DiffReview key={`${projectId || "default"}:${sessionId}`} sessionId={sessionId} projectId={projectId} requestRevision={requestRevision} />
    </div>
  </aside>;
};

export default WorkspacePanel;
