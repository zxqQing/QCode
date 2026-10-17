import type { FC } from "react";
import type { SidebarHeaderProps } from "./sidebarTypes";

const SidebarHeader: FC<SidebarHeaderProps> = ({ search, onSearchChange, onNewChat }) => (
  <>
    <header className="sidebar-header codex-sidebar-header">
      <div className="codex-brand" aria-label="QCode">
        <span className="codex-brand-mark">Q</span>
        <strong>QCode</strong>
      </div>
      <button className="sidebar-new-icon" type="button" title="新建会话" aria-label="新建会话" onClick={onNewChat}>
        <svg viewBox="0 0 24 24"><path d="M12 20h8" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" /></svg>
      </button>
    </header>
    <button className="new-chat-btn codex-new-chat" type="button" onClick={onNewChat}>
      <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
      <span>新建会话</span>
    </button>
    <label className="sidebar-search codex-search">
      <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>
      <input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="搜索会话" aria-label="搜索会话" />
      {search && <button type="button" aria-label="清除搜索" onClick={() => onSearchChange("")}>×</button>}
    </label>
  </>
);

export default SidebarHeader;
