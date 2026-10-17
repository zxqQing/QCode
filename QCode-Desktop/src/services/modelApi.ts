import type { ModelConfig, ModelProvider } from "../types/chat";

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

export async function fetchModelProviders(): Promise<ModelProvider[]> {
  return parse<ModelProvider[]>(await fetch(`${baseUrl}/models/providers`, { headers: { Accept: "application/json" } }), "服务商列表请求失败");
}

export async function fetchModels(): Promise<ModelConfig[]> {
  return parse<ModelConfig[]>(await fetch(`${baseUrl}/models/list`, { headers: { Accept: "application/json" } }), "模型列表请求失败");
}

export interface AddModelInput {
  modelName: string;
  provider: string;
  baseUrl?: string;
  apiKey: string;
}

export async function addModel(input: AddModelInput): Promise<void> {
  await parse<void>(await fetch(`${baseUrl}/models/add`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(input)
  }), "添加模型失败");
}

export async function activateModel(id: string): Promise<void> {
  await parse<void>(await fetch(`${baseUrl}/models/${encodeURIComponent(id)}/activate`, {
    method: "PUT",
    headers: { Accept: "application/json" }
  }), "激活模型失败");
}
