import { useCallback, useEffect, useRef, useState } from "react";
import {
  confirmChatStream,
  fetchSessionMessages,
  fetchRecentSessions,
  openChatStream,
  readEventStream,
  stopChat,
  renameSession,
  deleteSession as removeSession
} from "../services/chatApi";
import { createProject, deleteProject as removeProject, fetchProjects, updateProject } from "../services/projectApi";
import { fetchSessionChanges, type SessionChangesResponse } from "../services/sessionChangesApi";
import type { AgentEvent, ChatMessage, CreateProjectInput, MessageAttachment, MessageBlock, PendingConfirmation, Project, Session, SessionMessage, ThinkingEvent, ToolCall, ToolEvent } from "../types/chat";

const SESSION_STORAGE_KEY = "qcode-chat-session-id";
const DEFAULT_SESSION_TITLE = "新会话";
const PROJECT_STORAGE_KEY = "qcode-chat-project-id";
const PLAN_MODE_STORAGE_KEY = "qcode-chat-plan-mode-sessions";

interface SessionRuntime {
  messages: ChatMessage[];
  initialized: boolean;
  isStreaming: boolean;
  isStopping: boolean;
  requestRevision: number;
  errorMessage: string;
  pendingConfirm: PendingConfirmation | null;
  controller: AbortController | null;
}

function chatSessionKey(sessionId: string, projectId?: string | null): string {
  return `${projectId || "default"}:${sessionId}`;
}

function createSessionRuntime(): SessionRuntime {
  return {
    messages: [],
    initialized: false,
    isStreaming: false,
    isStopping: false,
    requestRevision: 0,
    errorMessage: "",
    pendingConfirm: null,
    controller: null
  };
}

function createId(prefix = "id"): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createSessionId(): string {
  return createId("session");
}

function readSessionId(): string {
  try {
    return localStorage.getItem(SESSION_STORAGE_KEY) || createSessionId();
  } catch {
    return createSessionId();
  }
}

function persistSessionId(sessionId: string): void {
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  } catch {
    // Private browsing or disabled storage should not block chat.
  }
}

function readProjectId(): string | null {
  try { return localStorage.getItem(PROJECT_STORAGE_KEY); } catch { return null; }
}

function persistProjectId(projectId: string | null): void {
  try {
    if (projectId) localStorage.setItem(PROJECT_STORAGE_KEY, projectId);
    else localStorage.removeItem(PROJECT_STORAGE_KEY);
  } catch { /* ignore unavailable storage */ }
}

function planModeKey(sessionId: string, projectId?: string | null): string {
  return `${projectId || "default"}:${sessionId}`;
}

function readPlanMode(sessionId: string, projectId?: string | null): boolean {
  try {
    const stored = JSON.parse(localStorage.getItem(PLAN_MODE_STORAGE_KEY) || "{}") as Record<string, boolean>;
    return stored[planModeKey(sessionId, projectId)] === true;
  } catch {
    return false;
  }
}

function persistPlanMode(sessionId: string, projectId: string | null | undefined, enabled: boolean): void {
  try {
    const stored = JSON.parse(localStorage.getItem(PLAN_MODE_STORAGE_KEY) || "{}") as Record<string, boolean>;
    const key = planModeKey(sessionId, projectId);
    if (enabled) stored[key] = true;
    else delete stored[key];
    localStorage.setItem(PLAN_MODE_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Unavailable storage should not block switching chat modes.
  }
}

function toTimestamp(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value < 100000000000 ? value * 1000 : value;
  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric < 100000000000 ? numeric * 1000 : numeric;
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
}

function markdownBlock(content: string, roundId?: string): MessageBlock {
  return { type: "markdown", id: createId("markdown"), roundId, content };
}

function upsertMarkdownBlock(blocks: MessageBlock[], event: Extract<MessageBlock, { type: "markdown" }>): MessageBlock[] {
  const existingIndex = blocks.findIndex((block) => block.type === "markdown" && block.id === event.id);
  if (existingIndex < 0) return [...blocks, event];
  return blocks.map((block, index) => index === existingIndex ? event : block);
}

function changeSummaryBlock(messageId: string, response: SessionChangesResponse): MessageBlock | null {
  if (!response.available || !response.files.length) return null;
  return {
    type: "changes",
    id: `${messageId}-changes`,
    summary: {
      additions: response.additions,
      deletions: response.deletions,
      files: response.files.map(({ path, absolutePath, type, additions, deletions }) => ({ path, absolutePath, type, additions, deletions }))
    }
  };
}

function withLatestChangeSummary(messages: ChatMessage[], messageId: string, block: MessageBlock | null): ChatMessage[] {
  return messages.map((message) => {
    const blocks = (message.blocks || []).filter((item) => item.type !== "changes");
    return message.id === messageId && block ? { ...message, blocks: [...blocks, block] } : { ...message, blocks };
  });
}

function formatToolSummary(name: string, source: Record<string, unknown>): string {
  const explicit = source.summary || source.description || source.title;
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();
  if (name === "read_file") return "读取项目文件";
  if (name === "write_file") return "写入项目文件";
  if (name === "shell" || name === "qcode-execute") return "执行命令";
  return `执行 ${name}`;
}

function statusFromSource(type: string, source: Record<string, unknown>): ToolEvent["status"] {
  const raw = String(source.status || "").toLowerCase();
  if ((["queued", "running", "success", "failed", "approval"] as string[]).includes(raw)) return raw as ToolEvent["status"];
  const normalizedType = type.toLowerCase();
  if (normalizedType.includes("approval") || normalizedType.includes("confirm")) return "approval";
  if (normalizedType.includes("result") || normalizedType.includes("complete") || normalizedType.includes("success") || normalizedType.includes("finished")) return "success";
  if (normalizedType.includes("error") || normalizedType.includes("fail")) return "failed";
  return "running";
}

function toolExitCode(source: Record<string, unknown>, output?: string): number | undefined {
  const value = source.exitCode ?? source.exit_code;
  if (typeof value === "number") return value;
  const match = output?.match(/(?:^|\n)Exit code:\s*(-?\d+)/i);
  return match ? Number(match[1]) : undefined;
}

function toolWorkingDirectory(source: Record<string, unknown>, input: unknown = source.input): string | undefined {
  const direct = source.workingDirectory ?? source.working_directory;
  if (typeof direct === "string" && direct.trim()) return direct;
  let parameters = input;
  if (typeof parameters === "string") {
    try { parameters = JSON.parse(parameters) as unknown; } catch { return undefined; }
  }
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) return undefined;
  const value = (parameters as Record<string, unknown>).working_directory ?? (parameters as Record<string, unknown>).workingDirectory;
  return typeof value === "string" && value.trim() ? value : undefined;
}

function toolFailed(source: Record<string, unknown>, output?: string): boolean {
  const exitCode = toolExitCode(source, output);
  const state = String(source.state || "").toUpperCase();
  return source.isError === true || source.failed === true || Boolean(source.error) || ["ERROR", "DENIED", "INTERRUPTED"].includes(state) || (exitCode != null && exitCode !== 0) || Boolean(output?.startsWith("Error: Tool execution failed:"));
}

function eventDataText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const source = value as Record<string, unknown>;
    if (typeof source.text === "string") return source.text;
  }
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

function toolStateError(source: Record<string, unknown>): string | undefined {
  const state = String(source.state || "").toUpperCase();
  if (state === "DENIED") return "工具调用已被拒绝";
  if (state === "INTERRUPTED") return "工具执行已中断";
  if (state === "ERROR") return "工具执行失败";
  return typeof source.error === "string" ? source.error : undefined;
}

function normalizeToolEvent(event: AgentEvent, idOverride?: string, statusType?: string): ToolEvent | null {
  const type = String(statusType || event.type || "").toLowerCase();
  if (!type.includes("tool") && !type.includes("command") && !event.tool && !event.toolEvent) return null;
  const source = (event.toolEvent || event.tool || event) as Record<string, unknown>;
  const name = String(source.name || source.toolName || source.toolCallName || "工具执行");
  const stableId = source.id || source.toolCallId;
  const id = String(idOverride || stableId || createId("tool"));
  const input = source.input;
  return {
    id,
    roundId: typeof source.replyId === "string" ? source.replyId : typeof source.parentId === "string" ? source.parentId : undefined,
    toolCallId: typeof source.toolCallId === "string" ? source.toolCallId : typeof stableId === "string" ? stableId : undefined,
    name,
    summary: formatToolSummary(name, source),
    status: statusFromSource(type, source),
    command: typeof source.command === "string" ? source.command : input && typeof input === "object" && typeof (input as Record<string, unknown>).command === "string" ? (input as Record<string, string>).command : typeof input === "string" ? input : undefined,
    workingDirectory: toolWorkingDirectory(source, input),
    input,
    output: typeof source.output === "string" ? source.output : typeof source.result === "string" ? source.result : undefined,
    error: typeof source.error === "string" ? source.error : undefined,
    durationMs: typeof source.durationMs === "number" ? source.durationMs : typeof source.duration_ms === "number" ? source.duration_ms : undefined,
    exitCode: toolExitCode(source, typeof source.output === "string" ? source.output : undefined),
    startedAt: source.startedAt as string | number | undefined,
    endedAt: source.endedAt as string | number | undefined
  };
}

function upsertToolBlock(blocks: MessageBlock[], event: ToolEvent): MessageBlock[] {
  const existingIndex = blocks.findIndex((block) => block.type === "tool" && (
    block.event.id === event.id ||
    Boolean(event.toolCallId && block.event.toolCallId === event.toolCallId)
  ));
  if (existingIndex < 0) return [...blocks, { type: "tool", event }];
  return blocks.map((block, index) => index === existingIndex && block.type === "tool"
    ? { ...block, event: { ...block.event, ...Object.fromEntries(Object.entries(event).filter(([, value]) => value !== undefined)) } }
    : block);
}

function upsertThinkingBlock(blocks: MessageBlock[], event: ThinkingEvent): MessageBlock[] {
  const existingIndex = blocks.findIndex((block) => block.type === "thinking" && block.event.id === event.id);
  if (existingIndex < 0) return [...blocks, { type: "thinking", event }];
  return blocks.map((block, index) => index === existingIndex && block.type === "thinking"
    ? { ...block, event: { ...block.event, ...event } }
    : block);
}

function toolEventsFromBlocks(blocks: MessageBlock[]): ToolEvent[] {
  return blocks.filter((block): block is Extract<MessageBlock, { type: "tool" }> => block.type === "tool").map((block) => block.event);
}

function mergeToolResult(event: ToolEvent, result: Record<string, unknown>): ToolEvent {
  const output = typeof result.output === "string" ? result.output : typeof result.result === "string" ? result.result : event.output;
  return {
    ...event,
    status: toolFailed(result, output) ? "failed" : "success",
    output,
    error: typeof result.error === "string" ? result.error : event.error,
    exitCode: toolExitCode(result, output) ?? event.exitCode,
    durationMs: typeof result.durationMs === "number" ? result.durationMs : event.durationMs,
    endedAt: result.endedAt as string | number | undefined || event.endedAt
  };
}

function normalizeMessages(list: SessionMessage[]): ChatMessage[] {
  const sorted = list
    .map((item, index) => ({ item, index, timestamp: toTimestamp(item.timestamp) }))
    .sort((a, b) => a.timestamp - b.timestamp || a.index - b.index);
  const messages: ChatMessage[] = [];
  const toolMessages = new Map<string, { messageIndex: number; event: ToolEvent }>();
  const groupedMessages = new Map<string, number>();

  const getMessage = (id: string, role: ChatMessage["role"], timestamp: string | number | undefined, historyType: string): { message: ChatMessage; index: number } => {
    const key = `${role}:${id}`;
    const existingIndex = groupedMessages.get(key);
    if (existingIndex != null) return { message: messages[existingIndex], index: existingIndex };
    const message: ChatMessage = { id, role, content: "", blocks: [], streaming: false, receivedDelta: true, historyType, timestamp };
    const index = messages.push(message) - 1;
    groupedMessages.set(key, index);
    return { message, index };
  };

  sorted.forEach(({ item, index }) => {
    const type = item.blockType;
    const timestamp = item.timestamp;
    const id = item.messageId;
    const source = item as unknown as Record<string, unknown>;

    if (type === "text") {
      const content = String(item?.content || "");
      const attachmentPaths = Array.isArray(item.attachmentPaths) ? item.attachmentPaths : [];
      if (!content && !attachmentPaths.length) return;
      const role = String(item?.role || "").toUpperCase() === "USER" ? "user" : "assistant";
      const target = getMessage(id, role, timestamp, type).message;
      if (role === "user" && item.skillName) target.skillName = item.skillName;
      if (content) {
        target.content = target.content ? `${target.content}\n${content}` : content;
        target.blocks = [...(target.blocks || []), markdownBlock(content, role === "assistant" ? id : undefined)];
      }
      if (role === "user" && attachmentPaths.length) {
        target.attachments = attachmentPaths.map((path, attachmentIndex) => {
          const rawName = path.split("/").pop() || `附件 ${attachmentIndex + 1}`;
          const name = /^[0-9a-f-]{36}_.+/i.test(rawName) ? rawName.slice(37) : rawName;
          const image = /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name);
          return { id: `${id}-attachment-${attachmentIndex}`, name, mediaType: image ? `image/${name.split(".").pop()?.toLowerCase() === "jpg" ? "jpeg" : name.split(".").pop()?.toLowerCase()}` : "application/octet-stream", kind: image ? "image" : "file", path };
        });
      }
      return;
    }

    if (type === "image") {
      const mediaType = item.mediaType || "image/png";
      const data = item.data || "";
      if (!data) return;
      const target = getMessage(id, "user", timestamp, type).message;
      const attachments = [...(target.attachments || [])];
      const pendingImage = attachments.findIndex((attachment) => attachment.kind === "image" && !attachment.previewUrl);
      const imageAttachment: MessageAttachment = pendingImage >= 0
        ? { ...attachments[pendingImage], mediaType, previewUrl: `data:${mediaType};base64,${data}` }
        : { id: `${id}-image-${index}`, name: `图片 ${attachments.filter((attachment) => attachment.kind === "image").length + 1}`, mediaType, kind: "image", previewUrl: `data:${mediaType};base64,${data}` };
      if (pendingImage >= 0) attachments[pendingImage] = imageAttachment;
      else attachments.push(imageAttachment);
      target.attachments = attachments;
      return;
    }

    if (type === "thinking") {
      const content = String(item?.content || "");
      if (!content) return;
      const target = getMessage(id, "assistant", timestamp, type).message;
      target.blocks = [...(target.blocks || []), {
        type: "thinking",
        event: { id: `${id}-thinking-${index}`, roundId: id, content, streaming: false }
      }];
      return;
    }

    if (type === "tool_use") {
      const normalizedEvent = normalizeToolEvent({ type, toolEvent: item as Partial<ToolEvent> });
      // 历史记录不是正在执行的请求。即使后端没有返回对应的 tool_result，
      // 也不能让重新进入会话的卡片永久停留在“运行中”。
      const event = normalizedEvent ? {
        ...normalizedEvent,
        roundId: normalizedEvent.roundId || id,
        status: toolFailed(source, normalizedEvent.output) ? "failed" as const : "success" as const
      } : {
        id: String(item.toolCallId || id),
        roundId: id,
        toolCallId: typeof item.toolCallId === "string" ? item.toolCallId : undefined,
        name: String(item.name || "工具执行"),
        summary: String(item.name || "工具执行"),
        status: "success" as const
      };
      const target = getMessage(id, "assistant", timestamp, type);
      target.message.blocks = upsertToolBlock(target.message.blocks || [], event);
      target.message.toolEvents = toolEventsFromBlocks(target.message.blocks);
      if (event.toolCallId) toolMessages.set(event.toolCallId, { messageIndex: target.index, event });
      return;
    }

    if (type === "tool_result") {
      const callId = typeof item.toolCallId === "string" ? item.toolCallId : "";
      const previous = callId ? toolMessages.get(callId) : undefined;
      if (previous) {
        const nextEvent = mergeToolResult(previous.event, source);
        const target = messages[previous.messageIndex];
        if (target) {
          target.blocks = upsertToolBlock(target.blocks || [], nextEvent);
          target.toolEvents = toolEventsFromBlocks(target.blocks);
        }
        toolMessages.set(callId, { ...previous, event: nextEvent });
        return;
      }
      const event = normalizeToolEvent({ type, toolEvent: item as Partial<ToolEvent> }) || {
        id: callId || id,
        roundId: id,
        toolCallId: callId || undefined,
        name: String(item.name || "工具执行"),
        summary: String(item.name || "工具执行"),
        status: "success" as const,
        output: typeof item.output === "string" ? item.output : undefined
      };
      event.status = toolFailed(source, event.output) ? "failed" : "success";
      const target = getMessage(id, "assistant", timestamp, type).message;
      target.blocks = upsertToolBlock(target.blocks || [], event);
      target.toolEvents = toolEventsFromBlocks(target.blocks);
      return;
    }

  });

  return messages;
}

function extractResultText(result: AgentEvent["result"]): string {
  if (!result) return "";
  if (typeof result === "string") return result;
  if (!Array.isArray(result.content)) return "";
  return result.content.filter((item) => item?.type === "text" && item.text).map((item) => item.text || "").join("");
}

function createMessage(role: ChatMessage["role"], content = ""): ChatMessage {
  return {
    id: createId("message"),
    role,
    content,
    blocks: content ? [markdownBlock(content)] : [],
    streaming: false,
    receivedDelta: false,
    timestamp: Date.now()
  };
}

function createDemoMessages(): ChatMessage[] {
  const thinking: ThinkingEvent = { id: "demo-thinking", roundId: "demo-round-1", content: "我需要先确认项目的构建方式和现有配置，再决定运行哪些检查。", streaming: false };
  const readFile: ToolEvent = { id: "demo-read-file", roundId: "demo-round-1", name: "read_file", summary: "读取项目配置文件", status: "success", input: { path: "pom.xml" }, output: "<project>...</project>", durationMs: 180 };
  const shell: ToolEvent = { id: "demo-shell", roundId: "demo-round-1", name: "shell", summary: "执行 Maven 测试", status: "success", command: "mvn test -pl qcode-core", output: "Tests run: 12, Failures: 0, Errors: 0", durationMs: 2400, exitCode: 0 };
  const running: ToolEvent = { id: "demo-running", roundId: "demo-round-2", name: "write_file", summary: "写入修复后的配置", status: "running", input: { path: "src/main/resources/application.yml" } };
  const failed: ToolEvent = { id: "demo-failed", roundId: "demo-round-2", name: "shell", summary: "执行构建命令", status: "failed", command: "mvn package", error: "Process exited with code 1", durationMs: 1300, exitCode: 1 };
  const changes: MessageBlock = { type: "changes", id: "demo-changes", summary: { additions: 36, deletions: 12, files: [
    { path: "src/main/java/com/qcode/controller/SessionController.java", absolutePath: "D:/zxq/agent/QCode/src/main/java/com/qcode/controller/SessionController.java", type: "modified", additions: 17, deletions: 10 },
    { path: "src/main/java/com/qcode/domain/dto/ConfirmDTO.java", absolutePath: "D:/zxq/agent/QCode/src/main/java/com/qcode/domain/dto/ConfirmDTO.java", type: "modified", additions: 3, deletions: 0 },
    { path: "src/main/java/com/qcode/domain/dto/RenameSessionDTO.java", absolutePath: "D:/zxq/agent/QCode/src/main/java/com/qcode/domain/dto/RenameSessionDTO.java", type: "modified", additions: 1, deletions: 0 },
    { path: "src/main/java/com/qcode/service/impl/ChatServiceImpl.java", absolutePath: "D:/zxq/agent/QCode/src/main/java/com/qcode/service/impl/ChatServiceImpl.java", type: "modified", additions: 11, deletions: 2 },
    { path: "src/main/java/com/qcode/session/SessionManager.java", absolutePath: "D:/zxq/agent/QCode/src/main/java/com/qcode/session/SessionManager.java", type: "modified", additions: 4, deletions: 0 }
  ] } };
  return [
    { ...createMessage("user", "请检查配置并运行测试。"), id: "demo-user" },
    { id: "demo-assistant", role: "assistant", content: "我先读取配置，然后运行测试。", blocks: [markdownBlock("我先读取配置，然后运行测试。", "demo-round-1"), { type: "thinking", event: thinking }, { type: "tool", event: readFile }, { type: "tool", event: shell }, markdownBlock("测试已通过，我继续检查构建结果。", "demo-round-2"), { type: "tool", event: running }, { type: "tool", event: failed }, markdownBlock("检查已经完成：测试通过，但生产构建仍有一处配置错误需要处理。", "demo-round-3"), changes], toolEvents: [readFile, shell, running, failed], streaming: false, receivedDelta: true, activityDurationMs: 123000 }
  ];
}

export interface UseChatResult {
  messages: ChatMessage[];
  sessions: Session[];
  sessionId: string;
  sessionTitle: string;
  isNewChat: boolean;
  isStreaming: boolean;
  isStopping: boolean;
  runningSessionKeys: string[];
  requestRevision: number;
  sessionsLoading: boolean;
  errorMessage: string;
  pendingConfirm: PendingConfirmation | null;
  planMode: boolean;
  setPlanMode: (enabled: boolean) => void;
  loadSessions: () => Promise<Session[]>;
  sendMessage: (text: string, files?: File[], skillName?: string) => Promise<void>;
  confirmTool: (confirmed: boolean) => Promise<void>;
  selectSession: (session: Session, projectId?: string | null) => Promise<void>;
  newChat: () => void;
  stopStreaming: () => Promise<void>;
  projects: Project[];
  projectsLoading: boolean;
  projectError: string;
  activeProjectId: string | null;
  activeProject: Project | null;
  loadProjects: () => Promise<Project[]>;
  createNewProject: (input: CreateProjectInput) => Promise<Project>;
  renameSession: (sessionId: string, title: string, projectId?: string | null) => Promise<void>;
  deleteSession: (sessionId: string, projectId?: string | null) => Promise<void>;
  renameProject: (project: Project, name: string) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  selectProject: (project: Project | null) => void;
}

export function useChat(): UseChatResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionId, setSessionId] = useState(readSessionId);
  const [sessionTitle, setSessionTitle] = useState(DEFAULT_SESSION_TITLE);
  const [isNewChat, setIsNewChat] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [runningSessionKeys, setRunningSessionKeys] = useState<string[]>([]);
  const [requestRevision, setRequestRevision] = useState(0);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirmation | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectError, setProjectError] = useState("");
  const [activeProjectId, setActiveProjectId] = useState<string | null>(readProjectId);
  const [planMode, setPlanModeState] = useState(() => readPlanMode(sessionId, activeProjectId));
  const sessionIdRef = useRef(sessionId);
  const activeProjectIdRef = useRef(activeProjectId);
  const visibleSessionKeyRef = useRef(chatSessionKey(sessionId, activeProjectId));
  const sessionRuntimesRef = useRef(new Map<string, SessionRuntime>());
  const sessionsRequestRef = useRef<Promise<Session[]> | null>(null);
  const titleRefreshTimersRef = useRef(new Set<number>());

  const updateRuntime = useCallback((key: string, updater: (runtime: SessionRuntime) => SessionRuntime): SessionRuntime => {
    const previous = sessionRuntimesRef.current.get(key) || createSessionRuntime();
    const next = updater(previous);
    sessionRuntimesRef.current.set(key, next);
    if (next.isStreaming !== previous.isStreaming) {
      setRunningSessionKeys((current) => {
        if (next.isStreaming) return current.includes(key) ? current : [...current, key];
        return current.filter((item) => item !== key);
      });
    }
    if (visibleSessionKeyRef.current === key) {
      if (next.messages !== previous.messages) setMessages(next.messages);
      if (next.isStreaming !== previous.isStreaming) setIsStreaming(next.isStreaming);
      if (next.isStopping !== previous.isStopping) setIsStopping(next.isStopping);
      if (next.requestRevision !== previous.requestRevision) setRequestRevision(next.requestRevision);
      if (next.errorMessage !== previous.errorMessage) setErrorMessage(next.errorMessage);
      if (next.pendingConfirm !== previous.pendingConfirm) setPendingConfirm(next.pendingConfirm);
    }
    return next;
  }, []);

  const showRuntime = useCallback((key: string): SessionRuntime => {
    const runtime = sessionRuntimesRef.current.get(key) || createSessionRuntime();
    sessionRuntimesRef.current.set(key, runtime);
    visibleSessionKeyRef.current = key;
    setMessages(runtime.messages);
    setIsStreaming(runtime.isStreaming);
    setIsStopping(runtime.isStopping);
    setRequestRevision(runtime.requestRevision);
    setErrorMessage(runtime.errorMessage);
    setPendingConfirm(runtime.pendingConfirm);
    return runtime;
  }, []);

  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
  useEffect(() => { activeProjectIdRef.current = activeProjectId; }, [activeProjectId]);

  const setPlanMode = useCallback((enabled: boolean) => {
    setPlanModeState(enabled);
    persistPlanMode(sessionIdRef.current, activeProjectIdRef.current, enabled);
  }, []);

  const activeProject = projects.find((project) => project.projectId === activeProjectId) || null;

  useEffect(() => {
    const currentSession = sessions.find((session) => session.sessionId === sessionId && (session.projectId || null) === activeProjectId)
      || projects.find((project) => project.projectId === activeProjectId)?.sessions.find((session) => session.sessionId === sessionId);
    if (currentSession) setSessionTitle(currentSession.displayTitle || currentSession.title || currentSession.sessionId || DEFAULT_SESSION_TITLE);
  }, [activeProjectId, projects, sessionId, sessions]);

  const loadProjects = useCallback(async (): Promise<Project[]> => {
    setProjectsLoading(true);
    setProjectError("");
    try {
      const nextProjects = await fetchProjects();
      setProjects(nextProjects);
      const storedId = activeProjectIdRef.current;
      if (storedId && !nextProjects.some((project) => project.projectId === storedId)) {
        setActiveProjectId(null);
        activeProjectIdRef.current = null;
        persistProjectId(null);
      }
      return nextProjects;
    } catch (error) {
      setProjectError(error instanceof Error ? error.message : "项目列表加载失败");
      return [];
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  const createNewProject = useCallback(async (input: CreateProjectInput) => {
    const project = await createProject(input);
    setProjects((current) => [...current.filter((item) => item.projectId !== project.projectId), project]);
    return project;
  }, []);

  const loadSessions = useCallback((): Promise<Session[]> => {
    if (sessionsRequestRef.current) return sessionsRequestRef.current;
    setSessionsLoading(true);
    const request = fetchRecentSessions("", "", 30)
      .then(({ items }) => {
        setSessions(items);
        return items;
      })
      .catch((error) => {
        console.warn("加载会话列表失败：", error);
        // 刷新失败时保留已有列表，避免侧栏瞬间清空和抖动。
        return [];
      })
      .finally(() => {
        if (sessionsRequestRef.current === request) sessionsRequestRef.current = null;
        setSessionsLoading(false);
      });
    sessionsRequestRef.current = request;
    return request;
  }, []);

  const refreshPendingAutoTitle = useCallback((targetSessionId: string, targetProjectId: string | null, initial: Session[]) => {
    const delays = [500, 1500, 3000, 5000];
    const poll = (items: Session[], attempt: number) => {
      const session = items.find((item) => item.sessionId === targetSessionId
        && (item.projectId || null) === targetProjectId);
      const roundCount = Number(session?.roundCount);
      const expectedTitleCount = roundCount === 1 ? 1 : roundCount === 3 ? 2 : 0;
      const titlePending = Boolean(expectedTitleCount && Number(session?.autoTitleCount || 0) < expectedTitleCount);
      // doFinally 在 SSE 结束后才更新轮次；第一次固定复查一次，随后只在标题尚未生成时继续。
      if ((attempt > 0 && session && !titlePending) || attempt >= delays.length) return;
      const timer = window.setTimeout(async () => {
        titleRefreshTimersRef.current.delete(timer);
        poll(await loadSessions(), attempt + 1);
      }, delays[attempt]);
      titleRefreshTimersRef.current.add(timer);
    };
    poll(initial, 0);
  }, [loadSessions]);

  const loadSessionMessages = useCallback(async (targetSessionId: string, targetProjectId?: string | null) => {
    const key = chatSessionKey(targetSessionId, targetProjectId);
    updateRuntime(key, (runtime) => ({ ...runtime, errorMessage: "" }));
    try {
      let nextMessages = normalizeMessages(await fetchSessionMessages(targetSessionId, targetProjectId));
      const lastAssistant = [...nextMessages].reverse().find((message) => message.role === "assistant");
      if (lastAssistant) {
        try {
          const changes = await fetchSessionChanges(targetSessionId, targetProjectId || null);
          nextMessages = withLatestChangeSummary(nextMessages, lastAssistant.id, changeSummaryBlock(lastAssistant.id, changes));
        } catch {
          // 变更摘要是增强信息，加载失败不影响会话历史。
        }
      }
      updateRuntime(key, (runtime) => runtime.isStreaming
        ? runtime
        : { ...runtime, messages: nextMessages, initialized: true });
    } catch (error) {
      updateRuntime(key, (runtime) => runtime.isStreaming
        ? runtime
        : { ...runtime, messages: [], initialized: true, errorMessage: error instanceof Error ? error.message : "加载会话消息失败" });
    }
  }, [updateRuntime]);

  const appendAssistantText = useCallback((key: string, messageId: string, text: string, contentRef: { value: string }, roundId?: string) => {
    if (!text) return;
    contentRef.value += text;
    updateRuntime(key, (runtime) => ({ ...runtime, messages: runtime.messages.map((message) => {
      if (message.id !== messageId) return message;
      const blocks = [...(message.blocks || [])];
      const last = blocks[blocks.length - 1];
      if (last?.type === "markdown" && last.roundId === roundId) blocks[blocks.length - 1] = { ...last, content: last.content + text };
      else blocks.push(markdownBlock(text, roundId));
      return { ...message, content: message.content + text, blocks };
    }) }));
  }, [updateRuntime]);

  const applyTextBlock = useCallback((key: string, messageId: string, block: Extract<MessageBlock, { type: "markdown" }>, delta: string, contentRef: { value: string }) => {
    if (delta) contentRef.value += delta;
    updateRuntime(key, (runtime) => ({ ...runtime, messages: runtime.messages.map((message) => {
      if (message.id !== messageId) return message;
      return {
        ...message,
        content: message.content + delta,
        blocks: upsertMarkdownBlock(message.blocks || [], block),
        receivedDelta: message.receivedDelta || Boolean(delta)
      };
    }) }));
  }, [updateRuntime]);

  const appendToolEvent = useCallback((key: string, messageId: string, event: ToolEvent) => {
    updateRuntime(key, (runtime) => ({ ...runtime, messages: runtime.messages.map((message) => {
      if (message.id !== messageId) return message;
      const blocks = upsertToolBlock(message.blocks || [], event);
      return { ...message, blocks, toolEvents: toolEventsFromBlocks(blocks) };
    }) }));
  }, [updateRuntime]);

  const appendThinkingEvent = useCallback((key: string, messageId: string, event: ThinkingEvent) => {
    updateRuntime(key, (runtime) => ({ ...runtime, messages: runtime.messages.map((message) => {
      if (message.id !== messageId) return message;
      return { ...message, blocks: upsertThinkingBlock(message.blocks || [], event) };
    }) }));
  }, [updateRuntime]);

  const consumeStream = useCallback(async (key: string, response: Response, assistantMessage: ChatMessage, contentRef: { value: string }) => {
    const legacyToolIds = new Map<string, string>();
    const toolStates = new Map<string, ToolEvent>();
    const pendingResultIds: string[] = [];
    const toolAliases = new Map<string, string>();
    const toolNames = new Map<string, string>();
    const thinkingAliases = new Map<string, string>();
    const thinkingStates = new Map<string, ThinkingEvent>();
    const textAliases = new Map<string, string>();
    const textStates = new Map<string, Extract<MessageBlock, { type: "markdown" }>>();
    let activeToolId = "";
    let activeResultId = "";
    let activeThinkingId = "";
    let activeTextId = "";
    let activeRoundId = "";
    const parseInput = (value: unknown): unknown => {
      if (typeof value !== "string") return value;
      try { return JSON.parse(value); } catch { return value; }
    };
    const updateTool = (id: string, patch: Partial<ToolEvent>) => {
      const previous = toolStates.get(id) || { id, name: "工具执行", status: "running" as const };
      const next = { ...previous, ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) } as ToolEvent;
      toolStates.set(id, next);
      appendToolEvent(key, assistantMessage.id, next);
      return next;
    };
    const handleAgentScopeTool = (payload: AgentEvent): boolean => {
      const type = String(payload.type || "").toUpperCase();
      if (!type.startsWith("TOOL_CALL_") && !type.startsWith("TOOL_RESULT_")) return false;
      const source = payload as Record<string, unknown>;
      const explicitId = source.toolCallId || source.callId || source.toolUseId;
      const isResult = type.startsWith("TOOL_RESULT_");
      const name = typeof source.toolCallName === "string" ? source.toolCallName : typeof source.name === "string" ? source.name : undefined;
      const id = typeof explicitId === "string" && explicitId
        ? toolAliases.get(explicitId) || (isResult && !toolStates.has(explicitId) ? pendingResultIds.find((pendingId) => toolNames.get(pendingId) === name) || pendingResultIds[0] : undefined) || explicitId
        : isResult ? activeResultId || pendingResultIds[0] || activeToolId || createId("tool") : activeToolId || createId("tool");
      const rawInput = source.input ?? source.arguments ?? source.toolCallInput;
      const output = typeof source.output === "string" ? source.output : typeof source.result === "string" ? source.result : undefined;
      if (type === "TOOL_CALL_START") {
        if (typeof explicitId === "string" && explicitId) toolAliases.set(explicitId, id);
        if (name) toolNames.set(id, name);
        activeToolId = id;
        if (!pendingResultIds.includes(id)) pendingResultIds.push(id);
        updateTool(id, { toolCallId: id, roundId: typeof source.replyId === "string" ? source.replyId : activeRoundId || undefined, name: name || "工具执行", summary: name ? formatToolSummary(name, source) : undefined, status: "running", input: parseInput(rawInput), workingDirectory: toolWorkingDirectory(source, parseInput(rawInput)) });
      } else if (type === "TOOL_CALL_DELTA") {
        const previous = toolStates.get(id);
        const delta = typeof source.delta === "string" ? source.delta : "";
        const input = delta ? `${typeof previous?.input === "string" ? previous.input : ""}${delta}` : parseInput(rawInput);
        updateTool(id, { name, input, status: "running" });
      } else if (type === "TOOL_CALL_END") {
        const previous = toolStates.get(id);
        const input = parseInput(rawInput ?? previous?.input);
        const command = input && typeof input === "object" && typeof (input as Record<string, unknown>).command === "string" ? (input as Record<string, string>).command : undefined;
        updateTool(id, { name, input, command, workingDirectory: toolWorkingDirectory(source, input), status: "running" });
      } else if (type === "TOOL_RESULT_START") {
        if (typeof explicitId === "string" && explicitId) toolAliases.set(explicitId, id);
        activeResultId = id;
        updateTool(id, { name, status: "running" });
      } else if (type === "TOOL_RESULT_TEXT_DELTA") {
        const previous = toolStates.get(id);
        const delta = typeof source.delta === "string" ? source.delta : "";
        updateTool(id, { name, output: `${previous?.output || ""}${delta}`, status: "running" });
      } else if (type === "TOOL_RESULT_DATA_DELTA") {
        const previous = toolStates.get(id);
        const delta = eventDataText(source.data ?? source.delta);
        updateTool(id, { name, output: `${previous?.output || ""}${delta}`, status: "running" });
      } else if (type === "TOOL_RESULT_END") {
        const previous = toolStates.get(id);
        const finalOutput = output || previous?.output;
        const failed = toolFailed(source, finalOutput);
        updateTool(id, { name, output: finalOutput, error: failed ? toolStateError(source) || previous?.error : undefined, exitCode: toolExitCode(source, finalOutput), status: failed ? "failed" : "success" });
        if (activeToolId === id) activeToolId = "";
        if (activeResultId === id) activeResultId = "";
        const pendingIndex = pendingResultIds.indexOf(id);
        if (pendingIndex >= 0) pendingResultIds.splice(pendingIndex, 1);
      }
      return true;
    };
    const normalizeStreamTool = (payload: AgentEvent, eventName = "") => {
      const source = (payload.toolEvent || payload.tool || payload) as Record<string, unknown>;
      const name = String(source.name || source.toolName || eventName || "工具执行");
      const stableId = source.id || source.toolCallId;
      const status = statusFromSource(String(payload.type || eventName), source);
      const fallbackId = stableId ? undefined : (legacyToolIds.get(name) || createId("legacy-tool"));
      if (!stableId && status === "running") legacyToolIds.set(name, fallbackId as string);
      if (!stableId && status !== "running") legacyToolIds.delete(name);
      const event = normalizeToolEvent(payload, fallbackId, String(payload.type || eventName));
      if (event && !event.roundId) event.roundId = payload.replyId || activeRoundId || undefined;
      return event;
    };
    const handleThinking = (payload: AgentEvent, eventName = ""): boolean => {
      const type = String(payload.type || eventName).toUpperCase();
      if (!type.startsWith("THINKING_BLOCK_")) return false;
      const source = payload as Record<string, unknown>;
      const explicitId = source.blockId || source.id;
      const externalId = typeof explicitId === "string" && explicitId ? explicitId : "";
      const id = type === "THINKING_BLOCK_START"
        ? createId("thinking")
        : (externalId ? thinkingAliases.get(externalId) : undefined) || activeThinkingId || createId("thinking");
      if (type === "THINKING_BLOCK_START") {
        if (externalId) thinkingAliases.set(externalId, id);
        activeThinkingId = id;
        const next = { id, roundId: typeof source.replyId === "string" ? source.replyId : activeRoundId || undefined, content: "", streaming: true };
        thinkingStates.set(id, next);
        appendThinkingEvent(key, assistantMessage.id, next);
      } else if (type === "THINKING_BLOCK_DELTA") {
        activeThinkingId = id;
        const delta = typeof source.delta === "string" ? source.delta : "";
        const next = { id, roundId: thinkingStates.get(id)?.roundId || (typeof source.replyId === "string" ? source.replyId : activeRoundId || undefined), content: `${thinkingStates.get(id)?.content || ""}${delta}`, streaming: true };
        thinkingStates.set(id, next);
        appendThinkingEvent(key, assistantMessage.id, next);
      } else if (type === "THINKING_BLOCK_END") {
        const next = { id, roundId: thinkingStates.get(id)?.roundId || (typeof source.replyId === "string" ? source.replyId : activeRoundId || undefined), content: thinkingStates.get(id)?.content || "", streaming: false };
        thinkingStates.set(id, next);
        appendThinkingEvent(key, assistantMessage.id, next);
        if (activeThinkingId === id) activeThinkingId = "";
      }
      return true;
    };
    const handleTextBlock = (payload: AgentEvent, eventName = ""): boolean => {
      const type = String(payload.type || eventName).toUpperCase();
      if (!type.startsWith("TEXT_BLOCK_")) return false;
      const source = payload as Record<string, unknown>;
      const explicitId = source.blockId || source.id;
      const externalId = typeof explicitId === "string" && explicitId ? explicitId : "";
      const id = type === "TEXT_BLOCK_START"
        ? createId("text")
        : (externalId ? textAliases.get(externalId) : undefined) || activeTextId || createId("text");
      const roundId = typeof source.replyId === "string" ? source.replyId : activeRoundId || undefined;

      if (type === "TEXT_BLOCK_START") {
        if (externalId) textAliases.set(externalId, id);
        activeTextId = id;
        const next = { type: "markdown" as const, id, roundId, content: "", streaming: true };
        textStates.set(id, next);
        applyTextBlock(key, assistantMessage.id, next, "", contentRef);
      } else if (type === "TEXT_BLOCK_DELTA") {
        activeTextId = id;
        const delta = typeof source.delta === "string" ? source.delta : "";
        const previous = textStates.get(id);
        const next = { type: "markdown" as const, id, roundId: previous?.roundId || roundId, content: `${previous?.content || ""}${delta}`, streaming: true };
        textStates.set(id, next);
        applyTextBlock(key, assistantMessage.id, next, delta, contentRef);
      } else if (type === "TEXT_BLOCK_END") {
        const previous = textStates.get(id);
        const next = { type: "markdown" as const, id, roundId: previous?.roundId || roundId, content: previous?.content || "", streaming: false };
        textStates.set(id, next);
        applyTextBlock(key, assistantMessage.id, next, "", contentRef);
        if (activeTextId === id) activeTextId = "";
      }
      return true;
    };
    const markToolCalls = (calls: unknown, status: ToolEvent["status"], error?: string) => {
      if (!Array.isArray(calls)) return;
      calls.forEach((value) => {
        if (!value || typeof value !== "object") return;
        const call = value as Record<string, unknown>;
        const rawId = call.id || call.toolCallId || call.toolUseId;
        const id = typeof rawId === "string" && rawId ? toolAliases.get(rawId) || rawId : createId("tool");
        const name = String(call.name || call.toolCallName || "工具执行");
        const input = call.input ?? call.arguments;
        updateTool(id, { toolCallId: id, roundId: activeRoundId || undefined, name, summary: formatToolSummary(name, call), input, command: input && typeof input === "object" && typeof (input as Record<string, unknown>).command === "string" ? String((input as Record<string, unknown>).command) : undefined, workingDirectory: toolWorkingDirectory(call, input), status, error });
      });
    };
    const handleControlEvent = (payload: AgentEvent): boolean => {
      const type = String(payload.type || "").toUpperCase();
      const source = payload as Record<string, unknown>;
      if (type === "HINT_BLOCK") {
        const hint = typeof source.hint === "string" ? source.hint : "";
        if (hint) appendThinkingEvent(key, assistantMessage.id, { id: String(source.blockId || source.id || createId("hint")), roundId: typeof source.replyId === "string" ? source.replyId : activeRoundId || undefined, content: hint, streaming: false });
        return true;
      }
      if (type === "REQUIRE_USER_CONFIRM" || type === "REQUIRE_USER_CONFIRM_EVENT") {
        const calls = Array.isArray(payload.toolCalls) ? payload.toolCalls : [];
        markToolCalls(calls, "approval");
        updateRuntime(key, (runtime) => ({ ...runtime, pendingConfirm: { toolCalls: calls, messageId: assistantMessage.id } }));
        return true;
      }
      if (type === "REQUIRE_EXTERNAL_EXECUTION") {
        markToolCalls(source.toolCalls, "failed", "当前前端未配置外部工具执行器");
        updateRuntime(key, (runtime) => ({ ...runtime, errorMessage: "Agent 请求由前端执行外部工具，但当前客户端尚未配置外部执行器。" }));
        return true;
      }
      if (type === "USER_CONFIRM_RESULT") {
        const results = Array.isArray(source.confirmResults) ? source.confirmResults : [];
        results.forEach((value) => {
          if (!value || typeof value !== "object") return;
          const result = value as Record<string, unknown>;
          markToolCalls(result.toolCall ? [result.toolCall] : [], result.confirmed === true ? "running" : "failed", result.confirmed === true ? undefined : "工具调用已被拒绝");
        });
        return true;
      }
      if (type === "EXTERNAL_EXECUTION_RESULT") {
        const results = Array.isArray(source.toolResults) ? source.toolResults : [];
        results.forEach((value) => {
          if (!value || typeof value !== "object") return;
          const result = value as Record<string, unknown>;
          const rawId = result.id || result.toolCallId;
          const id = typeof rawId === "string" && rawId ? toolAliases.get(rawId) || rawId : createId("tool");
          const output = eventDataText(result.output);
          const failed = toolFailed(result, output);
          updateTool(id, { name: typeof result.name === "string" ? result.name : undefined, output, error: failed ? toolStateError(result) : undefined, status: failed ? "failed" : "success" });
        });
        return true;
      }
      if (type === "ALL_TOOLS_DENIED") {
        markToolCalls(source.deniedToolCalls, "failed", "工具调用已被拒绝");
        return true;
      }
      if (type === "EXCEED_MAX_ITERS") {
        updateRuntime(key, (runtime) => ({ ...runtime, errorMessage: `Agent 已达到最大迭代次数（${String(source.maxIters || "未知")}）。` }));
        return true;
      }
      if (type === "REQUEST_STOP") {
        const reason = String(source.generateReason || "").toUpperCase();
        if (reason === "INTERRUPTED" || reason === "MAX_ITERATIONS") updateRuntime(key, (runtime) => ({ ...runtime, errorMessage: typeof source.reason === "string" && source.reason ? source.reason : "Agent 执行已停止。" }));
        return true;
      }
      return false;
    };

    await readEventStream(
      response,
      (eventName, data) => {
        const upperName = eventName.toUpperCase();
        if (upperName.startsWith("TEXT_BLOCK_")) {
          let payload: AgentEvent = { type: eventName, delta: data };
          try {
            const parsed = JSON.parse(data) as Record<string, unknown>;
            payload = { ...parsed, type: String(parsed.type || eventName) } as AgentEvent;
          } catch {
            // Legacy text block deltas may contain plain text.
          }
          handleTextBlock(payload, eventName);
        } else if (upperName.includes("THINKING")) {
          let payload: AgentEvent = { type: eventName, delta: data };
          try {
            const parsed = JSON.parse(data) as Record<string, unknown>;
            payload = { ...parsed, type: String(parsed.type || eventName) } as AgentEvent;
          } catch {
            // Legacy thinking events may contain the delta as plain text.
          }
          handleThinking(payload, eventName);
        } else if (upperName === "MESSAGE") {
          appendAssistantText(key, assistantMessage.id, data, contentRef, activeRoundId || undefined);
        } else if (upperName.includes("TOOL") || upperName.includes("COMMAND")) {
          let payload: AgentEvent = { type: eventName, toolEvent: { name: eventName, output: data } };
          try {
            const parsed = JSON.parse(data) as Record<string, unknown>;
            payload = { ...parsed, type: String(parsed.type || eventName) } as AgentEvent;
          } catch {
            // Legacy tool events may contain plain text output.
          }
          if (!handleAgentScopeTool(payload)) {
            const toolEvent = normalizeStreamTool(payload, eventName);
            if (toolEvent) appendToolEvent(key, assistantMessage.id, toolEvent);
          }
        } else if (upperName === "REQUIRE_USER_CONFIRM") {
          try {
            const calls = JSON.parse(data) as ToolCall[];
            markToolCalls(calls, "approval");
            updateRuntime(key, (runtime) => ({ ...runtime, pendingConfirm: { toolCalls: calls, messageId: assistantMessage.id } }));
          } catch {
            const calls = [{ name: "工具调用", input: data }];
            markToolCalls(calls, "approval");
            updateRuntime(key, (runtime) => ({ ...runtime, pendingConfirm: { toolCalls: calls, messageId: assistantMessage.id } }));
          }
        } else if (upperName === "ERROR") {
          updateRuntime(key, (runtime) => ({ ...runtime, errorMessage: data || "服务端返回了错误" }));
        }
      },
      (agentEvent) => {
        if (typeof agentEvent.replyId === "string" && agentEvent.replyId) activeRoundId = agentEvent.replyId;
        const isText = handleTextBlock(agentEvent);
        const isThinking = !isText && handleThinking(agentEvent);
        const isControl = !isText && !isThinking && handleControlEvent(agentEvent);
        if (!isText && !isThinking && !isControl && !handleAgentScopeTool(agentEvent)) {
          const toolEvent = normalizeStreamTool(agentEvent);
          if (toolEvent) appendToolEvent(key, assistantMessage.id, toolEvent);
        }
        if (agentEvent.type === "AGENT_RESULT" && !contentRef.value) {
          appendAssistantText(key, assistantMessage.id, extractResultText(agentEvent.result), contentRef, activeRoundId || undefined);
        }
      }
    );
  }, [appendAssistantText, appendThinkingEvent, appendToolEvent, applyTextBlock, updateRuntime]);

  const finishRequest = useCallback(async (key: string, targetSessionId: string, targetProjectId: string | null, controller: AbortController, messageId: string) => {
    const finishedAt = Date.now();
    updateRuntime(key, (runtime) => ({
      ...runtime,
      messages: runtime.messages.map((message) => message.id === messageId ? {
        ...message,
        streaming: false,
        activityDurationMs: (message.activityDurationMs || 0) + (message.activityStartedAt != null ? Math.max(0, finishedAt - message.activityStartedAt) : 0),
        activityStartedAt: undefined
      } : message),
      isStreaming: runtime.controller === controller ? false : runtime.isStreaming,
      isStopping: runtime.controller === controller ? false : runtime.isStopping,
      controller: runtime.controller === controller ? null : runtime.controller,
      requestRevision: runtime.requestRevision + 1
    }));
    const loadChanges = fetchSessionChanges(targetSessionId, targetProjectId)
      .then((changes) => updateRuntime(key, (runtime) => ({ ...runtime, messages: withLatestChangeSummary(runtime.messages, messageId, changeSummaryBlock(messageId, changes)) })))
      .catch(() => { /* 变更摘要失败不影响对话完成。 */ });
    const [latestSessions] = await Promise.all([loadSessions(), loadChanges]);
    refreshPendingAutoTitle(targetSessionId, targetProjectId, latestSessions);
  }, [loadSessions, refreshPendingAutoTitle, updateRuntime]);

  const sendMessage = useCallback(async (text: string, files: File[] = [], skillName?: string) => {
    const value = text.trim();
    if (!value && !files.length) return;
    const targetSessionId = sessionIdRef.current;
    const targetProjectId = activeProjectIdRef.current;
    const key = chatSessionKey(targetSessionId, targetProjectId);
    const runtime = sessionRuntimesRef.current.get(key) || createSessionRuntime();
    if (runtime.isStreaming || runtime.pendingConfirm) return;
    setIsNewChat(false);
    persistSessionId(targetSessionId);
    const userMessage = createMessage("user", value);
    userMessage.skillName = skillName;
    userMessage.attachments = files.map((file, index) => ({
      id: `${userMessage.id}-attachment-${index}`,
      name: file.name,
      mediaType: file.type || "application/octet-stream",
      size: file.size,
      kind: file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file.name) ? "image" : "file",
      previewUrl: file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file.name) ? URL.createObjectURL(file) : undefined
    }));
    const assistantMessage = createMessage("assistant");
    assistantMessage.streaming = true;
    assistantMessage.activityStartedAt = Date.now();
    const controller = new AbortController();
    updateRuntime(key, (current) => ({
      ...current,
      messages: [...withLatestChangeSummary(current.messages, "", null), userMessage, assistantMessage],
      initialized: true,
      isStreaming: true,
      isStopping: false,
      errorMessage: "",
      pendingConfirm: null,
      controller
    }));
    const contentRef = { value: "" };
    const targetPlanMode = readPlanMode(targetSessionId, targetProjectId);

    try {
      const response = await openChatStream(value, targetSessionId, controller.signal, targetProjectId, targetPlanMode, skillName, files);
      if (!response.ok) throw new Error(`请求失败（${response.status}）`);
      // 会话在服务端建立后立即刷新侧栏，切到其他项目时仍能从侧栏返回这个运行中的会话。
      void loadSessions();
      await consumeStream(key, response, assistantMessage, contentRef);
      if (!contentRef.value && !sessionRuntimesRef.current.get(key)?.pendingConfirm) appendAssistantText(key, assistantMessage.id, "服务端没有返回消息。", contentRef);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        updateRuntime(key, (current) => ({ ...current, errorMessage: error instanceof Error ? error.message : "聊天请求失败，请检查后端服务是否已启动。" }));
        if (!contentRef.value) appendAssistantText(key, assistantMessage.id, "暂时无法连接到 QCode 服务。", contentRef);
      }
    } finally {
      await finishRequest(key, targetSessionId, targetProjectId, controller, assistantMessage.id);
    }
  }, [appendAssistantText, consumeStream, finishRequest, loadSessions, updateRuntime]);

  const confirmTool = useCallback(async (confirmed: boolean) => {
    const targetSessionId = sessionIdRef.current;
    const targetProjectId = activeProjectIdRef.current;
    const key = chatSessionKey(targetSessionId, targetProjectId);
    const runtime = sessionRuntimesRef.current.get(key);
    if (!runtime?.pendingConfirm || runtime.isStreaming) return;
    const confirmation = runtime.pendingConfirm;
    const assistantMessage = runtime.messages.find((message) => message.id === confirmation.messageId) || [...runtime.messages].reverse().find((message) => message.role === "assistant");
    if (!assistantMessage) return;
    const resumedAt = Date.now();
    const controller = new AbortController();
    updateRuntime(key, (current) => ({
      ...current,
      messages: withLatestChangeSummary(current.messages, "", null)
        .map((message) => message.id === assistantMessage.id ? { ...message, streaming: true, activityStartedAt: resumedAt } : message),
      pendingConfirm: null,
      errorMessage: "",
      isStreaming: true,
      isStopping: false,
      controller
    }));
    const contentRef = { value: assistantMessage.content };
    const exitsPlanMode = confirmed && confirmation.toolCalls.some((call) => String(call.name || call.toolCallName || "").toLowerCase() === "plan_exit");
    try {
      const response = await confirmChatStream(targetSessionId, targetProjectId, confirmed, confirmation.toolCalls, controller.signal);
      if (!response.ok) throw new Error(`确认失败（${response.status}）`);
      if (exitsPlanMode) {
        persistPlanMode(targetSessionId, targetProjectId, false);
        if (visibleSessionKeyRef.current === key) setPlanModeState(false);
      }
      await consumeStream(key, response, assistantMessage, contentRef);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) updateRuntime(key, (current) => ({ ...current, errorMessage: error instanceof Error ? error.message : "工具确认失败" }));
    } finally {
      await finishRequest(key, targetSessionId, targetProjectId, controller, assistantMessage.id);
    }
  }, [consumeStream, finishRequest, updateRuntime]);

  const newChat = useCallback(() => {
    const nextSessionId = createSessionId();
    const targetProjectId = activeProjectIdRef.current;
    setSessionId(nextSessionId);
    sessionIdRef.current = nextSessionId;
    persistSessionId(nextSessionId);
    showRuntime(chatSessionKey(nextSessionId, targetProjectId));
    setSessionTitle(DEFAULT_SESSION_TITLE);
    setIsNewChat(true);
    setPlanModeState(false);
  }, [showRuntime]);

  const selectSession = useCallback(async (session: Session, projectId?: string | null) => {
    const targetProjectId = projectId !== undefined ? projectId : session.projectId || null;
    const key = chatSessionKey(session.sessionId, targetProjectId);
    setSessionId(session.sessionId);
    sessionIdRef.current = session.sessionId;
    persistSessionId(session.sessionId);
    setSessionTitle(session.displayTitle || session.title || session.sessionId);
    setIsNewChat(false);
    setActiveProjectId(targetProjectId);
    activeProjectIdRef.current = targetProjectId;
    persistProjectId(targetProjectId);
    const runtime = showRuntime(key);
    setPlanModeState(readPlanMode(session.sessionId, targetProjectId));
    if (!runtime.initialized && !runtime.isStreaming) await loadSessionMessages(session.sessionId, targetProjectId);
  }, [loadSessionMessages, showRuntime]);

  const selectProject = useCallback((project: Project | null) => {
    const nextSessionId = createSessionId();
    const targetProjectId = project?.projectId || null;
    setSessionId(nextSessionId);
    sessionIdRef.current = nextSessionId;
    persistSessionId(nextSessionId);
    setActiveProjectId(targetProjectId);
    activeProjectIdRef.current = targetProjectId;
    persistProjectId(targetProjectId);
    showRuntime(chatSessionKey(nextSessionId, targetProjectId));
    setSessionTitle(DEFAULT_SESSION_TITLE);
    setIsNewChat(true);
    setPlanModeState(false);
  }, [showRuntime]);

  const renameSessionAction = useCallback(async (targetSessionId: string, title: string, projectId?: string | null) => {
    const renamed = await renameSession(targetSessionId, title, projectId);
    if (sessionIdRef.current === targetSessionId && activeProjectIdRef.current === (projectId || null)) setSessionTitle(title);
    setProjects((current) => current.map((project) => project.projectId === projectId ? {
      ...project,
      sessions: project.sessions.map((session) => session.sessionId === targetSessionId ? { ...session, ...renamed } : session)
    } : project));
    await loadSessions();
  }, [loadSessions]);

  const deleteSessionAction = useCallback(async (targetSessionId: string, projectId?: string | null) => {
    await removeSession(targetSessionId, projectId);
    sessionRuntimesRef.current.get(chatSessionKey(targetSessionId, projectId))?.controller?.abort();
    persistPlanMode(targetSessionId, projectId, false);
    if (sessionIdRef.current === targetSessionId && activeProjectIdRef.current === (projectId || null)) newChat();
    setProjects((current) => current.map((project) => project.projectId === projectId
      ? { ...project, sessions: project.sessions.filter((session) => session.sessionId !== targetSessionId) }
      : project));
    await loadSessions();
  }, [loadSessions, newChat]);

  const renameProjectAction = useCallback(async (project: Project, name: string) => {
    await updateProject(project.projectId, { ...project, name });
    await loadProjects();
  }, [loadProjects]);

  const deleteProjectAction = useCallback(async (projectId: string) => {
    await removeProject(projectId);
    sessionRuntimesRef.current.forEach((runtime, key) => {
      if (key.startsWith(`${projectId}:`)) runtime.controller?.abort();
    });
    if (activeProjectIdRef.current === projectId) selectProject(null);
    await loadProjects();
  }, [loadProjects, selectProject]);

  const stopStreaming = useCallback(async () => {
    const targetSessionId = sessionIdRef.current;
    const targetProjectId = activeProjectIdRef.current;
    const key = chatSessionKey(targetSessionId, targetProjectId);
    const runtime = sessionRuntimesRef.current.get(key);
    if (!runtime || ((!runtime.isStreaming && !runtime.pendingConfirm) || runtime.isStopping)) return;
    const controller = runtime.controller;
    updateRuntime(key, (current) => ({ ...current, isStopping: true, errorMessage: "" }));
    try {
      await stopChat(targetSessionId, targetProjectId);
      updateRuntime(key, (current) => ({ ...current, pendingConfirm: null }));
      // 服务端接受中断后再关闭本地 SSE；原请求的 finally 负责统一收尾。
      if (controller && sessionRuntimesRef.current.get(key)?.controller === controller) controller.abort();
      else {
        updateRuntime(key, (current) => ({ ...current, isStreaming: false, isStopping: false, controller: null }));
      }
    } catch (error) {
      updateRuntime(key, (current) => ({ ...current, isStopping: false, errorMessage: error instanceof Error ? error.message : "停止会话失败" }));
    }
  }, [updateRuntime]);

  useEffect(() => {
    let cancelled = false;
    const isDemo = import.meta.env.DEV && typeof window !== "undefined" && new URLSearchParams(window.location.search).has("tool-demo");
    const initialize = async () => {
      if (isDemo) {
        setSessionTitle("工具折叠演示");
        setIsNewChat(false);
        updateRuntime(visibleSessionKeyRef.current, (runtime) => ({ ...runtime, messages: createDemoMessages(), initialized: true }));
        return;
      }
      const [currentProjects, currentSessions] = await Promise.all([loadProjects(), loadSessions()]);
      if (!cancelled) {
        const currentProject = currentProjects.find((project) => project.projectId === activeProjectIdRef.current);
        const currentSession = currentSessions.find((session) => session.sessionId === sessionIdRef.current && (session.projectId || null) === activeProjectIdRef.current)
          || currentProject?.sessions.find((session) => session.sessionId === sessionIdRef.current);
        setIsNewChat(!currentSession);
        if (currentSession) setSessionTitle(currentSession.displayTitle || currentSession.title || currentSession.sessionId || DEFAULT_SESSION_TITLE);
        const projectHasSession = currentProject?.sessions.some((session) => session.sessionId === sessionIdRef.current);
        if (currentSessions.some((session) => session.sessionId === sessionIdRef.current && (session.projectId || null) === activeProjectIdRef.current) || projectHasSession) {
          await loadSessionMessages(sessionIdRef.current, activeProjectIdRef.current);
        }
      }
    };
    void initialize();
    return () => {
      cancelled = true;
      sessionRuntimesRef.current.forEach((runtime) => runtime.controller?.abort());
      titleRefreshTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      titleRefreshTimersRef.current.clear();
    };
  }, [loadProjects, loadSessionMessages, loadSessions, updateRuntime]);

  return { messages, sessions, sessionId, sessionTitle, isNewChat, isStreaming, isStopping, runningSessionKeys, requestRevision, sessionsLoading, errorMessage, pendingConfirm, planMode, setPlanMode, loadSessions, sendMessage, confirmTool, selectSession, newChat, stopStreaming, selectProject, projects, projectsLoading, projectError, activeProjectId, activeProject, loadProjects, createNewProject, renameSession: renameSessionAction, deleteSession: deleteSessionAction, renameProject: renameProjectAction, deleteProject: deleteProjectAction };
}
