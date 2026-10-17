import type { FC } from "react";

const EmptyState: FC = () => (
  <div className="empty-state">
    <div className="empty-orb" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M24 5c4.4-4.1 12.4-1.4 13.4 4.3 6.1.3 9.2 7.5 5.6 12.1 4 4.9 1.3 12.7-4.7 13.7-.7 6.1-7.8 9.1-12.4 5.4-4.7 3.8-12 1.3-13.2-4.5-6.1-.8-9-8-5.1-12.6C3.8 18.6 6.4 11 12.3 9.9 13.4 4.2 20.7 1.4 24 5Z"/><path d="m19 17-4 7 4 7m10-14 4 7-4 7m-7 0h4"/></svg></div>
    <h2 className="empty-title">我们应该在 QCode 中做些什么？</h2>
    <p className="empty-hint">描述你想完成的任务，或直接贴上遇到的问题。</p>
  </div>
);

export default EmptyState;
