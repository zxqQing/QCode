<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import IconRail from "./components/IconRail.vue";
import Sidebar from "./components/Sidebar.vue";
import EmptyState from "./components/EmptyState.vue";
import Composer from "./components/Composer.vue";

// 默认直连后端，确保和直接打开 http://localhost:8080/chat 使用同一条 SSE 链路。
// 部署到其他地址时可通过 VITE_API_BASE_URL 覆盖。
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8080").replace(/\/$/, "");
const SESSION_STORAGE_KEY = "qcode-chat-session-id";
const USER_ID = import.meta.env.VITE_QCODE_USER_ID || "default-user";

const activeIcon = ref("home");
const context = ref("QCode-v3 框架");
const messages = ref([]);
const isStreaming = ref(false);
const errorMessage = ref("");
const pendingConfirm = ref(null);
const messagesRef = ref(null);
const sessionId = ref(readSessionId());
const sessions = ref([]);
const sessionsLoading = ref(false);
let activeController = null;

const hasMessages = computed(() => messages.value.length > 0);

function createSessionId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readSessionId() {
  try {
    return localStorage.getItem(SESSION_STORAGE_KEY) || createSessionId();
  } catch {
    return createSessionId();
  }
}

function persistSessionId() {
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, sessionId.value);
  } catch {
    // 隐私模式或禁用 localStorage 时仍然可以正常对话。
  }
}

function normalizeSessions(payload) {
  const list = Array.isArray(payload) ? payload : payload?.data;
  if (!Array.isArray(list)) return [];
  return list
    .filter((item) => item?.sessionId)
    .map((item) => ({
      ...item,
      displayTitle: typeof item.title === "string" && item.title.trim()
        ? item.title.trim()
        : item.sessionId
    }));
}

async function loadSessions() {
  sessionsLoading.value = true;
  try {
    const params = new URLSearchParams({ userId: USER_ID });
    let response = await fetch(`${API_BASE_URL}/session/list?${params.toString()}`, {
      headers: { Accept: "application/json" }
    });

    // 当前 Spring Controller 的实际路径是 /session/list，兼容尚未加 /api 前缀的后端。
    if (response.status === 404) {
      response = await fetch(`${API_BASE_URL}/session/list?${params.toString()}`, {
        headers: { Accept: "application/json" }
      });
    }
    if (!response.ok) throw new Error(`会话列表请求失败（${response.status}）`);
    sessions.value = normalizeSessions(await response.json());
  } catch (error) {
    console.warn("加载会话列表失败：", error);
    sessions.value = [];
  } finally {
    sessionsLoading.value = false;
  }
}

function toTimestamp(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 100000000000 ? value * 1000 : value;
  }
  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric < 100000000000 ? numeric * 1000 : numeric;
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
}

function formatToolMessage(item) {
  const type = String(item.type || "").toLowerCase();
  if (type === "tool_use") {
    const input = item.input == null ? "" : `\n参数：\n${JSON.stringify(item.input, null, 2)}`;
    return `工具调用：${item.name || "未命名工具"}${input}`;
  }
  if (type === "tool_result") {
    const output = item.output || "（无输出）";
    return `工具结果${item.name ? `：${item.name}` : ""}\n${output}`;
  }
  return item.content || "";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeMarkdownUrl(value) {
  const url = String(value || "").trim();
  if (/^(https?:|mailto:|\/|#)/i.test(url)) return url;
  return "#";
}

function renderInlineMarkdown(value) {
  const placeholders = [];
  const stash = (html) => {
    const token = `\u0000${placeholders.length}\u0000`;
    placeholders.push(html);
    return token;
  };

  let source = String(value || "");
  // 先保护代码和链接，避免它们内部的符号被当成 Markdown 标记处理。
  source = source.replace(/`([^`\n]+)`/g, (_, code) => stash(`<code>${escapeHtml(code)}</code>`));
  source = source.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, alt, url) => {
    const safeUrl = safeMarkdownUrl(url);
    return stash(`<img src="${escapeHtml(safeUrl)}" alt="${escapeHtml(alt)}" loading="lazy">`);
  });
  source = source.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, label, url) => {
    const safeUrl = safeMarkdownUrl(url);
    return stash(`<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noreferrer noopener">${escapeHtml(label)}</a>`);
  });

  let html = escapeHtml(source)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    .replace(/~~(.+?)~~/g, "<del>$1</del>")
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>")
    .replace(/_([^_\n]+)_/g, "<em>$1</em>")
    .replace(/\n/g, "<br>\n");

  return html.replace(/\u0000(\d+)\u0000/g, (_, index) => placeholders[Number(index)] || "");
}

function highlightCode(value, language) {
  const source = escapeHtml(value);
  const normalizedLanguage = String(language || "").toLowerCase();
  const isMarkup = /^(html|xml|svg)$/.test(normalizedLanguage);
  const isShell = /^(bash|sh|shell|zsh|powershell|ps)$/.test(normalizedLanguage);
  const isData = /^(json|yaml|yml)$/.test(normalizedLanguage);
  const isSql = normalizedLanguage === "sql";
  const isCode = /^(java|javascript|js|typescript|ts|jsx|tsx|c|cpp|c\+\+|csharp|cs|go|rust|kotlin|python|py|php|swift)$/.test(normalizedLanguage);
  if (!isMarkup && !isShell && !isData && !isSql && !isCode) return source;

  const placeholders = [];
  const stash = (className, text) => {
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
              + " def lambda with yield None True False and or is not elif except finally as pass raise return from global nonlocal"
              + " fn struct impl trait pub mut use mod match loop move crate self Self"
              + " func defer go select chan map range"
              + " fun val object data sealed when"
              + " func"
              + " namespace using virtual override readonly get set"
              + " echo"
              .trim();

  const keywordPattern = new RegExp(`\\b(${keywords.split(/\\s+/).filter(Boolean).join("|")})\\b`, "g");
  html = html.replace(keywordPattern, (match) => `<span class="code-keyword">${match}</span>`);
  html = html.replace(/\b[A-Za-z_$][\w$]*(?=\s*\()/g, (match) => `<span class="code-function">${match}</span>`);

  return html.replace(/\u0000(\d+)\u0000/g, (_, index) => placeholders[Number(index)] || "");
}

function renderCodeBlock(code, language) {
  const languageLabels = {
    js: "JavaScript",
    jsx: "JSX",
    ts: "TypeScript",
    tsx: "TSX",
    py: "Python",
    sh: "Shell",
    yml: "YAML",
    md: "Markdown",
    html: "HTML",
    xml: "XML",
    cpp: "C++",
    csharp: "C#"
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
    `</div>` +
    `<pre><code>${highlightCode(code, language)}</code></pre>` +
    `</div>`
  );
}

function renderMarkdown(value) {
  const lines = String(value || "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let paragraph = [];
  let list = null;
  let code = null;

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

  const flushOpenBlocks = () => {
    flushParagraph();
    flushList();
  };

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

    if (code) {
      code.lines.push(line);
      continue;
    }

    if (!line.trim()) {
      flushOpenBlocks();
      continue;
    }

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
      if (!list || list.type !== type) {
        flushList();
        list = { type, items: [] };
      }
      list.items.push((unordered || ordered)[1]);
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

  if (code) {
    blocks.push(renderCodeBlock(code.lines.join("\n"), code.language));
  }
  flushOpenBlocks();
  return blocks.join("");
}

function renderMessage(message) {
  return message.role === "assistant" ? renderMarkdown(message.content) : escapeHtml(message.content).replace(/\n/g, "<br>");
}

async function onMessageContentClick(event) {
  const button = event.target.closest("button[data-copy-code]");
  if (!button) return;
  const code = button.closest(".markdown-code-block")?.querySelector("code")?.textContent || "";
  try {
    await navigator.clipboard.writeText(code);
    button.textContent = "✓";
    button.setAttribute("aria-label", "已复制");
    setTimeout(() => {
      button.textContent = "▣";
      button.setAttribute("aria-label", "复制代码");
    }, 1200);
  } catch {
    // 浏览器未授权剪贴板时不影响消息展示。
  }
}

function normalizeMessages(payload) {
  const list = Array.isArray(payload) ? payload : payload?.data;
  if (!Array.isArray(list)) return [];

  return list
    .map((item, index) => ({ item, index, timestamp: toTimestamp(item?.timestamp) }))
    .sort((a, b) => a.timestamp - b.timestamp || a.index - b.index)
    .map(({ item, index }) => {
      const type = String(item?.type || "message").toLowerCase();
      const isUser = type === "message" && String(item?.role || "").toUpperCase() === "USER";
      return {
        id: item?.id || `history-${index}`,
        role: isUser ? "user" : "assistant",
        content: type === "message" ? (item?.content || "") : formatToolMessage(item || {}),
        streaming: false,
        receivedDelta: true,
        historyType: type,
        timestamp: item?.timestamp
      };
    })
    .filter((message) => message.content);
}

async function loadSessionMessages(targetSessionId) {
  errorMessage.value = "";
  try {
    const encodedSessionId = encodeURIComponent(targetSessionId);
    let response = await fetch(`${API_BASE_URL}/api/session/${encodedSessionId}/messages`, {
      headers: { Accept: "application/json" }
    });

    if (response.status === 404) {
      response = await fetch(`${API_BASE_URL}/session/${encodedSessionId}/messages`, {
        headers: { Accept: "application/json" }
      });
    }
    if (!response.ok) throw new Error(`会话消息请求失败（${response.status}）`);
    messages.value = normalizeMessages(await response.json());
    // 恢复历史会话时直接定位到底部，避免受 smooth 滚动影响出现从顶部滚下来的过程。
    scrollToLatest({ instant: true });
  } catch (error) {
    messages.value = [];
    errorMessage.value = error.message || "加载会话消息失败";
  }
}

function scrollToLatest({ instant = false } = {}) {
  nextTick(() => {
    const el = messagesRef.value;
    if (!el) return;

    if (instant) {
      const previousBehavior = el.style.scrollBehavior;
      el.style.scrollBehavior = "auto";
      el.scrollTop = el.scrollHeight;
      el.style.scrollBehavior = previousBehavior;
      return;
    }

    el.scrollTop = el.scrollHeight;
  });
}

function onSelectIcon(key) {
  activeIcon.value = key;
}

function onSelectProject(name) {
  context.value = name;
}

function onNewChat() {
  activeController?.abort();
  activeController = null;
  sessionId.value = createSessionId();
  persistSessionId();
  messages.value = [];
  pendingConfirm.value = null;
  errorMessage.value = "";
  isStreaming.value = false;
}

function addMessage(role, content = "") {
  const message = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    content,
    streaming: false,
    receivedDelta: false
  };
  messages.value.push(message);
  scrollToLatest();
  // 从响应式数组中重新取出代理对象，后续修改 content 才会逐段触发 Vue 更新。
  return messages.value[messages.value.length - 1];
}

function appendAssistantText(message, text) {
  if (!text) return;
  message.content += text;
  scrollToLatest();
}

function dispatchEvent(eventName, data, assistantMessage) {
  if (eventName === "MESSAGE") {
    appendAssistantText(assistantMessage, data);
    return;
  }

  if (eventName === "REQUIRE_USER_CONFIRM") {
    try {
      pendingConfirm.value = { toolCalls: JSON.parse(data), messageId: assistantMessage.id };
    } catch {
      pendingConfirm.value = {
        toolCalls: [{ name: "工具调用", input: data }],
        messageId: assistantMessage.id
      };
    }
    scrollToLatest();
    return;
  }

  if (eventName === "ERROR") errorMessage.value = data || "服务端返回了错误";
}

function extractResultText(result) {
  if (!result) return "";
  if (typeof result === "string") return result;
  if (!Array.isArray(result.content)) return "";
  return result.content
    .filter((item) => item?.type === "text" && item.text)
    .map((item) => item.text)
    .join("");
}

function dispatchAgentEvent(agentEvent, assistantMessage) {
  const type = agentEvent?.type;

  if (type === "TEXT_BLOCK_DELTA") {
    assistantMessage.receivedDelta = true;
    appendAssistantText(assistantMessage, agentEvent.delta || "");
    return;
  }

  // AgentEvent 流结束时还会发送 AGENT_RESULT。已经收到增量文本时不再重复追加。
  if (type === "AGENT_RESULT" && !assistantMessage.receivedDelta) {
    appendAssistantText(assistantMessage, extractResultText(agentEvent.result));
    return;
  }

  if (type === "REQUIRE_USER_CONFIRM" || type === "REQUIRE_USER_CONFIRM_EVENT") {
    pendingConfirm.value = {
      toolCalls: agentEvent.toolCalls || [],
      messageId: assistantMessage.id
    };
    scrollToLatest();
  }

}

function parseEventBlock(block, assistantMessage) {
  const trimmed = block.trim();
  if (!trimmed) return;

  // 某些 Spring MVC 配置会把 Flux<String> 编码成 JSON 数组，兼容这种响应。
  if (trimmed.startsWith("[")) {
    try {
      const chunks = JSON.parse(trimmed);
      if (Array.isArray(chunks)) {
        chunks.forEach((chunk) => parseEventBlock(String(chunk), assistantMessage));
        return;
      }
    } catch {
      // 不是 JSON 时继续按标准 SSE 解析。
    }
  }

  const lines = trimmed.split(/\r?\n/);
  let eventName = "";
  const dataLines = [];
  for (const line of lines) {
    if (line.startsWith("event:")) eventName = line.slice(6).trim();
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }

  const rawData = dataLines.join("\n");

  // 当前后端返回 Flux<AgentEvent>，每个 data 都是 AgentEvent JSON。
  if (!eventName && rawData.startsWith("{")) {
    try {
      dispatchAgentEvent(JSON.parse(rawData), assistantMessage);
      return;
    } catch {
      // 不是 JSON 时继续按旧版文本 SSE 解析。
    }
  }

  // 兼容 Spring 将字符串再次包装成 SSE data 的响应格式。
  if (!eventName && rawData.includes("event:")) {
    parseEventBlock(rawData, assistantMessage);
    return;
  }

  if (eventName) dispatchEvent(eventName, dataLines.join("\n"), assistantMessage);
}

async function readEventStream(response, assistantMessage) {
  if (!response.body) throw new Error("服务器没有返回可读取的消息流");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() || "";
    blocks.forEach((block) => parseEventBlock(block, assistantMessage));
    if (done) break;
  }

  if (buffer.trim()) parseEventBlock(buffer, assistantMessage);
}

async function onSend(text) {
  if (isStreaming.value || !text?.trim()) return;

  errorMessage.value = "";
  pendingConfirm.value = null;
  persistSessionId();
  addMessage("user", text.trim());
  const assistantMessage = addMessage("assistant");
  assistantMessage.streaming = true;
  isStreaming.value = true;
  const controller = new AbortController();
  activeController = controller;

  const params = new URLSearchParams({ message: text.trim(), sessionId: sessionId.value });

  try {
    const response = await fetch(`${API_BASE_URL}/chat?${params.toString()}`, {
      method: "GET",
      headers: { Accept: "text/event-stream" },
      signal: controller.signal
    });

    if (!response.ok) throw new Error(`请求失败（${response.status}）`);
    await readEventStream(response, assistantMessage);
    if (!assistantMessage.content && !pendingConfirm.value) assistantMessage.content = "服务端没有返回消息。";
  } catch (error) {
    if (error.name !== "AbortError") {
      errorMessage.value = error.message || "聊天请求失败，请检查后端服务是否已启动。";
      assistantMessage.content = assistantMessage.content || "暂时无法连接到 QCode 服务。";
    }
  } finally {
    assistantMessage.streaming = false;
    if (activeController === controller) {
      isStreaming.value = false;
      activeController = null;
    }
    scrollToLatest();
    loadSessions();
  }
}

async function confirmTool(confirmed) {
  if (!pendingConfirm.value) return;

  const confirmation = pendingConfirm.value;
  const assistantMessage = messages.value.find((message) => message.id === confirmation.messageId)
    || [...messages.value].reverse().find((message) => message.role === "assistant");
  if (!assistantMessage) return;

  const payload = {
    sessionId: sessionId.value,
    confirmed,
    toolCalls: confirmation.toolCalls
  };

  pendingConfirm.value = null;
  errorMessage.value = "";
  assistantMessage.streaming = true;
  isStreaming.value = true;
  const controller = new AbortController();
  activeController = controller;

  try {
    const response = await fetch(`${API_BASE_URL}/chat/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`确认失败（${response.status}）`);
    // 审批接口同样返回 Flux<AgentEvent>，必须继续读取响应流。
    await readEventStream(response, assistantMessage);
  } catch (error) {
    if (error.name !== "AbortError") {
      errorMessage.value = error.message || "工具确认失败";
    }
  } finally {
    assistantMessage.streaming = false;
    if (activeController === controller) {
      activeController = null;
      isStreaming.value = false;
    }
    scrollToLatest();
    loadSessions();
  }
}

async function onSelectSession(session) {
  activeController?.abort();
  activeController = null;
  sessionId.value = session.sessionId;
  persistSessionId();
  context.value = session.displayTitle || session.sessionId;
  messages.value = [];
  pendingConfirm.value = null;
  errorMessage.value = "";
  isStreaming.value = false;
  await loadSessionMessages(session.sessionId);
}

async function initializeSessions() {
  await loadSessions();
  if (sessions.value.some((session) => session.sessionId === sessionId.value)) {
    await loadSessionMessages(sessionId.value);
  }
}

onMounted(initializeSessions);
onBeforeUnmount(() => activeController?.abort());
</script>

<template>
  <div class="app">
    <div class="main-container">
      <IconRail :active="activeIcon" @select-icon="onSelectIcon" />
      <Sidebar
        :sessions="sessions"
        :sessions-loading="sessionsLoading"
        @new-chat="onNewChat"
        @select-project="onSelectProject"
        @select-session="onSelectSession"
      />

      <main class="content">
        <EmptyState v-if="!hasMessages" :context="context" />

        <section v-else ref="messagesRef" class="messages" aria-live="polite">
          <article
            v-for="message in messages"
            :key="message.id"
            class="message-row"
            :class="`message-${message.role}`"
          >
            <div class="message-avatar">{{ message.role === "user" ? "我" : "Q" }}</div>
            <div class="message-bubble">
              <div class="message-content" :class="{ 'markdown-content': message.role === 'assistant' }" @click="onMessageContentClick" v-html="renderMessage(message)"></div>
              <span v-if="message.streaming" class="typing-indicator" aria-label="正在生成"><i></i><i></i><i></i></span>
            </div>
          </article>

          <div v-if="pendingConfirm" class="confirm-card">
            <div class="confirm-title">QCode 请求执行工具</div>
            <pre>{{ JSON.stringify(pendingConfirm.toolCalls, null, 2) }}</pre>
            <div class="confirm-actions">
              <button class="confirm-button secondary" @click="confirmTool(false)">拒绝</button>
              <button class="confirm-button primary" @click="confirmTool(true)">允许执行</button>
            </div>
          </div>

          <div v-if="errorMessage" class="error-banner">{{ errorMessage }}</div>
        </section>

        <Composer :context="context" :disabled="isStreaming" @send="onSend" />
      </main>
    </div>
  </div>
</template>

<style scoped>
.app { display: flex; flex-direction: column; height: 100vh; }
.main-container { display: flex; flex: 1; overflow: hidden; }
.content { flex: 1; min-width: 0; background: var(--bg-white); position: relative; display: flex; flex-direction: column; align-items: center; overflow: hidden; }
.messages { width: min(100%, 820px); flex: 1; overflow-y: auto; padding: 40px 28px 180px; scroll-behavior: smooth; }
.message-row { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 24px; }
.message-user { flex-direction: row-reverse; }
.message-avatar { width: 30px; height: 30px; flex: 0 0 30px; border-radius: 9px; display: flex; align-items: center; justify-content: center; color: white; background: var(--accent); font-size: 12px; font-weight: 600; }
.message-assistant .message-avatar { color: var(--accent); background: var(--accent-soft); }
.message-bubble { max-width: min(88%, 760px); padding: 0; border-radius: 12px; color: var(--text-primary); line-height: 1.7; overflow-wrap: anywhere; }
.message-user .message-bubble { max-width: min(78%, 620px); padding: 10px 14px; background: var(--accent); color: white; }
.message-assistant .message-bubble { flex: 1; }
.message-content { min-width: 8px; min-height: 20px; }
.message-user .message-content { min-height: 0; }
.markdown-content p { margin: 0 0 14px; }
.markdown-content p:last-child { margin-bottom: 0; }
.markdown-content h1, .markdown-content h2, .markdown-content h3, .markdown-content h4, .markdown-content h5, .markdown-content h6 { margin: 20px 0 10px; color: var(--text-primary); line-height: 1.3; }
.markdown-content h1:first-child, .markdown-content h2:first-child, .markdown-content h3:first-child { margin-top: 0; }
.markdown-content h1 { font-size: 1.55em; }
.markdown-content h2 { font-size: 1.3em; }
.markdown-content h3 { font-size: 1.12em; }
.markdown-content ul, .markdown-content ol { margin: 8px 0 14px 24px; padding: 0; }
.markdown-content li { margin: 5px 0; padding-left: 3px; }
.markdown-content blockquote { margin: 12px 0; padding: 8px 14px; border-left: 3px solid var(--accent-soft); color: var(--text-secondary); background: #f8fafc; }
.markdown-content a { color: var(--accent); text-decoration: none; }
.markdown-content a:hover { text-decoration: underline; }
.markdown-content img { display: block; max-width: 100%; height: auto; border-radius: 8px; margin: 8px 0; }
.markdown-content code { padding: 2px 5px; border-radius: 5px; background: #eef0f3; color: #b42318; font: 0.9em ui-monospace, SFMono-Regular, Consolas, monospace; }
.markdown-content .markdown-code-block { margin: 16px 0; overflow: hidden; border: 1px solid #e3e3e5; border-radius: 13px; background: #f7f7f8; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02); }
.markdown-content .markdown-code-header { display: flex; align-items: center; justify-content: space-between; min-height: 42px; padding: 8px 14px 8px 16px; border-bottom: 1px solid #e8e8ea; color: #252525; font-size: 12px; }
.markdown-content .markdown-code-language { display: inline-flex; align-items: center; gap: 9px; font-weight: 600; }
.markdown-content .markdown-code-symbol { color: #222; font: 600 14px ui-monospace, SFMono-Regular, Consolas, monospace; letter-spacing: -2px; }
.markdown-content .markdown-code-actions { display: inline-flex; align-items: center; gap: 7px; }
.markdown-content .markdown-code-action { display: inline-flex; align-items: center; justify-content: center; width: 25px; height: 25px; border-radius: 5px; color: #303030; font-size: 17px; line-height: 1; }
.markdown-content .markdown-code-action:hover { background: #e8e8ea; }
.markdown-content .markdown-code-copy { font-size: 16px; }
.markdown-content pre { margin: 0; padding: 14px; overflow-x: auto; background: #f7f7f8; }
.markdown-content pre code { padding: 0; background: transparent; color: #24292f; font: 13px/1.75 ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace; white-space: pre; }
.markdown-content .code-comment { color: #6a737d; }
.markdown-content .code-string { color: #a31515; }
.markdown-content .code-number { color: #098658; }
.markdown-content .code-keyword { color: #7c3aed; }
.markdown-content .code-function { color: #005cc5; }
.message-user .message-content a { color: inherit; text-decoration: underline; }
.message-user .message-content code { color: inherit; background: rgba(255, 255, 255, 0.16); }
.message-content:empty { min-width: 8px; min-height: 20px; }
.typing-indicator { display: inline-flex; gap: 3px; margin-left: 5px; vertical-align: middle; }
.typing-indicator i { width: 4px; height: 4px; border-radius: 50%; background: currentColor; opacity: 0.45; animation: typing 1.2s infinite ease-in-out; }
.typing-indicator i:nth-child(2) { animation-delay: 0.15s; }
.typing-indicator i:nth-child(3) { animation-delay: 0.3s; }
@keyframes typing { 0%, 60%, 100% { transform: translateY(0); opacity: 0.35; } 30% { transform: translateY(-3px); opacity: 0.9; } }
.confirm-card { margin: 4px 0 24px 42px; padding: 14px; border: 1px solid var(--accent-soft); border-radius: 10px; background: #f8fbff; }
.confirm-title { color: var(--text-primary); font-weight: 600; margin-bottom: 8px; }
.confirm-card pre { max-height: 180px; overflow: auto; padding: 10px; border-radius: 6px; background: var(--bg-white); color: var(--text-secondary); font: 12px/1.5 ui-monospace, SFMono-Regular, Consolas, monospace; white-space: pre-wrap; }
.confirm-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 10px; }
.confirm-button { padding: 6px 12px; border-radius: 6px; font-size: 12px; }
.confirm-button.primary { color: white; background: var(--accent); }
.confirm-button.secondary { color: var(--text-secondary); background: var(--bg-white); border: 1px solid var(--border-light); }
.error-banner { margin: 0 0 24px 42px; padding: 9px 12px; border-radius: 7px; color: #b42318; background: #fff4f2; font-size: 12px; }
@media (max-width: 720px) { .messages { padding: 24px 14px 170px; } .message-bubble { max-width: 86%; } .confirm-card, .error-banner { margin-left: 0; } }
</style>
