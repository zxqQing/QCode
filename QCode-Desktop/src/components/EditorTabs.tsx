import type { FC } from "react";
import type { FilePreview } from "../types/chat";

interface EditorTabsProps {
  files: FilePreview[];
  activePath: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
}

const fileName = (path: string) => { const parts = path.split(/[\\/]/).filter(Boolean); return parts[parts.length - 1] || path; };

const EditorTabs: FC<EditorTabsProps> = ({ files, activePath, onSelect, onClose }) => (
  <div className="editor-tabs" role="tablist" aria-label="已打开文件">
    {files.map((file) => <div className={`editor-tab ${file.absolutePath === activePath ? "active" : ""}`} key={file.absolutePath}>
      <button type="button" role="tab" aria-selected={file.absolutePath === activePath} title={file.absolutePath} onClick={() => onSelect(file.absolutePath)}>{fileName(file.relativePath)}</button>
      <button type="button" className="editor-tab-close" title={`关闭 ${fileName(file.relativePath)}`} aria-label={`关闭 ${fileName(file.relativePath)}`} onClick={() => onClose(file.absolutePath)}>×</button>
    </div>)}
  </div>
);

export default EditorTabs;
