export type MessageRole = "user" | "assistant";

export type ToolEventStatus = "queued" | "running" | "success" | "failed" | "approval";

export interface ToolEvent {
  id: string;
  roundId?: string;
  toolCallId?: string;
  name: string;
  summary?: string;
  status: ToolEventStatus;
  command?: string;
  workingDirectory?: string;
  input?: unknown;
  output?: string;
  error?: string;
  durationMs?: number;
  exitCode?: number;
  startedAt?: string | number;
  endedAt?: string | number;
  expandable?: boolean;
}

export interface ChangeSummaryFile {
  path: string;
  absolutePath: string;
  type: "added" | "modified" | "deleted";
  additions: number;
  deletions: number;
}

export interface ChangeSummary {
  files: ChangeSummaryFile[];
  additions: number;
  deletions: number;
}

export interface ThinkingEvent {
  id: string;
  roundId?: string;
  content: string;
  streaming: boolean;
}

export type MessageBlock =
  | { type: "markdown"; id: string; roundId?: string; content: string; streaming?: boolean }
  | { type: "thinking"; event: ThinkingEvent }
  | { type: "tool"; event: ToolEvent }
  | { type: "changes"; id: string; summary: ChangeSummary }
  | { type: "approval"; toolCalls: ToolCall[] }
  | { type: "result"; content: string };

export interface Session {
  sessionId: string;
  title?: string;
  displayTitle: string;
  updatedAt?: string;
  projectId?: string | null;
  projectName?: string;
  [key: string]: unknown;
}

export interface ProjectSession {
  sessionId?: string;
  title?: string;
  displayTitle?: string;
  updatedAt?: string;
  projectId?: string | null;
  projectName?: string;
  [key: string]: unknown;
}

export interface Project {
  projectId: string;
  name: string;
  rootPath?: string;
  additionalRoots?: string[];
  sessions: ProjectSession[];
  createdAt?: string;
  updatedAt?: string;
  lastOpenedAt?: string;
}

export interface PageResult<T> {
  items: T[];
  nextCursor?: string | null;
  hasMore: boolean;
}

export interface CreateProjectInput {
  name: string;
  rootPath: string;
  additionalRoots: string[];
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  skillName?: string;
  attachments?: MessageAttachment[];
  blocks?: MessageBlock[];
  toolEvents?: ToolEvent[];
  streaming: boolean;
  receivedDelta: boolean;
  historyType?: string;
  timestamp?: string | number;
  activityStartedAt?: number;
  activityDurationMs?: number;
}

export interface MessageAttachment {
  id: string;
  name: string;
  mediaType: string;
  size?: number;
  kind: "image" | "file";
  previewUrl?: string;
  path?: string;
}

export interface SessionMessage {
  blockType: "text" | "image" | "thinking" | "tool_use" | "tool_result";
  messageId: string;
  role: "USER" | "ASSISTANT" | "TOOL";
  timestamp: string;
  content: string | null;
  skillName?: string | null;
  attachmentPaths?: string[] | null;
  mediaType?: string | null;
  data?: string | null;
  toolCallId: string | null;
  name: string | null;
  input: Record<string, unknown> | null;
  output: string | null;
  state: string | null;
}

export interface ToolCall {
  name?: string;
  input?: unknown;
  [key: string]: unknown;
}

export interface PendingConfirmation {
  toolCalls: ToolCall[];
  messageId: string;
}

export interface AgentContentItem {
  type?: string;
  text?: string;
  [key: string]: unknown;
}

export interface AgentEvent {
  type?: string;
  replyId?: string;
  blockId?: string;
  delta?: string;
  result?: { content?: AgentContentItem[] } | string;
  toolCalls?: ToolCall[];
  tool?: Partial<ToolEvent>;
  toolEvent?: Partial<ToolEvent>;
  [key: string]: unknown;
}

export interface FilePreview {
  absolutePath: string;
  relativePath: string;
  rootName: string;
  language: string;
  content: string;
  requestedPath?: string;
}

export interface ChatApiConfig {
  baseUrl: string;
  userId: string;
}

export interface ModelProvider {
  code: string;
  name: string;
  defaultBaseUrl: string;
}

export interface ModelConfig {
  id: string;
  modelName: string;
  provider: string;
  baseUrl?: string;
  active: boolean;
}

export type PermissionMode = "AUTO" | "MANUAL";

export interface PermissionVO {
  currentMode: PermissionMode;
  description: string;
  detail: string;
}

export type StreamEventHandler = (eventName: string, data: string) => void;
export type AgentEventHandler = (event: AgentEvent) => void;

export interface ChatState {
  messages: ChatMessage[];
  sessions: Session[];
  sessionId: string;
  sessionTitle: string;
  isStreaming: boolean;
  sessionsLoading: boolean;
  errorMessage: string;
  pendingConfirm: PendingConfirmation | null;
}
