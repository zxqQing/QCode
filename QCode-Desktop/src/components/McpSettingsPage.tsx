import { useEffect, useState } from "react";
import {
  addMcpServer,
  deleteMcpServer,
  fetchMcpServers,
  setMcpServerEnabled,
} from "../services/mcpApi";
import type { AddMcpServerInput, McpServer, McpTransport } from "../services/mcpApi";

const DEFAULT_CONFIG = `{
  "mcpServers": {
    "example-server": {
      "command": "npx",
      "args": ["-y", "mcp-server-example"]
    }
  }
}`;

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseStringMap(value: unknown, field: string): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  if (!isObject(value) || Object.values(value).some((item) => typeof item !== "string")) {
    throw new Error(`${field} 必须是字符串键值对象`);
  }
  return value as Record<string, string>;
}

function parseStringArray(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error("args 必须是字符串数组");
  }
  return value;
}

function normalizeTransport(value: unknown, hasCommand: boolean, hasUrl: boolean): McpTransport {
  if (value === undefined || value === null || value === "") {
    if (hasCommand) return "stdio";
    if (hasUrl) return "streamable-http";
  }
  if (value === "stdio" || value === "sse" || value === "streamable-http") return value;
  if (value === "http" || value === "streamableHttp" || value === "streamable_http") return "streamable-http";
  throw new Error("type 只支持 stdio、streamable-http 或 sse");
}

function normalizeServer(name: string, value: unknown): AddMcpServerInput {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(name)) {
    throw new Error(`Server 名称“${name}”只能包含字母、数字、下划线和短横线，且长度不超过 64`);
  }
  if (!isObject(value)) throw new Error(`Server“${name}”的配置必须是对象`);

  const command = typeof value.command === "string" ? value.command.trim() : "";
  const url = typeof value.url === "string" ? value.url.trim() : "";
  const type = normalizeTransport(value.type, Boolean(command), Boolean(url));
  if (type === "stdio" && !command) throw new Error(`Server“${name}”缺少 command`);
  if (type !== "stdio" && !url) throw new Error(`Server“${name}”缺少 url`);
  const args = parseStringArray(value.args);
  const env = parseStringMap(value.env, "env");
  const headers = parseStringMap(value.headers, "headers");

  return {
    name,
    type,
    ...(command ? { command } : {}),
    ...(url ? { url } : {}),
    ...(args ? { args } : {}),
    ...(env ? { env } : {}),
    ...(headers ? { headers } : {}),
  };
}

function parseMcpConfig(text: string): AddMcpServerInput[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("JSON 格式不正确，请检查逗号、引号和括号");
  }
  if (!isObject(parsed)) throw new Error("配置根节点必须是 JSON 对象");

  if (typeof parsed.name === "string") {
    return [normalizeServer(parsed.name.trim(), parsed)];
  }

  const collection = parsed.mcpServers;
  if (!isObject(collection)) throw new Error("配置中需要包含 mcpServers 对象");
  const entries = Object.entries(collection);
  if (entries.length === 0) throw new Error("mcpServers 中没有可添加的 Server");
  return entries.map(([name, value]) => normalizeServer(name, value));
}

function ServerIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="6" rx="2" /><rect x="3" y="14" width="18" height="6" rx="2" /><path d="M7 7h.01M7 17h.01M11 7h6M11 17h6" /></svg>;
}

function CloseIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>;
}

function statusText(server: McpServer): string {
  if (!server.enabled) return "已停用";
  if (server.status === "CONNECTED") return "已连接";
  if (server.status === "ERROR") return "连接错误";
  return "等待连接";
}

function connectionDetail(server: McpServer): string {
  if (server.type === "stdio") return [server.command, ...(server.args || [])].filter(Boolean).join(" ");
  return server.url || server.type;
}

export default function McpSettingsPage() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [expandedNames, setExpandedNames] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [configText, setConfigText] = useState(DEFAULT_CONFIG);
  const [configError, setConfigError] = useState("");
  const [saving, setSaving] = useState(false);
  const [togglingName, setTogglingName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<McpServer | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const nextServers = await fetchMcpServers();
      setServers(nextServers);
      setExpandedNames((current) => new Set(
        [...current].filter((name) => nextServers.some((server) => server.name === name && server.tools?.length > 0)),
      ));
    } catch (value) {
      setError(value instanceof Error ? value.message : "MCP Server 列表加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const openManualConfig = () => {
    setConfigText(DEFAULT_CONFIG);
    setConfigError("");
    setManualOpen(true);
  };

  const submitConfig = async () => {
    setConfigError("");
    let inputs: AddMcpServerInput[];
    try {
      inputs = parseMcpConfig(configText);
    } catch (value) {
      setConfigError(value instanceof Error ? value.message : "配置解析失败");
      return;
    }

    setSaving(true);
    let completed = 0;
    try {
      for (const input of inputs) {
        await addMcpServer(input);
        completed += 1;
      }
      setManualOpen(false);
      setNotice(`已添加 ${completed} 个 MCP Server`);
      await load();
    } catch (value) {
      const message = value instanceof Error ? value.message : "添加 MCP Server 失败";
      setConfigError(completed > 0 ? `已添加 ${completed} 个；${message}` : message);
      if (completed > 0) await load();
    } finally {
      setSaving(false);
    }
  };

  const toggleServer = async (server: McpServer) => {
    setTogglingName(server.name);
    setError("");
    setNotice("");
    try {
      const updated = await setMcpServerEnabled(server.name, !server.enabled);
      setServers((current) => current.map((item) => item.name === updated.name ? updated : item));
      if (!updated.enabled) {
        setExpandedNames((current) => {
          const next = new Set(current);
          next.delete(updated.name);
          return next;
        });
      }
      setNotice(updated.enabled ? `已启用 ${updated.name}` : `已停用 ${updated.name}`);
    } catch (value) {
      setError(value instanceof Error ? value.message : "MCP Server 状态更新失败");
    } finally {
      setTogglingName("");
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    setError("");
    try {
      await deleteMcpServer(pendingDelete.name);
      setServers((current) => current.filter((item) => item.name !== pendingDelete.name));
      setExpandedNames((current) => {
        const next = new Set(current);
        next.delete(pendingDelete.name);
        return next;
      });
      setNotice(`已删除 ${pendingDelete.name}`);
      setPendingDelete(null);
    } catch (value) {
      setError(value instanceof Error ? value.message : "删除 MCP Server 失败");
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  return <>
    <main className="model-settings-content mcp-settings-content">
      <div className="mcp-page-header">
        <div>
          <h1>MCP</h1>
          <h2>MCP Servers 管理</h2>
          <p className="settings-description">管理已添加的 MCP Server，可启用、停用或添加新的工具能力。</p>
        </div>
        <button className="mcp-add-button" type="button" onClick={openManualConfig}><span>＋</span> 添加</button>
      </div>

      {error && <div className="settings-error">{error}</div>}
      {notice && <div className="settings-notice">{notice}</div>}

      <section className="mcp-panel" aria-label="MCP Server 列表">
        {loading ? <div className="mcp-loading">正在加载 MCP Server…</div> : servers.length === 0 ? <div className="mcp-empty">
          <div className="mcp-empty-graphic"><span><ServerIcon /></span><i /><b /><b /></div>
          <h2>什么是 MCP Servers？</h2>
          <p>Model Context Protocol（MCP）允许 Agent 访问自定义工具和服务。添加 Server 后，Agent 可以调用对应工具完成任务。</p>
        </div> : <div className="mcp-list">
          {servers.map((server) => {
            const tools = server.tools || [];
            const expanded = expandedNames.has(server.name);
            return <article className="mcp-server-card" key={server.name}>
              <div className="mcp-server-row">
                <button className="mcp-server-main" type="button" disabled={tools.length === 0} aria-expanded={tools.length > 0 ? expanded : undefined} onClick={() => setExpandedNames((current) => {
                    const next = new Set(current);
                    if (next.has(server.name)) next.delete(server.name); else next.add(server.name);
                    return next;
                  })}>
                  <div className="mcp-server-monogram">{server.name.charAt(0).toUpperCase()}</div>
                  <div className="mcp-server-copy">
                    <div className="mcp-server-title"><strong>{server.name}</strong><span className={`mcp-status mcp-status-${server.enabled ? (server.status || "DISCONNECTED").toLowerCase() : "disabled"}`}>{statusText(server)}</span></div>
                    <span className="mcp-server-detail">{server.type} · {connectionDetail(server) || "未提供连接信息"}</span>
                    {server.error && <span className="mcp-server-error">{server.error}</span>}
                  </div>
                </button>
                <span className="mcp-tool-count">{server.toolCount || tools.length} 个工具</span>
                <button className="mcp-delete-button" type="button" onClick={() => setPendingDelete(server)}>删除</button>
                <label className="mcp-switch" title={server.enabled ? "停用" : "启用"}>
                  <input type="checkbox" checked={server.enabled} disabled={togglingName === server.name} aria-label={`${server.enabled ? "停用" : "启用"} ${server.name}`} onChange={() => void toggleServer(server)} />
                  <span />
                </label>
              </div>
              {expanded && tools.length > 0 && <div className="mcp-tool-list">
                {tools.map((tool) => <div className="mcp-tool-row" key={tool.name}>
                  <strong>{tool.name}</strong>
                  <span title={tool.description || "暂无描述"}>{tool.description || "暂无描述"}</span>
                </div>)}
              </div>}
            </article>;
          })}
        </div>}
      </section>
    </main>

    {manualOpen && <div className="skill-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setManualOpen(false); }}>
      <section className="mcp-config-modal" role="dialog" aria-modal="true" aria-labelledby="mcp-config-title">
        <header><h2 id="mcp-config-title">手动配置</h2><button className="skill-modal-close" type="button" disabled={saving} onClick={() => setManualOpen(false)} aria-label="关闭"><CloseIcon /></button></header>
        <p>从 MCP Server 的介绍页面复制配置 JSON，并粘贴到输入框中。支持一次添加多个 Server。</p>
        <textarea value={configText} onChange={(event) => setConfigText(event.target.value)} spellCheck={false} aria-label="MCP JSON 配置" />
        {configError && <div className="mcp-config-error">{configError}</div>}
        <div className="mcp-config-warning"><span>●</span> 配置前请确认来源，谨防风险</div>
        <footer><button type="button" disabled={saving} onClick={() => setManualOpen(false)}>取消</button><button className="primary" type="button" disabled={saving || !configText.trim()} onClick={() => void submitConfig()}>{saving ? "添加中…" : "确认"}</button></footer>
      </section>
    </div>}

    {pendingDelete && <div className="skill-modal-backdrop"><section className="skill-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="mcp-delete-title">
      <h2 id="mcp-delete-title">删除 MCP Server</h2>
      <p>确定删除“{pendingDelete.name}”吗？</p>
      <div><button type="button" disabled={deleting} onClick={() => setPendingDelete(null)}>取消</button><button className="danger" type="button" disabled={deleting} onClick={() => void confirmDelete()}>{deleting ? "删除中…" : "删除"}</button></div>
    </section></div>}
  </>;
}
