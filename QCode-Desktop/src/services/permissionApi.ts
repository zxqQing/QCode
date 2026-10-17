import type { PermissionMode, PermissionVO } from "../types/chat";

const baseUrl = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8080").replace(/\/$/, "");

async function parse<T>(response: Response, message: string): Promise<T> {
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`${message}（${response.status}）${detail ? `：${detail}` : ""}`);
  }
  if (response.status === 204) return undefined as T;
  const body = await response.text();
  return (body ? JSON.parse(body) : undefined) as T;
}

export async function fetchPermissions(): Promise<PermissionVO> {
  return parse<PermissionVO>(
    await fetch(`${baseUrl}/permission/list`, { headers: { Accept: "application/json" } }),
    "权限模式请求失败"
  );
}

export async function updatePermission(mode: PermissionMode): Promise<PermissionVO> {
  return parse<PermissionVO>(
    await fetch(`${baseUrl}/permission`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ mode })
    }),
    "更新权限模式失败"
  );
}
