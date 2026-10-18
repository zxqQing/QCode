const baseUrl = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8080").replace(/\/$/, "");

export type McpTransport = "stdio" | "streamable-http" | "sse";

export interface McpTool {
  name: string;
  description: string;
}

export interface McpServer {
  name: string;
  type: McpTransport;
  command: string | null;
  args: string[];
  url: string | null;
  enabled: boolean;
  status: string;
  toolCount: number;
  tools: McpTool[];
  error: string | null;
}

export interface AddMcpServerInput {
  name: string;
  type: McpTransport;
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  headers?: Record<string, string>;
}

async function parseError(response: Response, fallback: string): Promise<Error> {
  const body = await response.text().catch(() => "");
  let detail = body;
  try {
    const payload = JSON.parse(body) as { message?: unknown; error?: unknown };
    detail = String(payload.message || payload.error || "");
  } catch {
    // Keep a plain-text server response as-is.
  }
  return new Error(`${fallback}（${response.status}）${detail ? `：${detail}` : ""}`);
}

export async function fetchMcpServers(): Promise<McpServer[]> {
  const response = await fetch(`${baseUrl}/mcp`, { headers: { Accept: "application/json" } });
  if (!response.ok) throw await parseError(response, "MCP Server 列表加载失败");
  const payload = await response.json();
  return Array.isArray(payload) ? payload : [];
}

export async function addMcpServer(input: AddMcpServerInput): Promise<McpServer> {
  const response = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await parseError(response, `添加 MCP Server“${input.name}”失败`);
  return response.json() as Promise<McpServer>;
}

export async function setMcpServerEnabled(name: string, enabled: boolean): Promise<McpServer> {
  const response = await fetch(`${baseUrl}/mcp/${encodeURIComponent(name)}/enabled`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ enabled }),
  });
  if (!response.ok) throw await parseError(response, `${enabled ? "启用" : "停用"} MCP Server 失败`);
  return response.json() as Promise<McpServer>;
}

export async function deleteMcpServer(name: string): Promise<void> {
  const response = await fetch(`${baseUrl}/mcp/${encodeURIComponent(name)}`, { method: "DELETE" });
  if (!response.ok) throw await parseError(response, "删除 MCP Server 失败");
}
