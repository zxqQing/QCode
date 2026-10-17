import type { FC } from "react";

interface IconRailProps {
  active: string;
  onSelect: (key: string) => void;
}

const icons = [
  { key: "home", title: "主页" },
  { key: "history", title: "历史" },
  { key: "mention", title: "提及" },
  { key: "branch", title: "分支" }
];

const IconRail: FC<IconRailProps> = ({ active, onSelect }) => (
  <aside className="icon-rail">
    <div className="rail-logo" title="QCode"><span>Q</span></div>
    {icons.map((icon) => (
      <button key={icon.key} className={`rail-icon ${active === icon.key ? "active" : ""}`} title={icon.title} onClick={() => onSelect(icon.key)}>
        {icon.key === "home" && <svg viewBox="0 0 24 24"><path d="M3 11l9-8 9 8M5 10v10h14V10" /></svg>}
        {icon.key === "history" && <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>}
        {icon.key === "mention" && <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" /><path d="M16 8v5a4 4 0 01-8 0V8M16 12v1a8 8 0 01-8 0" /></svg>}
        {icon.key === "branch" && <svg viewBox="0 0 24 24"><circle cx="6" cy="6" r="2" /><circle cx="6" cy="18" r="2" /><circle cx="18" cy="8" r="2" /><path d="M6 8v8M18 10c0 4-6 2-6 6" /></svg>}
      </button>
    ))}
    <div className="rail-spacer" />
    <button className="rail-icon" title="设置"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></svg></button>
  </aside>
);

export default IconRail;
