import { useState, type FC } from "react";
import type { FilePreview } from "../types/chat";

interface FileBreadcrumbProps {
  file: FilePreview;
  sessionId: string;
}

const segments = (file: FilePreview) => [file.rootName, ...file.relativePath.split(/[\\/]/).filter(Boolean)];

const FileBreadcrumb: FC<FileBreadcrumbProps> = ({ file, sessionId }) => {
  const [actionError, setActionError] = useState("");
  const copyPath = async () => {
    try { await navigator.clipboard.writeText(file.absolutePath); } catch { /* Clipboard may be unavailable. */ }
  };
  const runElectronAction = async (action: "revealSessionFile" | "openSessionFile") => {
    try {
      setActionError("");
      await window.electronAPI?.[action](sessionId, file.absolutePath);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "文件操作失败");
    }
  };

  return <div className="file-breadcrumb-bar">
    <nav className="file-breadcrumb" aria-label="文件路径">{segments(file).map((segment, index) => <span key={`${segment}-${index}`}>
      {index > 0 && <i aria-hidden="true">›</i>}{segment}
    </span>)}</nav>
    <div className="file-preview-actions">
      <button type="button" title="复制文件路径" aria-label="复制文件路径" onClick={() => void copyPath()}><svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg></button>
      {window.electronAPI?.revealSessionFile && <button type="button" title="在文件管理器中显示" aria-label="在文件管理器中显示" onClick={() => void runElectronAction("revealSessionFile")}><svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h6a2 2 0 0 1 2 2v1"/><path d="M3 10h17l-2 9H5l-2-9Z"/></svg></button>}
      {window.electronAPI?.openSessionFile && <button type="button" title="用外部编辑器打开" aria-label="用外部编辑器打开" onClick={() => void runElectronAction("openSessionFile")}><svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/></svg></button>}
    </div>
    {actionError && <span className="file-action-error" role="alert">{actionError}</span>}
  </div>;
};

export default FileBreadcrumb;
