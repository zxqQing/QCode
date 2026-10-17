import type { FC } from "react";

type Props = { onClick: () => void; };

const SidebarFooter: FC<Props> = ({ onClick }) => (
  <footer className="sidebar-footer codex-sidebar-footer">
    <button type="button" className="sidebar-settings-button" onClick={onClick}>
      <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></svg>
      <span>设置</span>
    </button>
  </footer>
);

export default SidebarFooter;
