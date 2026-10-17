import type { FC } from "react";

const extensionPattern = "tsx?|jsx?|mjs|cjs|vue|svelte|css|scss|less|jsonc?|md|markdown|java|py|go|rs|html?|xml|svg|ya?ml|toml|sql|sh|bash|ps1|bat|txt|log|properties|gradle|kts|ipynb|c|h|cc|cpp|cxx|hpp|cs|php|swift";
const pathPattern = new RegExp(`(?<![\\w])(?:[A-Za-z]:[\\\\/]|/)?(?:[\\w.@+-]+[\\\\/])*[\\w.@+-]+\\.(?:${extensionPattern})(?![\\w.-])`, "gi");

export function findFilePath(value: string): string | null {
  const trimmed = value.trim().replace(/^[`'"([{]+|[`'"),;:!?\]}]+$/g, "");
  const matcher = new RegExp(`^(?:[A-Za-z]:[\\\\/]|/)?(?:[\\w.@+-]+[\\\\/])*[\\w.@+-]+\\.(?:${extensionPattern})$`, "i");
  return matcher.test(trimmed) ? trimmed : null;
}

export function filePathMatches(value: string): Array<{ index: number; path: string }> {
  const matcher = new RegExp(pathPattern.source, pathPattern.flags);
  return Array.from(value.matchAll(matcher), (match) => ({ index: match.index ?? 0, path: match[0] }));
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function renderFilePathsHtml(value: string): string {
  let result = "";
  let cursor = 0;
  for (const { index: start, path } of filePathMatches(value)) {
    result += escapeHtml(value.slice(cursor, start));
    result += `<button type="button" class="file-path-link" data-file-path="${escapeHtml(path)}" title="${escapeHtml(path)}">${escapeHtml(path)}</button>`;
    cursor = start + path.length;
  }
  return result + escapeHtml(value.slice(cursor));
}

interface FilePathTextProps {
  value: unknown;
  onOpenFile: (path: string) => void;
}

export const FilePathText: FC<FilePathTextProps> = ({ value, onOpenFile }) => {
  const text = typeof value === "string" ? value : String(value ?? "");
  const parts: Array<string | { path: string }> = [];
  let cursor = 0;
  for (const { index: start, path } of filePathMatches(text)) {
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push({ path });
    cursor = start + path.length;
  }
  if (cursor < text.length || parts.length === 0) parts.push(text.slice(cursor));
  return <>{parts.map((part, index) => typeof part === "string"
    ? <span key={index}>{part}</span>
    : <button key={index} type="button" className="file-path-link" title={part.path} onClick={() => onOpenFile(part.path)}>{part.path}</button>)}</>;
};
