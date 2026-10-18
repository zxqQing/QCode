import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FC, type MouseEvent } from "react";
import { renderMarkdown, renderMessage } from "../utils/markdown";
import { buildConversationTurnViews, type ActivitySegment } from "../utils/conversationProjection";
import ActivityGroup from "./ActivityGroup";
import ChangeSummaryCard from "./ChangeSummaryCard";
import TaskActivityGroup from "./TaskActivityGroup";
import type { ChatMessage, MessageAttachment, MessageBlock, PendingConfirmation, ThinkingEvent, ToolEvent } from "../types/chat";

interface ChatMessagesProps {
  messages: ChatMessage[];
  pendingConfirm: PendingConfirmation | null;
  errorMessage: string;
  onConfirm: (confirmed: boolean) => void;
  onOpenFile: (path: string) => void;
  onOpenChanges: () => void;
}

interface ConversationTurn {
  id: string;
  userMessage: string;
  summary: string;
  streaming: boolean;
}

const MIN_NAVIGATION_TURNS = 5;

function previewText(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/```[\s\S]*?```/g, " 代码片段 ")
    .replace(/<[^>]+>/g, " ")
    .replace(/(^|\s)[#>*_`~-]+(?=\s|$)/g, " ")
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function turnSummary(message: ChatMessage): string {
  const markdown = message.blocks
    ?.filter((block): block is Extract<MessageBlock, { type: "markdown" }> => block.type === "markdown")
    .map((block) => block.content.trim())
    .filter(Boolean);
  return (markdown?.length ? markdown[markdown.length - 1] : "") || message.content.trim();
}

function buildConversationTurns(messages: ChatMessage[]): ConversationTurn[] {
  const turns: ConversationTurn[] = [];
  let current: ConversationTurn | null = null;

  messages.forEach((message) => {
    if (message.role === "user") {
      const attachmentSummary = message.attachments?.map((attachment) => attachment.name).join("、") || "";
      current = { id: message.id, userMessage: previewText(message.content) || attachmentSummary || "附件", summary: "", streaming: false };
      turns.push(current);
      return;
    }
    if (!current) return;
    const summary = turnSummary(message);
    if (summary) current.summary = previewText(summary);
    current.streaming ||= message.streaming;
  });

  return turns;
}

function formatFileSize(size?: number): string {
  if (size == null) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(size >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

const MessageAttachments: FC<{ attachments: MessageAttachment[] }> = ({ attachments }) => <div className="message-attachments">
  {attachments.map((attachment) => attachment.kind === "image" && attachment.previewUrl
    ? <figure key={attachment.id} className="message-attachment-image"><img src={attachment.previewUrl} alt={attachment.name} /><figcaption>{attachment.name}</figcaption></figure>
    : <div key={attachment.id} className="message-attachment-file">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2.5h8l4 4V21.5H6Z" /><path d="M14 2.5v4h4" /></svg>
      <span><strong title={attachment.name}>{attachment.name}</strong>{formatFileSize(attachment.size) && <small>{formatFileSize(attachment.size)}</small>}</span>
    </div>)}
</div>;

const ChatMessages: FC<ChatMessagesProps> = ({ messages, pendingConfirm, errorMessage, onConfirm, onOpenFile, onOpenChanges }) => {
  const messagesRef = useRef<HTMLElement>(null);
  const messagesContentRef = useRef<HTMLDivElement>(null);
  const turnElementRefs = useRef(new Map<string, HTMLElement>());
  const turnScrollStarts = useRef<Array<{ id: string; scrollTop: number }>>([]);
  const previousMessageCount = useRef(0);
  const manuallyToggledTools = useRef(new Set<string>());
  const manuallyToggledGroups = useRef(new Set<string>());
  const manuallyToggledThinking = useRef(new Set<string>());
  const [toolOpenStates, setToolOpenStates] = useState<Record<string, boolean>>({});
  const [groupOpenStates, setGroupOpenStates] = useState<Record<string, boolean>>({});
  const [taskOpenStates, setTaskOpenStates] = useState<Record<string, boolean>>({});
  const [thinkingOpenStates, setThinkingOpenStates] = useState<Record<string, boolean>>({});
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [activeTurnId, setActiveTurnId] = useState("");
  const conversationViews = useMemo(() => buildConversationTurnViews(messages), [messages]);
  const conversationTurns = useMemo(() => {
    const viewsById = new Map(conversationViews.map((turn) => [turn.id, turn]));
    return buildConversationTurns(messages).map((turn) => {
      const finalMarkdownItems = viewsById.get(turn.id)?.finalItems
        .filter((item) => item.kind === "markdown") || [];
      const finalMarkdown = finalMarkdownItems[finalMarkdownItems.length - 1]?.content;
      return finalMarkdown ? { ...turn, summary: previewText(finalMarkdown) } : turn;
    });
  }, [conversationViews, messages]);

  const updateActiveTurn = useCallback(() => {
    const element = messagesRef.current;
    const starts = turnScrollStarts.current;
    if (!element || !starts.length) return;
    const activationPoint = element.scrollTop + 70;
    const nextActive = starts.reduce((active, turn) => turn.scrollTop <= activationPoint ? turn.id : active, starts[0].id);
    setActiveTurnId((current) => current === nextActive ? current : nextActive);
  }, []);

  const updateTurnNavigation = useCallback(() => {
    const element = messagesRef.current;
    if (!element || conversationTurns.length < MIN_NAVIGATION_TURNS) return;
    const maximumScroll = Math.max(0, element.scrollHeight - element.clientHeight);
    const starts = conversationTurns.map((turn) => {
      const target = turnElementRefs.current.get(turn.id);
      const scrollTop = target ? Math.max(0, Math.min(maximumScroll, target.offsetTop - 22)) : 0;
      return { id: turn.id, scrollTop };
    });
    turnScrollStarts.current = starts;
    updateActiveTurn();
  }, [conversationTurns, updateActiveTurn]);

  useLayoutEffect(() => {
    const element = messagesRef.current;
    if (!element) return;
    const enteredLoadedSession = previousMessageCount.current === 0 && messages.length > 0;
    if (enteredLoadedSession) {
      element.scrollTo({ top: element.scrollHeight, behavior: "auto" });
      setIsAtBottom(true);
    } else if (isAtBottom) {
      element.scrollTop = element.scrollHeight;
    }
    previousMessageCount.current = messages.length;
  }, [messages, pendingConfirm, errorMessage, isAtBottom]);

  useLayoutEffect(() => {
    updateTurnNavigation();
    const content = messagesContentRef.current;
    if (!content || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateTurnNavigation);
    observer.observe(content);
    return () => observer.disconnect();
  }, [updateTurnNavigation]);

  useEffect(() => {
    const failedToolIds = new Set<string>();
    conversationViews.forEach((turn) => {
      turn.traceItems.forEach((item) => {
        if (item.kind !== "activity") return;
        item.entries.forEach((entry) => { if (entry.type === "tool" && entry.event.status === "failed") failedToolIds.add(entry.event.id); });
      });
    });

    setToolOpenStates((current) => {
      let next = current;
      failedToolIds.forEach((id) => {
        if (!manuallyToggledTools.current.has(id) && current[id] !== true) {
          if (next === current) next = { ...current };
          next[id] = true;
        }
      });
      return next;
    });
  }, [messages]);

  const onScroll = () => {
    const element = messagesRef.current;
    if (!element) return;
    setIsAtBottom(element.scrollHeight - element.scrollTop - element.clientHeight < 48);
    updateActiveTurn();
  };

  const scrollToTurn = (turnId: string) => {
    const element = messagesRef.current;
    const target = turnElementRefs.current.get(turnId);
    if (!element || !target) return;
    element.scrollTo({ top: Math.max(0, target.offsetTop - 22), behavior: "smooth" });
  };

  const onContentClick = async (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const fileButton = target.closest<HTMLButtonElement>("button[data-file-path]");
    if (fileButton) {
      event.preventDefault();
      onOpenFile(fileButton.dataset.filePath || "");
      return;
    }
    const button = target.closest<HTMLButtonElement>("button[data-copy-code]");
    if (!button) return;
    const code = button.closest(".markdown-code-block")?.querySelector("code")?.textContent || "";
    try {
      await navigator.clipboard.writeText(code);
      button.textContent = "✓";
      button.setAttribute("aria-label", "已复制");
      window.setTimeout(() => { button.textContent = "▣"; button.setAttribute("aria-label", "复制代码"); }, 1200);
    } catch {
      // Clipboard permission is optional.
    }
  };

  const isToolExpanded = (tool: ToolEvent) => toolOpenStates[tool.id] ?? true;
  const toggleTool = (tool: ToolEvent) => {
    manuallyToggledTools.current.add(tool.id);
    setToolOpenStates((current) => ({ ...current, [tool.id]: !(current[tool.id] ?? true) }));
  };
  const isThinkingExpanded = (thinking: ThinkingEvent) => thinkingOpenStates[thinking.id] ?? false;
  const toggleThinking = (thinking: ThinkingEvent) => {
    manuallyToggledThinking.current.add(thinking.id);
    setThinkingOpenStates((current) => ({ ...current, [thinking.id]: !(current[thinking.id] ?? false) }));
  };
  const groupStateKey = (item: ActivitySegment) => `group-${item.id}-${item.active ? "active" : "complete"}`;
  const groupDefaultOpen = (item: ActivitySegment) => item.active;
  const toggleGroup = (item: ActivitySegment) => {
    const id = groupStateKey(item);
    manuallyToggledGroups.current.add(id);
    setGroupOpenStates((current) => ({ ...current, [id]: !(current[id] ?? groupDefaultOpen(item)) }));
  };
  const taskStateKey = (turnId: string, active: boolean) => `task-${turnId}-${active ? "active" : "complete"}`;
  const toggleTask = (turnId: string, active: boolean) => {
    const id = taskStateKey(turnId, active);
    setTaskOpenStates((current) => ({ ...current, [id]: !(current[id] ?? active) }));
  };

  return (
    <div className="conversation-shell">
      {conversationTurns.length >= MIN_NAVIGATION_TURNS && <nav className="turn-navigation" aria-label="对话轮次导航">
        <div className="turn-navigation-track">
          {conversationTurns.map((turn) => {
            return <button
              type="button"
              key={turn.id}
              className={`turn-navigation-marker ${activeTurnId === turn.id ? "active" : ""}`}
              aria-label={`定位到用户消息：${turn.userMessage}`}
              aria-describedby={`turn-navigation-preview-${turn.id}`}
              aria-current={activeTurnId === turn.id ? "step" : undefined}
              onClick={() => scrollToTurn(turn.id)}
            >
              <span className="turn-navigation-dash" aria-hidden="true" />
              <span id={`turn-navigation-preview-${turn.id}`} className="turn-navigation-popover" role="tooltip">
                <span className="turn-navigation-title-row">
                  <strong>{turn.userMessage}</strong>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 4.5h11v15l-5.5-3-5.5 3Z" /></svg>
                </span>
                <span className="turn-navigation-summary">{turn.summary || (turn.streaming ? "任务正在进行中…" : "本轮暂无任务总结")}</span>
              </span>
            </button>;
          })}
        </div>
      </nav>}
      <section ref={messagesRef} className="messages" aria-live="polite" onScroll={onScroll}>
        <div ref={messagesContentRef} className="messages-content">
          <div className="conversation-header"><span>任务对话</span><span className="conversation-meta">实时会话</span></div>
          {conversationViews.map((turn) => {
            const taskKey = taskStateKey(turn.id, turn.active);
            const taskExpanded = taskOpenStates[taskKey] ?? turn.active;
            return <section
              ref={(element) => { if (element) turnElementRefs.current.set(turn.id, element); else turnElementRefs.current.delete(turn.id); }}
              key={turn.id}
              className="conversation-turn"
            >
              <article className="message-row message-user"><div className="message-body"><div className="message-content user-content" onClick={onContentClick}>
                {Boolean(turn.userMessage.attachments?.length) && <MessageAttachments attachments={turn.userMessage.attachments || []} />}
                {(turn.userMessage.skillName || turn.userMessage.content) && <div className="user-message-text-row">
                  {turn.userMessage.skillName && <span className="message-skill"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z" /><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20M8 7h7m-7 4h5" /></svg><span>{turn.userMessage.skillName}</span></span>}
                  {turn.userMessage.content && <span className="user-content-text" dangerouslySetInnerHTML={{ __html: renderMessage(turn.userMessage) }} />}
                </div>}
              </div></div></article>
              {turn.traceItems.length > 0 && <article className="message-row message-assistant message-task-row"><div className="message-body" onClick={onContentClick}>
                <TaskActivityGroup active={turn.active} expanded={taskExpanded} durationMs={turn.durationMs} startedAt={turn.startedAt} onToggle={() => toggleTask(turn.id, turn.active)}>
                  <div className="task-activity-content">
                    {turn.traceItems.map((item) => {
                      if (item.kind === "markdown") return <div key={item.id} className="task-trace-markdown message-content markdown-content" dangerouslySetInnerHTML={{ __html: renderMarkdown(item.content) }} />;
                      const groupKey = groupStateKey(item);
                      return <ActivityGroup
                        key={item.id}
                        entries={item.entries}
                        active={item.active}
                        expanded={groupOpenStates[groupKey] ?? groupDefaultOpen(item)}
                        isThinkingExpanded={isThinkingExpanded}
                        isToolExpanded={isToolExpanded}
                        onToggleGroup={() => toggleGroup(item)}
                        onToggleThinking={toggleThinking}
                        onToggleTool={toggleTool}
                        onOpenFile={onOpenFile}
                      />;
                    })}
                  </div>
                </TaskActivityGroup>
              </div></article>}
              {turn.finalItems.map((item) => item.kind === "markdown"
                ? <article key={item.id} className="message-row message-assistant message-text-row"><div className="message-body"><div className="message-content markdown-content" onClick={onContentClick} dangerouslySetInnerHTML={{ __html: renderMarkdown(item.content) }} /></div></article>
                : <article key={item.id} className="message-row message-assistant message-change-row"><div className="message-body"><ChangeSummaryCard summary={item.summary} onOpenChanges={onOpenChanges} /></div></article>)}
            </section>;
          })}
          {pendingConfirm && <div className="confirm-card"><div><span className="confirm-eyebrow">需要你的确认</span><div className="confirm-title">QCode 请求执行工具</div></div><pre>{JSON.stringify(pendingConfirm.toolCalls, null, 2)}</pre><div className="confirm-actions"><button className="confirm-button secondary" onClick={() => onConfirm(false)}>拒绝</button><button className="confirm-button primary" onClick={() => onConfirm(true)}>允许执行</button></div></div>}
          {errorMessage && <div className="error-banner">{errorMessage}</div>}
        </div>
      </section>
    </div>
  );
};

export default ChatMessages;
