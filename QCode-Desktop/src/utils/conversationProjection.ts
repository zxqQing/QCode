import type { ChangeSummary, ChatMessage, MessageBlock, ThinkingEvent, ToolEvent } from "../types/chat";

export type ActivityEntry =
  | { type: "thinking"; event: ThinkingEvent }
  | { type: "tool"; event: ToolEvent };

export interface ActivitySegment {
  kind: "activity";
  id: string;
  entries: ActivityEntry[];
  active: boolean;
}

export type TraceItem =
  | { kind: "markdown"; id: string; content: string }
  | ActivitySegment;

export type FinalItem =
  | { kind: "markdown"; id: string; content: string }
  | { kind: "changes"; id: string; summary: ChangeSummary };

export interface ConversationTurnView {
  id: string;
  userMessage: ChatMessage;
  traceItems: TraceItem[];
  finalItems: FinalItem[];
  active: boolean;
  durationMs?: number;
  startedAt?: number;
}

function fallbackBlocks(message: ChatMessage): MessageBlock[] {
  return [
    ...(message.content
      ? [{ type: "markdown" as const, id: `${message.id}-markdown`, roundId: message.id, content: message.content }]
      : []),
    ...(message.toolEvents || []).map((event) => ({ type: "tool" as const, event }))
  ];
}

function internalEntry(block: MessageBlock): ActivityEntry | null {
  if (block.type === "thinking" || block.type === "tool") return block;
  return null;
}

function projectAssistantTurn(turnId: string, messages: ChatMessage[]): Omit<ConversationTurnView, "id" | "userMessage"> {
  const blocks = messages.flatMap((message) => message.blocks?.length ? message.blocks : fallbackBlocks(message));
  const active = messages.some((message) => message.streaming);
  const lastInternalIndex = blocks.reduce(
    (lastIndex, block, index) => block.type === "thinking" || block.type === "tool" ? index : lastIndex,
    -1
  );
  const lastMarkdownIndex = blocks.reduce(
    (lastIndex, block, index) => block.type === "markdown" && block.content.trim() ? index : lastIndex,
    -1
  );
  // Streaming text belongs to the task trace. Once the turn completes, only
  // the final text emitted after the last internal activity becomes the
  // always-visible answer. A pre-tool introduction is never promoted to a
  // completion summary when the provider did not emit one.
  const finalMarkdownIndex = active
    ? -1
    : lastInternalIndex < 0 || lastMarkdownIndex > lastInternalIndex
      ? lastMarkdownIndex
      : -1;
  const traceItems: TraceItem[] = [];
  const finalItems: FinalItem[] = [];

  let segmentEntries: ActivityEntry[] = [];
  let latestTraceKind: "activity" | "text" | null = null;
  const flushSegment = () => {
    if (!segmentEntries.length) return;
    const first = segmentEntries[0];
    const entryId = first.event.id;
    traceItems.push({ kind: "activity", id: `${turnId}-${entryId}`, entries: segmentEntries, active: false });
    segmentEntries = [];
  };

  blocks.forEach((block, index) => {
    if (block.type === "changes") {
      flushSegment();
      finalItems.push({ kind: "changes", id: block.id, summary: block.summary });
      return;
    }

    if (block.type === "markdown") {
      // Every distinct text block is an activity boundary, including an empty
      // TEXT_BLOCK_START before its first delta arrives.
      flushSegment();
      latestTraceKind = "text";
      if (!block.content) return;
      if (index === finalMarkdownIndex) finalItems.push({ kind: "markdown", id: block.id, content: block.content });
      else traceItems.push({ kind: "markdown", id: block.id, content: block.content });
      return;
    }

    const entry = internalEntry(block);
    if (entry) {
      segmentEntries.push(entry);
      latestTraceKind = "activity";
    }
  });
  flushSegment();

  if (active && latestTraceKind === "activity") {
    const lastActivityIndex = traceItems.reduce((lastIndex, item, index) => item.kind === "activity" ? index : lastIndex, -1);
    if (lastActivityIndex >= 0) {
      const item = traceItems[lastActivityIndex];
      if (item.kind === "activity") traceItems[lastActivityIndex] = { ...item, active: true };
    }
  }

  const durationMs = messages.reduce((total, message) => total + (message.activityDurationMs || 0), 0)
    || traceItems.reduce((total, item) => total + (item.kind === "activity"
      ? item.entries.reduce((entryTotal, entry) => entryTotal + (entry.type === "tool" ? entry.event.durationMs || 0 : 0), 0)
      : 0), 0)
    || undefined;
  const startedAt = messages.find((message) => message.streaming && message.activityStartedAt != null)?.activityStartedAt;

  return { traceItems, finalItems, active, durationMs, startedAt };
}

export function buildConversationTurnViews(messages: ChatMessage[]): ConversationTurnView[] {
  const turns: ConversationTurnView[] = [];
  let userMessage: ChatMessage | null = null;
  let assistantMessages: ChatMessage[] = [];

  const flushTurn = () => {
    if (!userMessage) return;
    turns.push({
      id: userMessage.id,
      userMessage,
      ...projectAssistantTurn(userMessage.id, assistantMessages)
    });
    assistantMessages = [];
  };

  messages.forEach((message) => {
    if (message.role === "user") {
      flushTurn();
      userMessage = message;
    } else if (userMessage) {
      assistantMessages.push(message);
    }
  });
  flushTurn();
  return turns;
}
