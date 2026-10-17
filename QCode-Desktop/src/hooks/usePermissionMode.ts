import { useCallback, useEffect, useRef, useState } from "react";
import { fetchPermissions, updatePermission } from "../services/permissionApi";
import type { PermissionMode, PermissionVO } from "../types/chat";

export interface PermissionState {
  permission: PermissionVO | null;
  loading: boolean;
  savingMode: PermissionMode | null;
  error: string;
  refresh: () => Promise<void>;
  selectMode: (mode: PermissionMode) => Promise<void>;
}

export function usePermissionMode(): PermissionState {
  const [permission, setPermission] = useState<PermissionVO | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingMode, setSavingMode] = useState<PermissionMode | null>(null);
  const [error, setError] = useState("");
  const requestId = useRef(0);
  const saving = useRef(false);

  const refresh = useCallback(async () => {
    if (saving.current) return;
    const id = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const next = await fetchPermissions();
      if (id === requestId.current) setPermission(next);
    } catch (value) {
      if (id === requestId.current) setError(value instanceof Error ? value.message : "权限模式加载失败");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return () => { requestId.current += 1; };
  }, [refresh]);

  const selectMode = useCallback(async (mode: PermissionMode) => {
    if (!permission || permission.currentMode === mode || saving.current || loading) return;
    saving.current = true;
    requestId.current += 1;
    setSavingMode(mode);
    setError("");
    try {
      const next = await updatePermission(mode);
      setPermission(next);
    } catch (value) {
      setError(value instanceof Error ? value.message : "权限模式更新失败");
    } finally {
      saving.current = false;
      setSavingMode(null);
    }
  }, [loading, permission]);

  return { permission, loading, savingMode, error, refresh, selectMode };
}
