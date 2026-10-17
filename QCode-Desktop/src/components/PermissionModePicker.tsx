import { useEffect, useRef, useState } from "react";
import { permissionModes, permissionModeTitle } from "../constants/permissionModes";
import type { PermissionState } from "../hooks/usePermissionMode";

type Props = { permissionState: PermissionState };

export default function PermissionModePicker({ permissionState }: Props) {
  const { permission, loading, savingMode, error, refresh, selectMode } = permissionState;
  const [open, setOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    pickerRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const chooseMode = (mode: typeof permissionModes[number]["mode"]) => {
    setOpen(false);
    triggerRef.current?.focus();
    void selectMode(mode);
  };

  return <div className="permission-picker" ref={pickerRef}>
    <button
      ref={triggerRef}
      type="button"
      className="tool-btn permission-picker-trigger"
      aria-label={`权限模式：${permission ? permissionModeTitle(permission.currentMode) : "未加载"}`}
      aria-haspopup="menu"
      aria-expanded={open}
      disabled={loading || Boolean(savingMode)}
      onClick={() => permission ? setOpen((value) => !value) : void refresh()}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 6v5c0 4.5-2.9 7.8-7 9-4.1-1.2-7-4.5-7-9V6l7-3Z" /><path d="m9 12 2 2 4-4" /></svg>
      <span>{savingMode ? "保存中…" : loading ? "加载中…" : permission ? permissionModeTitle(permission.currentMode) : "重试权限模式"}</span>
      <svg className="permission-picker-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
    </button>
    {open && permission && <div className="permission-picker-menu" role="menu" aria-label="选择权限模式">
      {permissionModes.map((item) => <button
        key={item.mode}
        type="button"
        role="menuitemradio"
        aria-checked={permission.currentMode === item.mode}
        onClick={() => chooseMode(item.mode)}
      >
        <span className={`permission-menu-radio ${permission.currentMode === item.mode ? "checked" : ""}`} aria-hidden="true" />
        <span><strong>{item.title}</strong><small>{item.description}</small></span>
      </button>)}
    </div>}
    {!open && error && <div className="permission-picker-error" role="alert">{error} <button type="button" onClick={() => void refresh()}>重试</button></div>}
  </div>;
}
