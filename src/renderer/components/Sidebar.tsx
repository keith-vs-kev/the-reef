import React, { useState, useMemo, useCallback } from 'react';
import { SessionInfo } from '../types';

/* ── helpers ─────────────────────────────────────────── */

function formatCost(cost: number): string {
  if (cost >= 10) return `$${cost.toFixed(0)}`;
  if (cost >= 1) return `$${cost.toFixed(1)}`;
  if (cost >= 0.01) return `$${cost.toFixed(2)}`;
  return '$0.00';
}

const CHANNEL_META: Record<string, { icon: string; label: string; order: number }> = {
  whatsapp: { icon: '💬', label: 'WhatsApp', order: 0 },
  telegram: { icon: '📱', label: 'Telegram', order: 1 },
  discord:  { icon: '🎮', label: 'Discord',  order: 2 },
  slack:    { icon: '💼', label: 'Slack',     order: 3 },
  internal: { icon: '🔧', label: 'Internal',  order: 4 },
};

function channelMeta(ch: string) {
  return CHANNEL_META[ch] || { icon: '📡', label: ch, order: 3 };
}

function isActive(s: SessionInfo) {
  return s.status === 'working' || s.status === 'idle';
}

/* ── types ───────────────────────────────────────────── */

interface SessionNode {
  session: SessionInfo;
  children: SessionNode[];   // subagents
}

interface ChatGroup {
  chatId: string;
  chatName: string;
  isGroup: boolean;
  sessions: SessionNode[];   // top-level sessions in this chat
  totalCost: number;
  hasActive: boolean;
  sessionCount: number;
}

interface ChannelGroup {
  channel: string;
  meta: { icon: string; label: string; order: number };
  chats: ChatGroup[];
  totalCost: number;
  hasActive: boolean;
  sessionCount: number;
}

/* ── hierarchy builder ───────────────────────────────── */

function buildHierarchy(sessions: SessionInfo[]): ChannelGroup[] {
  const byId = new Map<string, SessionInfo>();
  for (const s of sessions) byId.set(s.id, s);

  // Find subagent relationships
  const childrenOf = new Map<string, SessionInfo[]>();
  const childIds = new Set<string>();
  for (const s of sessions) {
    if (s.parentSession && byId.has(s.parentSession)) {
      childIds.add(s.id);
      const list = childrenOf.get(s.parentSession) || [];
      list.push(s);
      childrenOf.set(s.parentSession, list);
    }
  }

  // Build session nodes (with nested subagents)
  function buildSessionNode(s: SessionInfo): SessionNode {
    const kids = (childrenOf.get(s.id) || []).sort((a, b) => (b.cost) - (a.cost));
    return { session: s, children: kids.map(buildSessionNode) };
  }

  function nodeCost(n: SessionNode): number {
    return n.session.cost + n.children.reduce((sum, c) => sum + nodeCost(c), 0);
  }

  function nodeCount(n: SessionNode): number {
    return 1 + n.children.reduce((sum, c) => sum + nodeCount(c), 0);
  }

  function nodeHasActive(n: SessionNode): boolean {
    return isActive(n.session) || n.children.some(nodeHasActive);
  }

  // Top-level sessions only (not subagents)
  const topLevel = sessions.filter(s => !childIds.has(s.id));

  // Determine channel for a session
  function getChannel(s: SessionInfo): string {
    if (s.channel && s.channel !== 'subagent') return s.channel;
    if (s.platform && s.platform !== 'subagent' && s.platform !== 'unknown') return s.platform;
    return 'internal';
  }

  // Determine chat grouping key and name
  function getChatKey(s: SessionInfo): string {
    // Use recipient to group — multiple agents in same chat share the recipient
    // Strip type prefix so "group:xxx" and "xxx" map to same key
    if (s.recipient) {
      return s.recipient.replace(/^(group|g|dm|channel|thread)[:\-]/i, '');
    }
    // Parse the session ID for group/dm info
    const parts = s.id.split(':');
    if (parts.length >= 5) {
      // Skip the type part (group/dm/etc), use just the ID
      const type = parts[3];
      if (['group', 'dm', 'channel', 'thread', 'subagent'].includes(type)) {
        return parts.slice(4).join(':');
      }
      return parts.slice(3).join(':');
    }
    return s.label || s.id;
  }

  /** Clean any raw identifier into a human-friendly chat name */
  function cleanChatId(raw: string): string {
    // Strip platform prefix (whatsapp:, telegram:, etc.)
    let c = raw.replace(/^[a-zA-Z]+:/i, '');
    // Strip type prefix (group:, g-, dm:, dm-, channel:, etc.)
    c = c.replace(/^(group|g|dm|channel|thread)[:\-]/i, '');
    // Strip WhatsApp JID suffixes
    c = c.replace(/@[a-z.]+$/i, '');
    return c.trim();
  }

  function prettify(slug: string): string {
    if (!slug) return '';
    // Titlecase kebab/snake slugs
    return slug.split(/[-_]/).filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  function getChatName(sessions: SessionInfo[]): string {
    const s0 = sessions[0];

    // 1. Clean the recipient field — this is the most reliable source
    const rawRecip = s0.recipient || '';
    if (rawRecip) {
      const clean = cleanChatId(rawRecip);
      if (clean && /^\+?\d{8,15}$/.test(clean)) return `DM ${clean}`;
      if (clean && /^\d{10,}$/.test(clean)) return `Group …${clean.slice(-6)}`;
      if (clean && !/^\d{8,}$/.test(clean) && clean.length < 40) return prettify(clean);
    }

    // 2. Try displayName (cleaned)
    for (const s of sessions) {
      if (s.displayName) {
        const cleaned = cleanChatId(s.displayName);
        if (cleaned && !/^\d{8,}$/.test(cleaned)) return prettify(cleaned);
      }
    }

    // 3. Try to extract from session labels
    for (const s of sessions) {
      if (!s.label) continue;
      const m = s.label.match(/(?:whatsapp|telegram|discord|slack)-(?:g|dm|group|channel)-([a-z][a-z0-9-]*?)(?:-(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\d*.*)?$/i);
      if (m) return prettify(m[1]);
    }

    // 4. Subject (but clean it too — might be a raw ID)
    for (const s of sessions) {
      if (s.subject) {
        const cleaned = cleanChatId(s.subject);
        if (cleaned && !/^\d{8,}$/.test(cleaned) && cleaned.length <= 40) return prettify(cleaned);
      }
    }

    // 5. Parse from session key
    const parts = s0.id.split(':');
    if (parts.length >= 5) {
      const type = parts[3];
      const rawId = parts.slice(4).join(':');
      const clean = cleanChatId(rawId);
      if (clean && !/^\d{8,}$/.test(clean) && clean.length < 30) return prettify(clean);
      if (type === 'group') return `Group …${clean.slice(-6)}`;
      if (type === 'dm') return `DM …${clean.slice(-8)}`;
    }

    return s0.label || s0.agent;
  }

  // Group: channel → chat → sessions
  const channelMap = new Map<string, Map<string, SessionNode[]>>();

  for (const s of topLevel) {
    const ch = getChannel(s);
    const chatKey = getChatKey(s);
    if (!channelMap.has(ch)) channelMap.set(ch, new Map());
    const chatMap = channelMap.get(ch)!;
    if (!chatMap.has(chatKey)) chatMap.set(chatKey, []);
    chatMap.get(chatKey)!.push(buildSessionNode(s));
  }

  // Build channel groups
  const channels: ChannelGroup[] = [];
  for (const [ch, chatMap] of channelMap) {
    const meta = channelMeta(ch);
    const chats: ChatGroup[] = [];

    for (const [chatId, nodes] of chatMap) {
      // Get chat name from first session
      const firstName = getChatName(nodes.map(n => n.session));
      const totalCost = nodes.reduce((sum, n) => sum + nodeCost(n), 0);
      const hasAct = nodes.some(nodeHasActive);
      const count = nodes.reduce((sum, n) => sum + nodeCount(n), 0);

      chats.push({
        chatId,
        chatName: firstName,
        isGroup: nodes[0].session.isGroup ?? false,
        sessions: nodes,
        totalCost,
        hasActive: hasAct,
        sessionCount: count,
      });
    }

    // Sort chats: active first, then by cost
    chats.sort((a, b) => {
      if (a.hasActive !== b.hasActive) return a.hasActive ? -1 : 1;
      return b.totalCost - a.totalCost;
    });

    channels.push({
      channel: ch,
      meta,
      chats,
      totalCost: chats.reduce((sum, c) => sum + c.totalCost, 0),
      hasActive: chats.some(c => c.hasActive),
      sessionCount: chats.reduce((sum, c) => sum + c.sessionCount, 0),
    });
  }

  // Sort channels by defined order
  channels.sort((a, b) => a.meta.order - b.meta.order);
  return channels;
}

/* ── search filter ───────────────────────────────────── */

function sessionMatches(s: SessionInfo, q: string): boolean {
  return (
    s.agent.toLowerCase().includes(q) ||
    (s.label?.toLowerCase().includes(q) ?? false) ||
    (s.subject?.toLowerCase().includes(q) ?? false) ||
    (s.recipient?.toLowerCase().includes(q) ?? false) ||
    (s.displayName?.toLowerCase().includes(q) ?? false)
  );
}

function nodeMatches(n: SessionNode, q: string): boolean {
  return sessionMatches(n.session, q) || n.children.some(c => nodeMatches(c, q));
}

function chatMatches(chat: ChatGroup, q: string): boolean {
  return chat.chatName.toLowerCase().includes(q) || chat.sessions.some(n => nodeMatches(n, q));
}

function filterChannels(channels: ChannelGroup[], query: string): ChannelGroup[] {
  if (!query) return channels;
  const q = query.toLowerCase();
  return channels
    .map(ch => ({
      ...ch,
      chats: ch.chats.filter(c => chatMatches(c, q)),
    }))
    .filter(ch => ch.chats.length > 0);
}

/* ── props ───────────────────────────────────────────── */

interface SidebarProps {
  sessions: SessionInfo[];
  selectedSession: string | null;
  onSelectSession: (id: string) => void;
  loading?: boolean;
}

/* ── skeleton ────────────────────────────────────────── */

function SkeletonSidebar() {
  return (
    <div className="px-2 py-2 space-y-1">
      {[1, 2, 3].map(i => (
        <div key={i}>
          <div className="skeleton h-3 w-24 mb-2 ml-1 mt-2" />
          {[1, 2].map(j => (
            <div key={j} className="flex items-center gap-2 px-2 py-1.5 ml-2">
              <div className="skeleton w-2 h-2 rounded-full" />
              <div className="skeleton w-5 h-5 rounded" />
              <div className="flex-1">
                <div className="skeleton h-3 w-20 mb-1" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ── Chevron icon ────────────────────────────────────── */

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-3 h-3 transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

/* ── Main Sidebar ────────────────────────────────────── */

export function Sidebar({ sessions, selectedSession, onSelectSession, loading }: SidebarProps) {
  const [search, setSearch] = useState('');
  // Collapsed state: "channel:whatsapp" or "chat:whatsapp:groupid" or session id
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const channels = useMemo(() => buildHierarchy(sessions), [sessions]);
  const filtered = useMemo(() => filterChannels(channels, search), [channels, search]);

  const toggle = useCallback((key: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  return (
    <div className="w-64 min-w-[220px] max-w-[340px] bg-reef-sidebar border-r border-reef-border flex flex-col overflow-hidden transition-all duration-200">
      {/* Search */}
      <div className="p-2">
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-reef-text-dim" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search sessions..."
            className="w-full h-7 pl-8 pr-3 text-xs bg-reef-bg border border-reef-border rounded-md text-reef-text-bright placeholder-reef-text-dim focus:border-reef-accent focus:ring-1 focus:ring-reef-accent/20 focus:outline-none transition-all duration-150"
          />
        </div>
      </div>

      {/* Channel tree */}
      <div className="flex-1 overflow-y-auto px-1">
        {loading ? (
          <SkeletonSidebar />
        ) : filtered.length === 0 ? (
          <div className="text-[11px] text-reef-text-dim text-center py-8">No sessions found</div>
        ) : (
          filtered.map(ch => (
            <ChannelRow
              key={ch.channel}
              channel={ch}
              collapsed={collapsed}
              selectedSession={selectedSession}
              onToggle={toggle}
              onSelect={onSelectSession}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div className="p-2 border-t border-reef-border">
        <div className="text-[10px] text-reef-text-dim text-center">
          {sessions.length} sessions · {channels.length} channels
        </div>
      </div>
    </div>
  );
}

/* ── Channel row ─────────────────────────────────────── */

function ChannelRow({ channel, collapsed, selectedSession, onToggle, onSelect }: {
  channel: ChannelGroup;
  collapsed: Set<string>;
  selectedSession: string | null;
  onToggle: (key: string) => void;
  onSelect: (id: string) => void;
}) {
  const key = `channel:${channel.channel}`;
  const isOpen = !collapsed.has(key);

  return (
    <div className="mb-0.5">
      {/* Channel header */}
      <button
        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-semibold text-reef-text hover:bg-reef-border/20 rounded-md transition-colors duration-150"
        onClick={() => onToggle(key)}
      >
        <span className="w-4 h-4 flex items-center justify-center text-reef-text-dim">
          <Chevron open={isOpen} />
        </span>
        <span className="text-sm">{channel.meta.icon}</span>
        <span className="flex-1 text-left truncate">{channel.meta.label}</span>
        {channel.hasActive && (
          <span className="w-1.5 h-1.5 rounded-full status-dot-active shrink-0" />
        )}
        <span className="text-[9px] text-reef-text-muted bg-reef-border/40 px-1.5 py-0.5 rounded-full tabular-nums">
          {channel.sessionCount}
        </span>
        <span className="text-[10px] text-reef-text-dim font-mono tabular-nums">
          {formatCost(channel.totalCost)}
        </span>
      </button>

      {/* Chats */}
      {isOpen && (
        <div className="ml-1">
          {channel.chats.map(chat => (
            <ChatRow
              key={chat.chatId}
              chat={chat}
              channelKey={channel.channel}
              collapsed={collapsed}
              selectedSession={selectedSession}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Chat row ────────────────────────────────────────── */

function ChatRow({ chat, channelKey, collapsed, selectedSession, onToggle, onSelect }: {
  chat: ChatGroup;
  channelKey: string;
  collapsed: Set<string>;
  selectedSession: string | null;
  onToggle: (key: string) => void;
  onSelect: (id: string) => void;
}) {
  const key = `chat:${channelKey}:${chat.chatId}`;
  const isOpen = !collapsed.has(key);
  const hasManySessionsOrSubagents = chat.sessionCount > 1;

  // If only one session with no subagents, clicking goes straight to it
  const singleSession = chat.sessions.length === 1 && chat.sessions[0].children.length === 0
    ? chat.sessions[0].session : null;

  const isSelected = singleSession && selectedSession === singleSession.id;

  return (
    <div>
      <div
        className={`flex items-center gap-1.5 py-1 mx-0.5 rounded-md cursor-pointer text-[11px] transition-all duration-150 ${
          isSelected
            ? 'bg-reef-accent-muted text-reef-text-bright ring-1 ring-reef-accent/20'
            : 'hover:bg-reef-border/20 text-reef-text'
        }`}
        style={{ paddingLeft: '20px', paddingRight: '8px' }}
        onClick={() => {
          if (singleSession) {
            onSelect(singleSession.id);
          } else {
            onToggle(key);
          }
        }}
      >
        {hasManySessionsOrSubagents ? (
          <span className="w-4 h-4 flex items-center justify-center text-reef-text-dim shrink-0">
            <Chevron open={isOpen} />
          </span>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        {chat.hasActive && (
          <span className="w-1.5 h-1.5 rounded-full status-dot-active shrink-0" />
        )}
        {!chat.hasActive && (
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 shrink-0" />
        )}

        <span className="flex-1 truncate font-medium">
          {chat.chatName}
        </span>

        {chat.sessionCount > 1 && (
          <span className="text-[9px] text-reef-text-muted shrink-0">
            ({chat.sessionCount})
          </span>
        )}

        <span className="text-[10px] text-reef-text-dim font-mono tabular-nums shrink-0">
          {formatCost(chat.totalCost)}
        </span>
      </div>

      {/* Sessions within chat */}
      {isOpen && hasManySessionsOrSubagents && (
        <div className="relative">
          <div
            className="absolute top-0 bottom-0 border-l border-reef-border/30"
            style={{ left: '32px' }}
          />
          {chat.sessions.map(node => (
            <SessionRow
              key={node.session.id}
              node={node}
              depth={0}
              selectedSession={selectedSession}
              collapsed={collapsed}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Session row (recursive for subagents) ───────────── */

function SessionRow({ node, depth, selectedSession, collapsed, onSelect, onToggle }: {
  node: SessionNode;
  depth: number;
  selectedSession: string | null;
  collapsed: Set<string>;
  onSelect: (id: string) => void;
  onToggle: (key: string) => void;
}) {
  const { session, children } = node;
  const hasChildren = children.length > 0;
  const isCollapsed = collapsed.has(session.id);
  const isSelected = selectedSession === session.id;
  const active = isActive(session);

  const dotClass = active ? 'status-dot-active' :
    session.status === 'error' ? 'bg-red-500' :
    session.status === 'thinking' ? 'bg-yellow-500 animate-pulse' : 'bg-zinc-600';

  const label = session.label || session.agent;
  const baseLeft = 36 + depth * 14;

  return (
    <>
      <div
        className={`group flex items-center gap-1.5 py-1 mx-0.5 rounded-md cursor-pointer text-[11px] transition-all duration-150 ${
          isSelected
            ? 'bg-reef-accent-muted text-reef-text-bright ring-1 ring-reef-accent/20'
            : 'hover:bg-reef-border/20 text-reef-text'
        }`}
        style={{ paddingLeft: `${baseLeft}px`, paddingRight: '8px' }}
        onClick={() => onSelect(session.id)}
      >
        {hasChildren ? (
          <button
            className="w-3.5 h-3.5 flex items-center justify-center text-reef-text-dim hover:text-reef-text shrink-0"
            onClick={(e) => { e.stopPropagation(); onToggle(session.id); }}
          >
            <Chevron open={!isCollapsed} />
          </button>
        ) : (
          <span className="w-3.5 shrink-0" />
        )}

        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass}`} />
        <span className="text-xs shrink-0">{session.emoji || '🤖'}</span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className="font-medium truncate">{session.agent}</span>
            {active && (
              <span className="text-[8px] text-emerald-400 font-medium uppercase tracking-wide">active</span>
            )}
          </div>
          {label !== session.agent && (
            <div className="truncate text-[10px] text-reef-text-dim leading-tight">{label}</div>
          )}
        </div>

        <span className="text-[10px] text-reef-text-dim font-mono tabular-nums shrink-0">
          {formatCost(session.cost)}
        </span>
      </div>

      {hasChildren && !isCollapsed && (
        <div className="relative">
          <div
            className="absolute top-0 bottom-0 border-l border-reef-border/20"
            style={{ left: `${baseLeft + 6}px` }}
          />
          {children.map(child => (
            <SessionRow
              key={child.session.id}
              node={child}
              depth={depth + 1}
              selectedSession={selectedSession}
              collapsed={collapsed}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </>
  );
}
