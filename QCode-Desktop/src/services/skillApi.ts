const baseUrl = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8080").replace(/\/$/, "");

export interface SkillSummary {
  name: string;
  description: string;
  path: string;
}

export interface SkillFolderFile {
  file: File;
  path: string;
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

export async function fetchSkills(): Promise<SkillSummary[]> {
  const response = await fetch(`${baseUrl}/skill/list`, { headers: { Accept: "application/json" } });
  if (!response.ok) throw await parseError(response, "列表加载失败");
  const payload = await response.json();
  return Array.isArray(payload) ? payload : [];
}

export async function fetchSkill(name: string): Promise<string> {
  const response = await fetch(`${baseUrl}/skill/${encodeURIComponent(name)}`, { headers: { Accept: "text/plain" } });
  if (!response.ok) throw await parseError(response, "内容加载失败");
  return response.text();
}

export async function uploadSkill(files: SkillFolderFile[]): Promise<SkillSummary> {
  const body = new FormData();
  files.forEach(({ file, path }) => {
    body.append("files", file, file.name);
    body.append("paths", path);
  });
  const response = await fetch(`${baseUrl}/skill/upload`, { method: "POST", body });
  if (!response.ok) throw await parseError(response, "上传失败");
  return response.json() as Promise<SkillSummary>;
}

export async function deleteSkill(name: string): Promise<void> {
  const response = await fetch(`${baseUrl}/skill/${encodeURIComponent(name)}`, { method: "DELETE" });
  if (!response.ok) throw await parseError(response, "删除失败");
}
