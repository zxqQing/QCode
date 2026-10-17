import Editor from "@monaco-editor/react";
import "../monacoSetup";
import type { FC } from "react";
import type { FilePreview } from "../types/chat";
import EditorTabs from "./EditorTabs";
import FileBreadcrumb from "./FileBreadcrumb";

interface FilePreviewPanelProps {
  sessionId: string;
  files: FilePreview[];
  activePath: string | null;
  loading: boolean;
  error: string;
  onSelect: (path: string) => void;
  onCloseTab: (path: string) => void;
  onClosePreview: () => void;
}

const FilePreviewPanel: FC<FilePreviewPanelProps> = ({ sessionId, files, activePath, loading, error, onSelect, onCloseTab, onClosePreview }) => {
  const activeFile = files.find((file) => file.absolutePath === activePath) || null;
  const activeNameParts = activeFile?.relativePath.split(/[\\/]/).filter(Boolean) || [];
  const editorModelPath = activeFile ? `qcode-preview:///${encodeURIComponent(sessionId)}/${encodeURIComponent(activeFile.absolutePath)}` : undefined;
  return <aside className="file-preview-panel" aria-label="文件预览">
    <header className="file-preview-header">
      <div className="file-preview-heading"><span className="eyebrow">FILE PREVIEW</span><strong>{activeNameParts[activeNameParts.length - 1] || (loading ? "正在读取…" : "文件预览")}</strong></div>
      <button type="button" className="panel-icon-btn" title="关闭文件预览" aria-label="关闭文件预览" onClick={onClosePreview}><svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
    </header>
    <EditorTabs files={files} activePath={activePath} onSelect={onSelect} onClose={onCloseTab} />
    {activeFile && <FileBreadcrumb file={activeFile} sessionId={sessionId} />}
    {error && <div className="file-preview-error" role="alert">{error}</div>}
    <div className="file-editor-body">
      {activeFile
        ? <Editor
            key={activeFile.absolutePath}
            path={editorModelPath}
            language={activeFile.language}
            value={activeFile.content}
            theme="vs"
            loading={<div className="file-preview-loading">正在加载编辑器…</div>}
            options={{ readOnly: true, domReadOnly: true, minimap: { enabled: false }, lineNumbers: "on", scrollBeyondLastLine: false, automaticLayout: true, fontSize: 12, lineHeight: 20, tabSize: 2, wordWrap: "off", renderLineHighlight: "none", padding: { top: 12, bottom: 12 }, scrollbar: { verticalScrollbarSize: 9, horizontalScrollbarSize: 9 } }}
          />
        : loading
          ? <div className="file-preview-loading">正在读取文件…</div>
          : error ? <div className="file-preview-empty">{error}</div> : <div className="file-preview-empty">选择聊天中的文件路径以预览</div>}
    </div>
  </aside>;
};

export default FilePreviewPanel;
