export interface SessionChangeFile {
  path: string;
  absolutePath: string;
  type: "added" | "modified" | "deleted";
  additions: number;
  deletions: number;
  binary: boolean;
  oldContent: string | null;
  newContent: string | null;
}

export interface SessionChangesResponse {
  available: boolean;
  reason: string | null;
  projectRoot: string;
  additions: number;
  deletions: number;
  files: SessionChangeFile[];
}

const baseUrl = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8080").replace(/\/$/, "");

export async function fetchSessionChanges(sessionId: string, projectId: string | null, signal?: AbortSignal): Promise<SessionChangesResponse> {
  const params = new URLSearchParams();
  if (projectId) params.set("projectId", projectId);
  const query = params.size ? `?${params.toString()}` : "";
  const response = await fetch(`${baseUrl}/session/${encodeURIComponent(sessionId)}/changes${query}`, {
    headers: { Accept: "application/json" },
    signal
  });
  if (!response.ok) {
    let message = `读取本轮变更失败（${response.status}）`;
    try {
      const payload = await response.json() as { message?: string; detail?: string };
      message = payload.message || payload.detail || message;
    } catch { /* Non-JSON error response. */ }
    throw new Error(message);
  }
  return await response.json() as SessionChangesResponse;
}
