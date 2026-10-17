import { permissionModes } from "../constants/permissionModes";
import type { PermissionState } from "../hooks/usePermissionMode";

type Props = { permissionState: PermissionState };

function ModeIcon({ type }: { type: "hand" | "shield" }) {
  if (type === "hand") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 11V6.5a1.5 1.5 0 0 1 3 0V11" /><path d="M11.5 10V5a1.5 1.5 0 0 1 3 0v6" /><path d="M14.5 10V7a1.5 1.5 0 0 1 3 0v6.2" /><path d="M8.5 10.5 7 9.2a1.6 1.6 0 0 0-2.1 2.4l4.6 5.2A5 5 0 0 0 13.2 19H15a4 4 0 0 0 4-4v-3.8" /></svg>;
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 6v5c0 4.5-2.9 7.8-7 9-4.1-1.2-7-4.5-7-9V6l7-3Z" /><path d="m9 12 2 2 4-4" /></svg>;
}

export default function PermissionSettingsPage({ permissionState }: Props) {
  const { permission, loading, savingMode, error, refresh, selectMode } = permissionState;
  return <main className="model-settings-content permission-settings-content">
    <h1>权限审批</h1>
    <h2>常规任务</h2>
    <section className="permission-section">
      <div className="permission-section-header">
        <h3>权限模式</h3>
        <p>也可以从任务输入框中切换权限模式。</p>
      </div>
      {error && <div className="settings-error" role="alert">{error} <button type="button" className="permission-retry" onClick={() => void refresh()}>重试</button></div>}
      {loading ? <div className="permission-loading">正在加载权限模式…</div> : <div className="permission-options">
        {permissionModes.map((item) => {
          const selected = permission?.currentMode === item.mode;
          const saving = savingMode === item.mode;
          return <button
            key={item.mode}
            type="button"
            className={`permission-option ${selected ? "selected" : ""}`}
            disabled={!permission || Boolean(savingMode)}
            onClick={() => void selectMode(item.mode)}
            aria-pressed={selected}
          >
            <span className={`permission-radio ${selected ? "checked" : ""}`} aria-hidden="true" />
            <span className="permission-icon"><ModeIcon type={item.icon} /></span>
            <span className="permission-option-copy">
              <strong>{item.title}</strong>
              <span>{item.description}</span>
            </span>
            {saving && <span className="permission-saving">保存中…</span>}
          </button>;
        })}
      </div>}
    </section>
  </main>;
}
