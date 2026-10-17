import type { FilePreview } from "../types/chat";

const baseUrl = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8080").replace(/\/$/, "");

export async function fetchSessionFile(sessionId: string, projectId: string | null, filePath: string, signal?: AbortSignal): Promise<FilePreview> {
  const query = new URLSearchParams({ filePath });
  if (projectId) query.set("projectId", projectId);
  const response = await fetch(`${baseUrl}/session/${encodeURIComponent(sessionId)}/file?${query}`, {
    headers: { Accept: "application/json" },
    signal
  });
  if (!response.ok) {
    let message = `读取文件失败（${response.status}）`;
    try {
      const payload = await response.json() as { message?: string; detail?: string };
      message = payload.message || payload.detail || message;
    } catch { /* Non-JSON error response. */ }
    throw new Error(message);
  }
  return await response.json() as FilePreview;
}
