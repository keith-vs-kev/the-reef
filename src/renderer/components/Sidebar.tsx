import React, { useState, useMemo } from 'react';
import { SessionInfo } from '../types';

interface SidebarProps {
  sessions: SessionInfo[];
  selectedSession: string | null;
  onSelectSession: (id: string) => void;
}

function formatCost(cost: number): string {
  if (cost >= 10) return `$${cost.toFixed(0)}`;
  if (cost >= 1) return `$${cost.toFixed(1)}`;
  return `$${cost.toFixed(2)}`;
}

function timeAgo(ts?: string | number): string {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function Sidebar({ sessions, selectedSession, onSelectSession }: SidebarProps) {
  const [search, setSearch] = useState('');
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());

  // Build tree
  const topLevel = useMemo(() => sessions.filter(s => !s.parentSession), [sessions]);
  const subagentMap = useMemo(() => {
    const map = new Map<string, SessionInfo[]>();
    for (const s of sessions) {
      if (s.parentSession) {
        const list = map.get(s.parentSession) || [];
        list.push(s);
        map.set(s.parentSession, list);
      }
    }
    return map;
  }, [sessions]);

  // Filter
  const filtered = useMemo(() => {
    if (!search) return topLevel;
    const q = search.toLowerCase();
    return topLevel.filter(s =>
      s.agent.toLowerCase().includes(q) ||
      s.label?.toLowerCase().includes(q) ||
      s.subject?.toLowerCase().includes(q)
    );
  }, [topLevel, search]);

  // Group: active vs stopped
  const active = useMemo(() => filtered.filter(s => s.status === 'working' || s.status === 'idle'), [filtered]);
  const stopped = useMemo(() => filtered.filter(s => s.status !== 'working' && s.status !== 'idle'), [filtered]);

  const toggleExpand = (id: string) => {
    setExpandedSessions(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="w-64 min-w-[220px] max-w-[340px] bg-reef-sidebar border-r border-reef-border flex flex-col overflow-hidden">
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
            className="w-full h-7 pl-8 pr-3 text-xs bg-reef-bg border border-reef-border rounded-md text-reef-text-bright placeholder-reef-text-dim focus:border-reef-accent focus:ring-1 focus:ring-reef-accent/20 focus:outline-none transition-all"
          />
        </div>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto px-1.5">
        {/* Active section */}
        {active.length > 0 && (
          <SectionGroup title="Active" count={active.length}>
            {active.map(session => (
              <SessionTree
                key={session.id}
                session={session}
                subs={subagentMap.get(session.id) || []}
                selectedSession={selectedSession}
                expandedSessions={expandedSessions}
                onSelect={onSelectSession}
                onToggle={toggleExpand}
              />
            ))}
          </SectionGroup>
        )}

        {/* Recent/Stopped section */}
        {stopped.length > 0 && (
          <SectionGroup title="Recent" count={stopped.length}>
            {stopped.map(session => (
              <SessionTree
                key={session.id}
                session={session}
                subs={subagentMap.get(session.id) || []}
                selectedSession={selectedSession}
                expandedSessions={expandedSessions}
                onSelect={onSelectSession}
                onToggle={toggleExpand}
              />
            ))}
          </SectionGroup>
        )}
      </div>

      {/* Footer */}
      <div className="p-2 border-t border-reef-border">
        <div className="text-[10px] text-reef-text-dim text-center">
          {sessions.length} sessions
        </div>
      </div>
    </div>
  );
}

function SectionGroup({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="mb-1">
      <div className="flex items-center gap-2 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-reef-text-dim">
        <span>{title}</span>
        <span className="bg-reef-border/60 text-reef-text-dim px-1.5 py-0.5 rounded-full text-[9px] font-medium">
          {count}
        </span>
      </div>
      {children}
    </div>
  );
}

function SessionTree({
  session, subs, selectedSession, expandedSessions, onSelect, onToggle,
}: {
  session: SessionInfo;
  subs: SessionInfo[];
  selectedSession: string | null;
  expandedSessions: Set<string>;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const hasSubs = subs.length > 0;
  const isExpanded = expandedSessions.has(session.id) || hasSubs;

  return (
    <div>
      <SessionRow
        session={session}
        isSelected={selectedSession === session.id}
        hasChildren={hasSubs}
        isExpanded={isExpanded}
        depth={0}
        onClick={() => onSelect(session.id)}
        onToggle={() => onToggle(session.id)}
      />
      {isExpanded && subs.map(sub => (
        <SessionRow
          key={sub.id}
          session={sub}
          isSelected={selectedSession === sub.id}
          hasChildren={false}
          isExpanded={false}
          depth={1}
          onClick={() => onSelect(sub.id)}
          onToggle={() => {}}
        />
      ))}
    </div>
  );
}

function SessionRow({
  session, isSelected, hasChildren, isExpanded, depth, onClick, onToggle,
}: {
  session: SessionInfo;
  isSelected: boolean;
  hasChildren: boolean;
  isExpanded: boolean;
  depth: number;
  onClick: () => void;
  onToggle: () => void;
}) {
  const isActive = session.status === 'working' || session.status === 'idle';

  return (
    <div
      className={`group flex items-center gap-2 px-2 py-1.5 mx-1 rounded-md cursor-pointer text-[12px] transition-all duration-100 ${
        isSelected
          ? 'bg-reef-accent-muted text-reef-text-bright ring-1 ring-reef-accent/20'
          : 'hover:bg-reef-border/30 text-reef-text'
      }`}
      style={{ paddingLeft: `${8 + depth * 14}px` }}
      onClick={onClick}
    >
      {/* Expand arrow */}
      {hasChildren ? (
        <span
          className="text-[9px] text-reef-text-dim w-3 flex-shrink-0 cursor-pointer hover:text-reef-text transition-colors"
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
        >
          {isExpanded ? '▼' : '▶'}
        </span>
      ) : (
        <span className="w-3 flex-shrink-0" />
      )}

      {/* Status dot */}
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
        session.status === 'working' ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50' :
        session.status === 'idle' ? 'bg-amber-500' :
        session.status === 'error' ? 'bg-red-500' : 'bg-zinc-600'
      }`} />

      {/* Emoji */}
      <span className="text-sm flex-shrink-0">{session.emoji || '🤖'}</span>

      {/* Name + label */}
      <div className="flex-1 min-w-0">
        <div className="truncate font-medium text-[12px]">{session.agent}</div>
        {session.label && (
          <div className="truncate text-[10px] text-reef-text-dim leading-tight">{session.label}</div>
        )}
      </div>

      {/* Cost */}
      <span className={`text-[10px] flex-shrink-0 tabular-nums ${
        isActive ? 'text-reef-text-dim' : 'text-reef-text-muted'
      }`}>
        {formatCost(session.cost)}
      </span>
    </div>
  );
}
