import type {
  AgentEvent,
  ChatApiConfig,
  StreamEventHandler,
  Session,
  SessionMessage,
  PageResult,
  ToolCall
} from "../types/chat";

const defaultConfig: ChatApiConfig = {
  baseUrl: (import.meta.env.VITE_API_BASE_URL || "http://localhost:8080").replace(/\/$/, ""),
  userId: import.meta.env.VITE_QCODE_USER_ID || "default-user"
};

function getConfig(config: Partial<ChatApiConfig> = {}): ChatApiConfig {
  return { ...defaultConfig, ...config, baseUrl: (config.baseUrl || defaultConfig.baseUrl).replace(/\/$/, "") };
}

async function requestSession(path: string, init: RequestInit = {}, config?: Partial<ChatApiConfig>): Promise<Response> {
  const { baseUrl } = getConfig(config);
  // QCode 的 Controller 使用 /session 和 /chat 作为根路径，没有 /api 前缀。
  // 直接请求真实路径，避免每次加载会话先产生一次无意义的 404。
  return fetch(`${baseUrl}${path}`, init);
}

function normalizeSession(item: Record<string, unknown>): Session {
  const sessionId = String(item.sessionId);
  const title = typeof item.title === "string" ? item.title.trim() : "";
  return { ...item, sessionId, title: title || undefined, displayTitle: title || sessionId } as Session;
}

function parseSessionList(payload: unknown): Session[] {
  const source = payload as { data?: unknown[]; items?: unknown[] } | null;
  const list = Array.isArray(payload) ? payload : (Array.isArray(source?.items) ? source.items : source?.data);
  if (!Array.isArray(list)) return [];
  return list
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && item.sessionId))
    .map((item) => {
      return normalizeSession(item);
    });
}

export async function fetchSessions(config?: Partial<ChatApiConfig>): Promise<Session[]> {
  const { userId } = getConfig(config);
  const params = new URLSearchParams({ userId });
  const response = await requestSession(`/session/list?${params.toString()}`, { headers: { Accept: "application/json" } }, config);
  if (!response.ok) throw new Error(`会话列表请求失败（${response.status}）`);
  return parseSessionList(await response.json());
}

export async function fetchRecentSessions(query = "", cursor = "", limit = 20, config?: Partial<ChatApiConfig>): Promise<PageResult<Session>> {
  const params = new URLSearchParams({ query, cursor, limit: String(limit) });
  const response = await requestSession(`/session/recent?${params.toString()}`, { headers: { Accept: "application/json" } }, config);
  if (!response.ok) throw new Error(`最近会话请求失败（${response.status}）`);
  const payload = await response.json() as { items?: unknown[]; nextCursor?: string; hasMore?: boolean };
  return { items: Array.isArray(payload.items) ? payload.items.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && (item as Record<string, unknown>).sessionId)).map(normalizeSession) : [], nextCursor: payload.nextCursor, hasMore: Boolean(payload.hasMore) };
}

export async function renameSession(sessionId: string, title: string, projectId?: string | null, config?: Partial<ChatApiConfig>): Promise<Session> {
  const { baseUrl } = getConfig(config);
  const response = await fetch(`${baseUrl}/session/rename`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ sessionId, projectId, title }) });
  if (!response.ok) throw new Error(`重命名会话失败（${response.status}）`);
  return normalizeSession(await response.json() as Record<string, unknown>);
}

export async function deleteSession(sessionId: string, projectId?: string | null, config?: Partial<ChatApiConfig>): Promise<void> {
  const { baseUrl } = getConfig(config);
  const params = new URLSearchParams();
  if (projectId) params.set("projectId", projectId);
  const query = params.size ? `?${params.toString()}` : "";
  const response = await fetch(`${baseUrl}/session/${encodeURIComponent(sessionId)}${query}`, { method: "DELETE" });
  if (!response.ok) throw new Error(`删除会话失败（${response.status}）`);
}

export async function fetchSessionMessages(sessionId: string, projectId?: string | null, config?: Partial<ChatApiConfig>): Promise<SessionMessage[]> {
  const params = new URLSearchParams();
  if (projectId) params.set("projectId", projectId);
  const query = params.size ? `?${params.toString()}` : "";
  const response = await requestSession(`/session/${encodeURIComponent(sessionId)}/messages${query}`, { headers: { Accept: "application/json" } }, config);
  if (!response.ok) throw new Error(`会话消息请求失败（${response.status}）`);
  const payload: unknown = await response.json();
  return Array.isArray(payload)
    ? payload.filter((item): item is SessionMessage => Boolean(
        item
        && typeof item === "object"
        && typeof (item as Record<string, unknown>).blockType === "string"
        && typeof (item as Record<string, unknown>).messageId === "string"
      ))
    : [];
}

export async function openChatStream(message: string, sessionId: string, signal: AbortSignal, projectId?: string | null, planMode = false, skillName?: string, config?: Partial<ChatApiConfig>): Promise<Response> {
  const { baseUrl } = getConfig(config);
  const params = new URLSearchParams({ message, sessionId, planMode: String(planMode) });
  if (projectId) params.set("projectId", projectId);
  if (skillName) params.set("skill", skillName);
  return fetch(`${baseUrl}/chat?${params.toString()}`, {
    method: "GET",
    headers: { Accept: "text/event-stream" },
    signal
  });
}

export async function stopChat(sessionId: string, projectId?: string | null, config?: Partial<ChatApiConfig>): Promise<void> {
  const params = new URLSearchParams({
    sessionId,
    // 后端将空项目 ID 归入 default 会话，同时要求该参数必须存在。
    projectId: projectId || ""
  });
  const response = await requestSession(`/chat/stop?${params.toString()}`, { method: "POST" }, config);
  if (!response.ok) throw new Error(`停止会话失败（${response.status}）`);
}

export async function confirmChatStream(
  sessionId: string,
  projectId: string | null | undefined,
  confirmed: boolean,
  toolCalls: ToolCall[],
  signal: AbortSignal,
  config?: Partial<ChatApiConfig>
): Promise<Response> {
  const { baseUrl } = getConfig(config);
  return fetch(`${baseUrl}/chat/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ sessionId, projectId, confirmed, toolCalls }),
    signal
  });
}

function parseEventBlock(block: string, onEvent: StreamEventHandler, onAgentEvent: (event: AgentEvent) => void): void {
  const trimmed = block.trim();
  if (!trimmed) return;

  if (trimmed.startsWith("[")) {
    try {
      const chunks: unknown = JSON.parse(trimmed);
      if (Array.isArray(chunks)) {
        chunks.forEach((chunk) => parseEventBlock(String(chunk), onEvent, onAgentEvent));
        return;
      }
    } catch {
      // Continue as regular SSE when this is not a JSON array.
    }
  }

  const lines = trimmed.split(/\r?\n/);
  let eventName = "";
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith("event:")) eventName = line.slice(6).trim();
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  const rawData = dataLines.join("\n");

  if (!eventName && rawData.startsWith("{")) {
    try {
      onAgentEvent(JSON.parse(rawData) as AgentEvent);
      return;
    } catch {
      // Continue as legacy text SSE when this is not an AgentEvent.
    }
  }
  if (!eventName && rawData.includes("event:")) {
    parseEventBlock(rawData, onEvent, onAgentEvent);
    return;
  }
  if (eventName) onEvent(eventName, dataLines.join("\n"));
}

export async function readEventStream(
  response: Response,
  onEvent: StreamEventHandler,
  onAgentEvent: (event: AgentEvent) => void
): Promise<void> {
  if (!response.body) throw new Error("服务器没有返回可读取的消息流");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() || "";
    blocks.forEach((block) => parseEventBlock(block, onEvent, onAgentEvent));
    if (done) break;
  }
  if (buffer.trim()) parseEventBlock(buffer, onEvent, onAgentEvent);
}
