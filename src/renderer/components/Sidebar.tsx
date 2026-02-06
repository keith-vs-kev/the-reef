import React, { useState, useMemo, useCallback } from 'react';
import { SessionInfo } from '../types';

interface SidebarProps {
  sessions: SessionInfo[];
  selectedSession: string | null;
  onSelectSession: (id: string) => void;
  loading?: boolean;
}

function formatCost(cost: number): string {
  if (cost >= 10) return `$${cost.toFixed(0)}`;
  if (cost >= 1) return `$${cost.toFixed(1)}`;
  if (cost >= 0.01) return `$${cost.toFixed(2)}`;
  return '$0.00';
}

function timeAgo(ts?: string | number): string {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** Get a nice display name for a session */
function sessionDisplayName(s: SessionInfo): string {
  // Prefer label (e.g. "rex-reef-polish-feb6")
  if (s.label) return s.label;
  // Fall back to displayName or subject
  if (s.displayName) return s.displayName;
  if (s.subject) {
    // Truncate long subjects
    return s.subject.length > 40 ? s.subject.substring(0, 40) + '…' : s.subject;
  }
  // For top-level, just show agent name
  return s.agent;
}

function SkeletonSidebar() {
  return (
    <div className="px-2 py-2 space-y-1">
      <div className="skeleton h-3 w-16 mb-3 ml-2" />
      {[1, 2, 3].map(i => (
        <div key={i} className="flex items-center gap-2 px-2 py-2">
          <div className="skeleton w-2 h-2 rounded-full" />
          <div className="skeleton w-6 h-6 rounded" />
          <div className="flex-1">
            <div className="skeleton h-3 w-20 mb-1" />
            <div className="skeleton h-2 w-32" />
          </div>
        </div>
      ))}
      <div className="skeleton h-3 w-16 mb-3 ml-2 mt-4" />
      {[4, 5, 6, 7].map(i => (
        <div key={i} className="flex items-center gap-2 px-2 py-2">
          <div className="skeleton w-2 h-2 rounded-full" />
          <div className="skeleton w-6 h-6 rounded" />
          <div className="flex-1">
            <div className="skeleton h-3 w-20 mb-1" />
            <div className="skeleton h-2 w-28" />
          </div>
        </div>
      ))}
    </div>
  );
}

interface TreeNode {
  session: SessionInfo;
  children: TreeNode[];
  aggregateCost: number;
  hasActiveChild: boolean;
}

export function Sidebar({ sessions, selectedSession, onSelectSession, loading }: SidebarProps) {
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Build the session tree: parents at top, subagents nested
  const { tree, activeNodes, recentNodes } = useMemo(() => {
    // Index all sessions by id/key
    const byId = new Map<string, SessionInfo>();
    for (const s of sessions) byId.set(s.id, s);

    // Identify parent→children relationships
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

    // Top-level = sessions that are NOT children of another session
    const topLevel = sessions.filter(s => !childIds.has(s.id));

    // Build tree nodes
    function buildNode(s: SessionInfo): TreeNode {
      const kids = (childrenOf.get(s.id) || [])
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      const childNodes = kids.map(buildNode);
      const childCost = childNodes.reduce((sum, c) => sum + c.aggregateCost, 0);
      const isActive = s.status === 'working' || s.status === 'idle';
      const hasActiveChild = isActive || childNodes.some(c => c.hasActiveChild);
      return {
        session: s,
        children: childNodes,
        aggregateCost: s.cost + childCost,
        hasActiveChild,
      };
    }

    const allNodes = topLevel
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .map(buildNode);

    // Split into active (has any active descendant) vs recent
    const activeNodes = allNodes.filter(n => n.hasActiveChild);
    const recentNodes = allNodes.filter(n => !n.hasActiveChild);

    return { tree: allNodes, activeNodes, recentNodes };
  }, [sessions]);

  // Filter by search
  const filteredActive = useMemo(() => {
    if (!search) return activeNodes;
    const q = search.toLowerCase();
    return activeNodes.filter(n => matchesSearch(n, q));
  }, [activeNodes, search]);

  const filteredRecent = useMemo(() => {
    if (!search) return recentNodes;
    const q = search.toLowerCase();
    return recentNodes.filter(n => matchesSearch(n, q));
  }, [recentNodes, search]);

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
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

      {/* Session tree */}
      <div className="flex-1 overflow-y-auto px-1">
        {loading ? (
          <SkeletonSidebar />
        ) : (
          <>
            {filteredActive.length > 0 && (
              <SectionGroup title="Active" count={filteredActive.length}>
                {filteredActive.map(node => (
                  <TreeRow
                    key={node.session.id}
                    node={node}
                    depth={0}
                    selectedSession={selectedSession}
                    collapsed={collapsed}
                    onSelect={onSelectSession}
                    onToggle={toggleCollapse}
                  />
                ))}
              </SectionGroup>
            )}
            {filteredRecent.length > 0 && (
              <SectionGroup title="Recent" count={filteredRecent.length}>
                {filteredRecent.map(node => (
                  <TreeRow
                    key={node.session.id}
                    node={node}
                    depth={0}
                    selectedSession={selectedSession}
                    collapsed={collapsed}
                    onSelect={onSelectSession}
                    onToggle={toggleCollapse}
                  />
                ))}
              </SectionGroup>
            )}
          </>
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

function matchesSearch(node: TreeNode, query: string): boolean {
  const s = node.session;
  if (
    s.agent.toLowerCase().includes(query) ||
    s.label?.toLowerCase().includes(query) ||
    s.subject?.toLowerCase().includes(query) ||
    s.displayName?.toLowerCase().includes(query)
  ) return true;
  return node.children.some(c => matchesSearch(c, query));
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

function TreeRow({
  node, depth, selectedSession, collapsed, onSelect, onToggle,
}: {
  node: TreeNode;
  depth: number;
  selectedSession: string | null;
  collapsed: Set<string>;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const { session, children, aggregateCost } = node;
  const hasChildren = children.length > 0;
  const isCollapsed = collapsed.has(session.id);
  const isSelected = selectedSession === session.id;
  const isActive = session.status === 'working' || session.status === 'idle';
  const dotClass = isActive ? 'status-dot-active' :
                   session.status === 'error' ? 'bg-red-500' : 'bg-zinc-600';

  const displayName = sessionDisplayName(session);
  // For top-level parents, show agent name prominently. For children, show the label.
  const isTopLevel = depth === 0;
  const showAgentAboveLabel = isTopLevel && session.label && session.label !== session.agent;

  return (
    <>
      <div
        className={`group flex items-center gap-1.5 py-1.5 mx-0.5 rounded-md cursor-pointer text-[12px] transition-all duration-150 ${
          isSelected
            ? 'bg-reef-accent-muted text-reef-text-bright ring-1 ring-reef-accent/20'
            : 'hover:bg-reef-border/30 text-reef-text'
        }`}
        style={{ paddingLeft: `${6 + depth * 16}px`, paddingRight: '8px' }}
        onClick={() => onSelect(session.id)}
      >
        {/* Expand/collapse chevron */}
        {hasChildren ? (
          <button
            className="w-4 h-4 flex items-center justify-center text-[9px] text-reef-text-dim hover:text-reef-text shrink-0 transition-colors duration-150"
            onClick={(e) => { e.stopPropagation(); onToggle(session.id); }}
          >
            <svg
              className={`w-3 h-3 transition-transform duration-150 ${isCollapsed ? '' : 'rotate-90'}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        {/* Status dot */}
        <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />

        {/* Emoji */}
        <span className={`shrink-0 ${isTopLevel ? 'text-sm' : 'text-xs'}`}>
          {session.emoji || '🤖'}
        </span>

        {/* Name + label */}
        <div className="flex-1 min-w-0">
          {isTopLevel ? (
            <>
              <div className="flex items-center gap-1.5">
                <span className="truncate font-semibold text-[12px]">{session.agent}</span>
                {hasChildren && (
                  <span className="text-[9px] text-reef-text-muted shrink-0">
                    {children.length}
                  </span>
                )}
              </div>
              {showAgentAboveLabel && (
                <div className="truncate text-[10px] text-reef-text-dim leading-tight">
                  {session.label}
                </div>
              )}
            </>
          ) : (
            <div className="truncate text-[11px]">
              <span className="text-reef-text-dim">{session.emoji ? '' : session.agent + ' · '}</span>
              {displayName}
            </div>
          )}
        </div>

        {/* Aggregate cost for parents, individual for children */}
        <span className={`text-[10px] shrink-0 tabular-nums font-mono ${
          isActive ? 'text-reef-text-dim' : 'text-reef-text-muted'
        }`}>
          {formatCost(isTopLevel ? aggregateCost : session.cost)}
        </span>
      </div>

      {/* Children */}
      {hasChildren && !isCollapsed && (
        <div className="relative">
          {/* Tree line */}
          <div
            className="absolute top-0 bottom-0 border-l border-reef-border/40"
            style={{ left: `${14 + depth * 16}px` }}
          />
          {children.map(child => (
            <TreeRow
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
