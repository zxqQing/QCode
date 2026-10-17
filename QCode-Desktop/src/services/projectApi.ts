import type { CreateProjectInput, PageResult, Project, ProjectSession, Session } from "../types/chat";

const baseUrl = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8080").replace(/\/$/, "");

function normalizeSession(value: ProjectSession): ProjectSession {
  const sessionId = typeof value.sessionId === "string" ? value.sessionId : undefined;
  const title = typeof value.title === "string" ? value.title.trim() : "";
  return { ...value, sessionId, title: title || undefined, displayTitle: title || sessionId || "未命名会话" };
}

function normalizeProject(value: unknown): Project {
  const source = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const sessions = Array.isArray(source.sessions)
    ? source.sessions.filter((item): item is ProjectSession => Boolean(item && typeof item === "object")).map((item) => normalizeSession(item))
    : [];
  return {
    ...source,
    projectId: String(source.projectId || ""),
    name: String(source.name || "未命名项目"),
    rootPath: typeof source.rootPath === "string" ? source.rootPath : undefined,
    additionalRoots: Array.isArray(source.additionalRoots) ? source.additionalRoots.filter((item): item is string => typeof item === "string") : [],
    sessions
  } as Project;
}

async function parseResponse(response: Response, message: string): Promise<unknown> {
  if (!response.ok) {
    let detail = "";
    try { detail = await response.text(); } catch { /* ignore */ }
    throw new Error(`${message}（${response.status}）${detail ? `：${detail}` : ""}`);
  }
  return response.status === 204 ? null : response.json();
}

export async function fetchProjects(): Promise<Project[]> {
  const payload = await parseResponse(await fetch(`${baseUrl}/project`, { headers: { Accept: "application/json" } }), "项目列表请求失败");
  const list = Array.isArray(payload) ? payload : (payload as { data?: unknown[] } | null)?.data;
  return Array.isArray(list) ? list.map(normalizeProject).filter((project) => project.projectId) : [];
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  const payload = await parseResponse(await fetch(`${baseUrl}/project`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(input)
  }), "创建项目失败");
  return normalizeProject(payload);
}

export async function fetchProject(projectId: string): Promise<Project> {
  const payload = await parseResponse(await fetch(`${baseUrl}/project/${encodeURIComponent(projectId)}`, { headers: { Accept: "application/json" } }), "项目详情请求失败");
  return normalizeProject(payload);
}

export async function fetchProjectSessions(projectId: string, query = "", cursor = "", limit = 20): Promise<PageResult<Session>> {
  const params = new URLSearchParams({ query, cursor, limit: String(limit) });
  const payload = await parseResponse(await fetch(`${baseUrl}/project/${encodeURIComponent(projectId)}/sessions?${params.toString()}`, { headers: { Accept: "application/json" } }), "项目会话请求失败") as { items?: unknown[]; nextCursor?: string; hasMore?: boolean };
  const items = Array.isArray(payload.items) ? payload.items.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && (item as Record<string, unknown>).sessionId)).map((item) => {
    const sessionId = String(item.sessionId);
    const title = typeof item.title === "string" ? item.title.trim() : "";
    return { ...item, sessionId, title: title || undefined, displayTitle: title || sessionId } as Session;
  }) : [];
  return { items, nextCursor: payload.nextCursor, hasMore: Boolean(payload.hasMore) };
}

export async function updateProject(projectId: string, input: Partial<Project>): Promise<Project> {
  const payload = await parseResponse(await fetch(`${baseUrl}/project/${encodeURIComponent(projectId)}`, { method: "PUT", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ ...input, projectId }) }), "更新项目失败");
  return normalizeProject(payload);
}

export async function deleteProject(projectId: string): Promise<void> {
  const response = await fetch(`${baseUrl}/project/${encodeURIComponent(projectId)}`, { method: "DELETE" });
  if (!response.ok) throw new Error(`删除项目失败（${response.status}）`);
}

