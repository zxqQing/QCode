import type { ChatMessage } from '../types/chat';
import { filePathMatches, findFilePath, escapeHtml } from "./filePath";

interface MarkdownList { type: "ul" | "ol"; items: string[]; }
interface CodeBlock { language: string; lines: string[]; }

function safeMarkdownUrl(value: unknown): string {
  const url = String(value || "").trim();
  return /^(https?:|mailto:|\/|#)/i.test(url) ? url : "#";
}

function renderInlineMarkdown(value: unknown): string {
  const placeholders: string[] = [];
  const stash = (html: string): string => {
    const token = `\u0000${placeholders.length}\u0000`;
    placeholders.push(html);
    return token;
  };

  let source = String(value || "");
  source = source.replace(/`([^`\n]+)`/g, (_, code: string) => {
    const path = findFilePath(code);
    return stash(path
      ? `<button type="button" class="file-path-link file-path-code" data-file-path="${escapeHtml(path)}" title="${escapeHtml(path)}"><code>${escapeHtml(code.trim())}</code></button>`
      : `<code>${escapeHtml(code)}</code>`);
  });
  source = source.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, alt, url) => {
    const safeUrl = safeMarkdownUrl(url);
    return stash(`<img src="${escapeHtml(safeUrl)}" alt="${escapeHtml(alt)}" loading="lazy">`);
  });
  source = source.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, label, url) => {
    const path = findFilePath(url);
    if (path) return stash(`<button type="button" class="file-path-link" data-file-path="${escapeHtml(path)}" title="${escapeHtml(path)}">${escapeHtml(label)}</button>`);
    const safeUrl = safeMarkdownUrl(url);
    return stash(`<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noreferrer noopener">${escapeHtml(label)}</a>`);
  });

  filePathMatches(source).reverse().forEach(({ index, path }) => {
    source = `${source.slice(0, index)}${stash(`<button type="button" class="file-path-link" data-file-path="${escapeHtml(path)}" title="${escapeHtml(path)}">${escapeHtml(path)}</button>`)}${source.slice(index + path.length)}`;
  });

  const html = escapeHtml(source)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    .replace(/~~(.+?)~~/g, "<del>$1</del>")
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>")
    .replace(/_([^_\n]+)_/g, "<em>$1</em>")
    .replace(/\n/g, "<br>\n");

  return html.replace(/\u0000(\d+)\u0000/g, (_, index) => placeholders[Number(index)] || "");
}

function highlightCode(value: unknown, language: unknown): string {
  const source = escapeHtml(value);
  const normalizedLanguage = String(language || "").toLowerCase();
  const isMarkup = /^(html|xml|svg)$/.test(normalizedLanguage);
  const isShell = /^(bash|sh|shell|zsh|powershell|ps)$/.test(normalizedLanguage);
  const isData = /^(json|yaml|yml)$/.test(normalizedLanguage);
  const isSql = normalizedLanguage === "sql";
  const isCode = /^(java|javascript|js|typescript|ts|jsx|tsx|c|cpp|c\+\+|csharp|cs|go|rust|kotlin|python|py|php|swift)$/.test(normalizedLanguage);
  if (!isMarkup && !isShell && !isData && !isSql && !isCode) return source;

  const placeholders: string[] = [];
  const stash = (className: string, text: string): string => {
    const token = `\u0000${placeholders.length}\u0000`;
    placeholders.push(`<span class="code-${className}">${text}</span>`);
    return token;
  };

  let html = source;
  const commentPattern = isMarkup
    ? /&lt;!--[\s\S]*?--&gt;/g
    : isShell || isData
      ? /(^|\s)(#.*)$/gm
      : isSql
        ? /(--[^\n]*|\/\*[\s\S]*?\*\/)/g
        : /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/g;
  html = html.replace(commentPattern, (match, prefix = "") => `${prefix}${stash("comment", prefix ? match.slice(prefix.length) : match)}`);
  html = html.replace(/(&quot;(?:\\.|[^&]|&(?!quot;))*?&quot;|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)/g, (match) => stash("string", match));
  html = html.replace(/\b(?:0x[\da-fA-F]+|\d+(?:\.\d+)?)\b/g, (match) => stash("number", match));

  const keywords = isData
    ? "true false null"
    : isSql
      ? "select from where insert into update delete create alter table and or not null as join on group by order limit values set"
      : isShell
        ? "if then else fi for in do done function case esac"
        : isMarkup
          ? "DOCTYPE"
          : "abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while var let const function async await export from true false null undefined"
            + " def lambda with yield None True False and or is not elif except finally as pass raise from global nonlocal"
            + " fn struct impl trait pub mut use mod match loop move crate self Self"
            + " func defer go select chan map range"
            + " fun val object data sealed when"
            + " namespace using virtual override readonly get set echo";

  const keywordPattern = new RegExp(`\\b(${keywords.split(/\\s+/).filter(Boolean).join("|")})\\b`, "g");
  html = html.replace(keywordPattern, (match) => `<span class="code-keyword">${match}</span>`);
  html = html.replace(/\b[A-Za-z_$][\w$]*(?=\s*\()/g, (match) => `<span class="code-function">${match}</span>`);

  return html.replace(/\u0000(\d+)\u0000/g, (_, index) => placeholders[Number(index)] || "");
}

function renderCodeBlock(code: string, language: string): string {
  const languageLabels: Record<string, string> = {
    js: "JavaScript", jsx: "JSX", ts: "TypeScript", tsx: "TSX", py: "Python",
    sh: "Shell", yml: "YAML", md: "Markdown", html: "HTML", xml: "XML", cpp: "C++", csharp: "C#"
  };
  const displayLanguage = languageLabels[String(language || "").toLowerCase()] || language || "Plain text";
  return (
    `<div class="markdown-code-block">` +
    `<div class="markdown-code-header">` +
    `<span class="markdown-code-language"><span class="markdown-code-symbol">&lt;/&gt;</span>${escapeHtml(displayLanguage)}</span>` +
    `<span class="markdown-code-actions">` +
    `<button type="button" class="markdown-code-action" aria-label="展开代码">↗</button>` +
    `<button type="button" class="markdown-code-action markdown-code-copy" data-copy-code aria-label="复制代码">▣</button>` +
    `</span>` +
    `</div><pre><code>${highlightCode(code, language)}</code></pre></div>`
  );
}

export function renderMarkdown(value: unknown): string {
  const lines = String(value || "").replace(/\r\n?/g, "\n").split("\n");
  const blocks: string[] = [];
  let paragraph: string[] = [];
  let list: MarkdownList | null = null;
  let code: CodeBlock | null = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(`<p>${renderInlineMarkdown(paragraph.join("\n"))}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    blocks.push(`<${list.type}>${list.items.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</${list.type}>`);
    list = null;
  };
  const flushOpenBlocks = () => { flushParagraph(); flushList(); };

  for (const line of lines) {
    const fence = line.match(/^\s*```\s*([\w-]*)\s*$/);
    if (fence) {
      if (code) {
        blocks.push(renderCodeBlock(code.lines.join("\n"), code.language));
        code = null;
      } else {
        flushOpenBlocks();
        code = { language: fence[1], lines: [] };
      }
      continue;
    }
    if (code) { code.lines.push(line); continue; }
    if (!line.trim()) { flushOpenBlocks(); continue; }

    const heading = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      flushOpenBlocks();
      const level = heading[1].length;
      blocks.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      flushParagraph();
      const type = unordered ? "ul" : "ol";
      if (!list || list.type !== type) { flushList(); list = { type, items: [] }; }
      const item = (unordered || ordered)?.[1];
      if (list && item) list.items.push(item);
      continue;
    }

    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) {
      flushOpenBlocks();
      blocks.push(`<blockquote>${renderInlineMarkdown(quote[1])}</blockquote>`);
      continue;
    }
    paragraph.push(line);
  }

  if (code) blocks.push(renderCodeBlock(code.lines.join("\n"), code.language));
  flushOpenBlocks();
  return blocks.join("");
}

export function renderMessage(message: ChatMessage): string {
  return message.role === "assistant"
    ? renderMarkdown(message.content)
    : escapeHtml(message.content).replace(/\n/g, "<br>");
}

