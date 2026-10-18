import { useEffect, useMemo, useState } from "react";
import { activateModel, addModel, fetchModelProviders, fetchModels } from "../services/modelApi";
import type { ModelConfig, ModelProvider } from "../types/chat";
import PermissionSettingsPage from "./PermissionSettingsPage";
import SkillSettingsPage from "./SkillSettingsPage";
import McpSettingsPage from "./McpSettingsPage";
import type { PermissionState } from "../hooks/usePermissionMode";

type Props = { onBack: () => void; permissionState: PermissionState };
type SettingsSection = "models" | "mcp" | "skills" | "permissions";

export default function ModelSettingsPage({ onBack, permissionState }: Props) {
  const [section, setSection] = useState<SettingsSection>("models");

  return <div className="model-settings-page">
    <aside className="model-settings-nav">
      <button className="settings-back" type="button" onClick={onBack}>‹ <span>返回应用</span></button>
      <div className="settings-account"><div className="settings-avatar">●</div><div><strong>QCode</strong><small>设置</small></div></div>
      <nav>
        <button className={`settings-nav-item ${section === "models" ? "active" : ""}`} type="button" onClick={() => setSection("models")}><span className="settings-nav-icon">⚙</span><span>模型</span></button>
        <button className={`settings-nav-item ${section === "mcp" ? "active" : ""}`} type="button" onClick={() => setSection("mcp")}><span className="settings-nav-icon">⌘</span><span>MCP</span></button>
        <button className={`settings-nav-item ${section === "skills" ? "active" : ""}`} type="button" onClick={() => setSection("skills")}><span className="settings-nav-icon">◇</span><span>技能</span></button>
        <button className={`settings-nav-item ${section === "permissions" ? "active" : ""}`} type="button" onClick={() => setSection("permissions")}><span className="settings-nav-icon">✓</span><span>权限审批</span></button>
      </nav>
    </aside>
    {section === "models" ? <ModelSettingsContent /> : section === "mcp" ? <McpSettingsPage /> : section === "skills" ? <SkillSettingsPage /> : <PermissionSettingsPage permissionState={permissionState} />}
  </div>;
}

function ModelSettingsContent() {
  const [providers, setProviders] = useState<ModelProvider[]>([]);
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ provider: "", modelName: "", apiKey: "" });

  const load = async () => {
    setError("");
    try {
      const [nextProviders, nextModels] = await Promise.all([fetchModelProviders(), fetchModels()]);
      setProviders(nextProviders);
      setModels(nextModels);
      setForm((current) => ({ ...current, provider: current.provider || nextProviders[0]?.code || "" }));
    } catch (value) { setError(value instanceof Error ? value.message : "模型数据加载失败"); }
  };
  useEffect(() => { void load(); }, []);

  const selectedProvider = useMemo(() => providers.find((item) => item.code === form.provider), [providers, form.provider]);
  const setField = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    if (!form.provider || !form.modelName.trim() || !form.apiKey.trim()) return;
    setSaving(true); setError("");
    try {
      await addModel({ provider: form.provider, modelName: form.modelName.trim(), apiKey: form.apiKey.trim(), baseUrl: selectedProvider?.defaultBaseUrl });
      setAdding(false); setForm((current) => ({ ...current, modelName: "", apiKey: "" })); await load();
    } catch (value) { setError(value instanceof Error ? value.message : "添加模型失败"); }
    finally { setSaving(false); }
  };

  const activate = async (model: ModelConfig) => {
    setError("");
    try { await activateModel(model.id); await load(); }
    catch (value) { setError(value instanceof Error ? value.message : "激活模型失败"); }
  };

  return <><main className="model-settings-content">
      <h1>模型</h1>
      <h2>模型管理</h2>
      <p className="settings-description">配置 API key，添加更多可用模型，激活的模型将在下一次对话请求中使用。</p>
      {error && <div className="settings-error">{error}</div>}
      <button className="add-model-button" type="button" onClick={() => setAdding(true)}>＋ 添加模型</button>
      <div className="model-table"><div className="model-table-head"><span>模型</span><span>服务商</span><span>操作</span></div>
        {models.length === 0 && <div className="model-empty">还没有配置模型</div>}
        {models.map((model) => <div className="model-table-row" key={model.id}>
          <span className="model-name">◉ {model.modelName}</span><span>{providers.find((item) => item.code === model.provider)?.name || model.provider}</span>
          <span><button className={`activate-button ${model.active ? "active" : ""}`} type="button" disabled={model.active} onClick={() => void activate(model)}>{model.active ? "已激活" : "激活"}</button></span>
        </div>)}
      </div>
    </main>
    {adding && <div className="model-modal-backdrop"><div className="model-modal">
      <div className="model-modal-header"><h2>通过服务商添加</h2><button type="button" onClick={() => setAdding(false)}>×</button></div>
      <label>服务商<select value={form.provider} onChange={(event) => setField("provider", event.target.value)}>{providers.map((provider) => <option key={provider.code} value={provider.code}>{provider.name}</option>)}</select></label>
      <label>模型<input value={form.modelName} placeholder="例如 deepseek-chat" onChange={(event) => setField("modelName", event.target.value)} /></label>
      <label>API 密钥<input type="password" value={form.apiKey} placeholder="请输入 API Key" onChange={(event) => setField("apiKey", event.target.value)} /></label>
      <div className="model-modal-hint">连通性测试会在首次对话请求时进行。API 地址将使用服务商默认地址。</div>
      <div className="model-modal-actions"><button type="button" onClick={() => setAdding(false)}>取消</button><button className="primary" type="button" disabled={saving || !form.provider || !form.modelName.trim() || !form.apiKey.trim()} onClick={() => void submit()}>{saving ? "添加中…" : "添加模型"}</button></div>
    </div></div>}
  </>;
}
