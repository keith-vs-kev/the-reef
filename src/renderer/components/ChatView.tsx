import React, { useEffect, useRef, useState, useCallback } from 'react';
import { SessionInfo, ChatMessage } from '../types';

interface ChatViewProps {
  session: SessionInfo;
}

// Model pricing per million tokens
const MODEL_RATES: Record<string, { input: number; output: number }> = {
  'claude-opus-4-6': { input: 5, output: 25 },
  'claude-opus-4-20250514': { input: 5, output: 25 },
  'claude-sonnet-4': { input: 1, output: 5 },
  'claude-sonnet-4-20250514': { input: 1, output: 5 },
};
const DEFAULT_RATE = { input: 3, output: 15 };

function estimateCost(msg: ChatMessage): number {
  if (msg.usage?.cost?.total) return msg.usage.cost.total;
  if (!msg.usage) return 0;
  const rate = MODEL_RATES[msg.model || ''] || DEFAULT_RATE;
  const inputTokens = (msg.usage.input || 0) + (msg.usage.cacheRead || 0) * 0.1;
  const outputTokens = msg.usage.output || 0;
  return (inputTokens * rate.input + outputTokens * rate.output) / 1_000_000;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function formatCost(cost: number): string {
  if (cost === 0) return '$0.00';
  if (cost < 0.001) return `$${cost.toFixed(4)}`;
  if (cost < 0.01) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

function timeAgo(ts?: number): string {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatTimestamp(ts?: number): string {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit' });
}

function extractText(content: any[]): string {
  if (!content || !Array.isArray(content)) return '';
  return content.map(c => {
    if (typeof c === 'string') return c;
    if (c.type === 'text') return c.text || '';
    return '';
  }).filter(Boolean).join('\n');
}

function extractToolCalls(content: any[]): Array<{ name: string; args: string; id?: string }> {
  if (!content || !Array.isArray(content)) return [];
  return content.filter(c => c.type === 'toolCall' || c.type === 'tool_use').map(c => ({
    name: c.name || 'unknown',
    args: typeof c.arguments === 'string' ? c.arguments :
          typeof c.input === 'string' ? c.input :
          JSON.stringify(c.arguments || c.input || {}, null, 2),
    id: c.id || c.toolCallId,
  }));
}

// ── Tool Call Accordion ──
function ToolCallAccordion({ name, args }: { name: string; args: string }) {
  const [open, setOpen] = useState(false);
  const shortArgs = args.length > 80 ? args.substring(0, 80) + '…' : args;

  return (
    <div className="rounded-md border border-reef-border overflow-hidden my-1.5" style={{ background: 'var(--reef-tool-bg)' }}>
      <button
        className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs hover:bg-reef-border/20 transition-colors duration-150"
        onClick={() => setOpen(!open)}
      >
        <svg
          className={`w-3 h-3 text-reef-text-dim transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
        <span className="text-amber-400 font-mono text-[11px]">⚡ {name}</span>
        {!open && <span className="text-reef-text-muted font-mono text-[10px] truncate flex-1">{shortArgs}</span>}
      </button>
      {open && (
        <div className="px-3 py-2 border-t border-reef-border">
          <pre className="text-[11px] font-mono text-reef-text-dim whitespace-pre-wrap break-all leading-relaxed max-h-64 overflow-y-auto">
            {args}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── Tool Result ──
function ToolResult({ msg }: { msg: ChatMessage }) {
  const [open, setOpen] = useState(false);
  const text = extractText(msg.content);
  if (!text) return null;
  const short = text.length > 100 ? text.substring(0, 100) + '…' : text;

  return (
    <div className="rounded-md border border-reef-border overflow-hidden my-1" style={{ background: 'var(--reef-tool-bg)' }}>
      <button
        className="flex items-center gap-2 w-full px-3 py-1 text-left text-xs hover:bg-reef-border/20 transition-colors duration-150"
        onClick={() => setOpen(!open)}
      >
        <svg
          className={`w-3 h-3 text-reef-text-dim transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
        {msg.isError ? (
          <span className="text-red-400 font-mono text-[11px]">✗ {msg.toolName || 'error'}</span>
        ) : (
          <span className="text-purple-400 font-mono text-[11px]">↩ {msg.toolName || 'result'}</span>
        )}
        {!open && <span className="text-reef-text-muted font-mono text-[10px] truncate flex-1">{short}</span>}
      </button>
      {open && (
        <div className="px-3 py-2 border-t border-reef-border">
          <pre className="text-[11px] font-mono text-reef-text-dim whitespace-pre-wrap break-all leading-relaxed max-h-48 overflow-y-auto">
            {text}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── Message Bubble ──
function MessageBubble({ msg, sessionModel }: { msg: ChatMessage; sessionModel?: string }) {
  if (msg.role === 'system') {
    const text = extractText(msg.content);
    if (!text) return null;
    return (
      <div className="message-enter flex justify-center py-1">
        <span className="text-[10px] text-reef-text-muted italic max-w-md truncate">
          ◈ system: {text.substring(0, 120)}
        </span>
      </div>
    );
  }

  if (msg.role === 'toolResult' || msg.role === 'tool') {
    return (
      <div className="message-enter max-w-2xl mr-auto pl-2">
        <ToolResult msg={msg} />
      </div>
    );
  }

  if (msg.role === 'user') {
    const text = extractText(msg.content);
    if (!text) return null;
    return (
      <div className="message-enter flex justify-end mb-3">
        <div className="max-w-xl">
          <div
            className="rounded-2xl rounded-tr-md px-4 py-2.5 text-[13px] leading-relaxed border"
            style={{
              background: 'var(--reef-user-bubble)',
              borderColor: 'var(--reef-user-border)',
              color: 'var(--reef-text-bright)',
            }}
          >
            <div className="whitespace-pre-wrap break-words">{text}</div>
          </div>
          {msg.timestamp && (
            <div className="text-[10px] text-reef-text-muted text-right mt-1 mr-1">
              {formatTimestamp(msg.timestamp)}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (msg.role === 'assistant') {
    const text = extractText(msg.content);
    const toolCalls = extractToolCalls(msg.content);
    const usage = msg.usage;
    const totalTokens = usage ? (usage.input || 0) + (usage.output || 0) + (usage.cacheRead || 0) : 0;
    const cost = estimateCost({ ...msg, model: msg.model || sessionModel });

    return (
      <div className="message-enter max-w-2xl mr-auto mb-3">
        {text && (
          <div
            className="rounded-2xl rounded-tl-md px-4 py-2.5 text-[13px] leading-relaxed border"
            style={{
              background: 'var(--reef-assistant-bubble)',
              borderColor: 'var(--reef-assistant-border)',
              color: 'var(--reef-text)',
            }}
          >
            <div className="whitespace-pre-wrap break-words">{text}</div>
          </div>
        )}

        {/* Tool calls */}
        {toolCalls.length > 0 && (
          <div className="mt-1 pl-1">
            {toolCalls.map((tc, i) => (
              <ToolCallAccordion key={i} name={tc.name} args={tc.args} />
            ))}
          </div>
        )}

        {/* Per-message metadata */}
        {(totalTokens > 0 || cost > 0) && (
          <div className="flex items-center gap-2 mt-1 ml-1 text-[10px] text-reef-text-muted">
            {totalTokens > 0 && <span>{formatTokens(totalTokens)} tokens</span>}
            {totalTokens > 0 && cost > 0 && <span>·</span>}
            {cost > 0 && <span>{formatCost(cost)}</span>}
            {msg.timestamp && <span>· {formatTimestamp(msg.timestamp)}</span>}
          </div>
        )}
        {!totalTokens && !cost && msg.timestamp && (
          <div className="text-[10px] text-reef-text-muted mt-1 ml-1">
            {formatTimestamp(msg.timestamp)}
          </div>
        )}
      </div>
    );
  }

  return null;
}

// ── Status Pill ──
function StatusPill({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; dotClass: string }> = {
    working: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dotClass: 'status-dot-active' },
    idle: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dotClass: 'status-dot-active' },
    error: { bg: 'bg-red-500/10', text: 'text-red-400', dotClass: 'bg-red-500' },
    stopped: { bg: 'bg-zinc-500/10', text: 'text-zinc-500', dotClass: 'bg-zinc-600' },
  };
  const c = config[status] || config.stopped;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium ${c.bg} ${c.text}`}>
      <span className={`w-2 h-2 rounded-full ${c.dotClass}`} />
      {status}
    </span>
  );
}

// ── Agent Header ──
function AgentHeader({ session, messageCount, sessionCost }: { session: SessionInfo; messageCount: number; sessionCost: number }) {
  return (
    <div className="flex items-center gap-4 px-5 py-3 border-b border-reef-border" style={{ background: 'var(--reef-bg-elevated)' }}>
      <span className="text-3xl">{session.emoji || '🤖'}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2.5">
          <span className="text-[15px] font-semibold text-reef-text-bright">{session.agent}</span>
          <StatusPill status={session.status} />
          {session.model && (
            <span className="text-[11px] font-mono text-reef-text-dim bg-reef-border/40 px-2 py-0.5 rounded-md">
              {session.model}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          {session.subject && (
            <span className="text-[12px] text-reef-text-dim truncate max-w-sm">{session.subject}</span>
          )}
          {session.updatedAt && (
            <span className="text-[11px] text-reef-text-muted">last active {timeAgo(session.updatedAt)}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-4 text-[11px] text-reef-text-dim shrink-0">
        {messageCount > 0 && <span>{messageCount} messages</span>}
        {(session.totalTokens || 0) > 0 && (
          <span className="font-mono">{formatTokens(session.totalTokens || 0)} tok</span>
        )}
        <span className="font-mono font-medium text-reef-text">
          {formatCost(sessionCost)}
        </span>
      </div>
    </div>
  );
}

// ── Skeleton Messages ──
function SkeletonMessages() {
  return (
    <div className="p-5 space-y-4 animate-pulse">
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} className={`flex ${i % 3 === 0 ? 'justify-end' : ''}`}>
          <div className={`${i % 3 === 0 ? 'w-48' : 'w-72'}`}>
            <div className="skeleton h-12 rounded-2xl" />
            <div className="skeleton h-3 w-20 mt-1.5 ml-1" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main Chat View ──
export function ChatView({ session }: ChatViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [sessionCost, setSessionCost] = useState(0);

  // Fetch chat history
  useEffect(() => {
    setLoading(true);
    setMessages([]);
    setSessionCost(0);

    if (!window.reef) {
      setLoading(false);
      return;
    }

    window.reef.gateway.chatHistory(session.key, 50).then(result => {
      setLoading(false);
      if (result.ok && result.data) {
        setMessages(result.data);
        // Calculate per-session cost from message-level data
        let total = 0;
        for (const msg of result.data) {
          total += estimateCost({ ...msg, model: msg.model || session.model });
        }
        setSessionCost(total);
      }
    }).catch(() => setLoading(false));
  }, [session.id, session.key, session.model]);

  // Auto-scroll
  useEffect(() => {
    if (!loading && messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading]);

  // Track scroll position
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBtn(distFromBottom > 200);
  }, []);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--reef-bg)' }}>
      <AgentHeader session={session} messageCount={messages.length} sessionCost={sessionCost} />

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-5 py-4"
        onScroll={onScroll}
      >
        {loading ? (
          <SkeletonMessages />
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-reef-text-dim text-sm">
            No messages in this session
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-1">
            {messages.map((msg, i) => (
              <MessageBubble key={i} msg={msg} sessionModel={session.model} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Scroll to bottom FAB */}
      {showScrollBtn && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-16 right-6 w-9 h-9 rounded-full bg-reef-bg-elevated border border-reef-border shadow-lg flex items-center justify-center text-reef-text-dim hover:text-reef-text-bright hover:border-reef-accent/50 transition-all duration-150"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="m19 14-7 7m0 0-7-7m7 7V3" />
          </svg>
        </button>
      )}
    </div>
  );
}
