import React, { useState, useMemo, useCallback } from 'react';
import { SessionInfo } from '../types';

/* ── helpers ─────────────────────────────────────────── */

function formatCost(cost: number): string {
  if (cost >= 10) return `$${cost.toFixed(0)}`;
  if (cost >= 1) return `$${cost.toFixed(1)}`;
  if (cost >= 0.01) return `$${cost.toFixed(2)}`;
  return '$0.00';
}

function isActive(s: SessionInfo) {
  return s.status === 'working' || s.status === 'idle';
}

function statusLabel(s: SessionInfo): string {
  if (s.status === 'working') return 'active';
  if (s.status === 'idle') return 'idle';
  if (s.status === 'error') return 'error';
  if (s.status === 'thinking') return 'thinking';
  return 'done';
}

function statusColor(s: SessionInfo): string {
  if (s.status === 'working') return 'text-emerald-400';
  if (s.status === 'idle') return 'text-emerald-400/60';
  if (s.status === 'error') return 'text-red-400';
  if (s.status === 'thinking') return 'text-yellow-400';
  return 'text-reef-text-muted';
}

/* ── Project inference from session labels ───────────── */

interface ProjectRule {
  name: string;
  icon: string;
  path?: string;
  keywords: string[];  // match against label, subject, key
}

const PROJECT_RULES: ProjectRule[] = [
  { name: 'The Reef',       icon: '🐚', path: '~/projects/the-reef',           keywords: ['reef', 'sidebar', 'electron-poc', 'the-reef'] },
  { name: 'Nanoclaw',       icon: '🦀', path: '~/projects/nanoclaw',           keywords: ['nanoclaw', 'nano-claw', 'pi-fork', 'reef-core'] },
  { name: 'PR Tracker',     icon: '📋', path: '~/projects/openclaw-tracker',   keywords: ['prtracker', 'pr-tracker', 'tracker'] },
  { name: 'Shootout',       icon: '🎯', path: '~/agents/shared/shootout',      keywords: ['shootout', 'shoot-out', 'benchmark'] },
  { name: 'DroneTrust',     icon: '🚁', path: '~/projects/dronetrust',         keywords: ['dronetrust', 'drone-trust', 'drone'] },
  { name: 'Solta',          icon: '💊', path: '~/projects/solta',              keywords: ['solta', 'solta-code'] },
  { name: 'MongoDojo',      icon: '🥋', path: '~/projects/mongodojo',          keywords: ['mongodojo', 'mongo-dojo', 'mongodojoai'] },
  { name: 'OpenClaw',       icon: '🦞', path: '~/projects/openclaw',           keywords: ['openclaw', 'open-claw', 'clawbot', 'gateway'] },
  { name: 'Holt AI',        icon: '🧠', path: '~/projects/holt-ai',           keywords: ['holt-ai', 'holt ai', 'adam-sim'] },
  { name: 'Crypto',         icon: '₿',  path: '~/projects/crypto',             keywords: ['crypto', 'bitcoin', 'trading'] },
  { name: 'AI Testing',     icon: '🧪', path: '~/projects/ai-testing',         keywords: ['ai-testing', 'testing', 'test-harness'] },
  { name: 'Marketing',      icon: '📈', path: '~/projects/marketing',          keywords: ['marketing', 'bg-market'] },
];

function inferProject(s: SessionInfo): ProjectRule | null {
  const haystack = [
    s.label || '',
    s.subject || '',
    s.displayName || '',
    s.id,
  ].join(' ').toLowerCase();

  for (const rule of PROJECT_RULES) {
    for (const kw of rule.keywords) {
      if (haystack.includes(kw.toLowerCase())) return rule;
    }
  }
  return null;
}

/* ── types ───────────────────────────────────────────── */

interface SessionNode {
  session: SessionInfo;
  children: SessionNode[];   // subagents
}

interface ProjectGroup {
  name: string;
  icon: string;
  path?: string;
  sessions: SessionNode[];
  totalCost: number;
  hasActive: boolean;
  activeCount: number;
  sessionCount: number;
}

/* ── hierarchy builder ───────────────────────────────── */

function buildProjectHierarchy(sessions: SessionInfo[]): ProjectGroup[] {
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

  function nodeActiveCount(n: SessionNode): number {
    return (isActive(n.session) ? 1 : 0) + n.children.reduce((sum, c) => sum + nodeActiveCount(c), 0);
  }

  // Top-level sessions only
  const topLevel = sessions.filter(s => {
    if (childIds.has(s.id)) return false;
    if (s.parentSession && !byId.has(s.parentSession)) return false;
    if (s.id.includes(':subagent:') && !childrenOf.has(s.id)) return false;
    return true;
  });

  // Group by project
  const projectMap = new Map<string, { rule: ProjectRule | null; nodes: SessionNode[] }>();

  for (const s of topLevel) {
    const rule = inferProject(s);
    const key = rule?.name || '__ungrouped__';
    if (!projectMap.has(key)) projectMap.set(key, { rule, nodes: [] });
    projectMap.get(key)!.nodes.push(buildSessionNode(s));
  }

  // Build project groups
  const projects: ProjectGroup[] = [];
  for (const [key, { rule, nodes }] of projectMap) {
    const totalCost = nodes.reduce((sum, n) => sum + nodeCost(n), 0);
    const activeCount = nodes.reduce((sum, n) => sum + nodeActiveCount(n), 0);
    const sessionCount = nodes.reduce((sum, n) => sum + nodeCount(n), 0);

    // Sort sessions within project: active first, then by cost
    nodes.sort((a, b) => {
      const aActive = isActive(a.session) ? 1 : 0;
      const bActive = isActive(b.session) ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;
      return nodeCost(b) - nodeCost(a);
    });

    projects.push({
      name: rule?.name || 'Ungrouped',
      icon: rule?.icon || '📂',
      path: rule?.path,
      sessions: nodes,
      totalCost,
      hasActive: activeCount > 0,
      activeCount,
      sessionCount,
    });
  }

  // Sort projects: active first, then by cost, ungrouped always last
  projects.sort((a, b) => {
    if (a.name === 'Ungrouped') return 1;
    if (b.name === 'Ungrouped') return -1;
    if (a.hasActive !== b.hasActive) return a.hasActive ? -1 : 1;
    return b.totalCost - a.totalCost;
  });

  return projects;
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

function filterProjects(projects: ProjectGroup[], query: string): ProjectGroup[] {
  if (!query) return projects;
  const q = query.toLowerCase();
  return projects
    .map(p => ({
      ...p,
      sessions: p.sessions.filter(n => nodeMatches(n, q)),
    }))
    .filter(p => p.sessions.length > 0 || p.name.toLowerCase().includes(q));
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
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const projects = useMemo(() => buildProjectHierarchy(sessions), [sessions]);
  const filtered = useMemo(() => filterProjects(projects, search), [projects, search]);

  const toggle = useCallback((key: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  const projectCount = projects.filter(p => p.name !== 'Ungrouped').length;

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

      {/* Project tree */}
      <div className="flex-1 overflow-y-auto px-1">
        {loading ? (
          <SkeletonSidebar />
        ) : filtered.length === 0 ? (
          <div className="text-[11px] text-reef-text-dim text-center py-8">No sessions found</div>
        ) : (
          filtered.map(proj => (
            <ProjectRow
              key={proj.name}
              project={proj}
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
          {sessions.length} sessions · {projectCount} project{projectCount !== 1 ? 's' : ''}
        </div>
      </div>
    </div>
  );
}

/* ── Project row ─────────────────────────────────────── */

function ProjectRow({ project, collapsed, selectedSession, onToggle, onSelect }: {
  project: ProjectGroup;
  collapsed: Set<string>;
  selectedSession: string | null;
  onToggle: (key: string) => void;
  onSelect: (id: string) => void;
}) {
  const key = `project:${project.name}`;
  const isOpen = !collapsed.has(key);

  return (
    <div className="mb-0.5">
      {/* Project header */}
      <button
        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-semibold text-reef-text hover:bg-reef-border/20 rounded-md transition-colors duration-150"
        onClick={() => onToggle(key)}
      >
        <span className="w-4 h-4 flex items-center justify-center text-reef-text-dim">
          <Chevron open={isOpen} />
        </span>
        <span className="text-sm">{project.icon}</span>
        <div className="flex-1 text-left min-w-0">
          <div className="truncate">{project.name}</div>
          {project.path && (
            <div className="text-[9px] text-reef-text-muted font-normal truncate">{project.path}</div>
          )}
        </div>
        {project.hasActive && (
          <span className="w-1.5 h-1.5 rounded-full status-dot-active shrink-0" />
        )}
        {project.activeCount > 0 && (
          <span className="text-[9px] text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded-full tabular-nums font-medium shrink-0">
            {project.activeCount} active
          </span>
        )}
        <span className="text-[10px] text-reef-text-dim font-mono tabular-nums shrink-0">
          {formatCost(project.totalCost)}
        </span>
      </button>

      {/* Sessions within project */}
      {isOpen && (
        <div className="relative ml-1">
          <div
            className="absolute top-0 bottom-0 border-l border-reef-border/30"
            style={{ left: '14px' }}
          />
          {project.sessions.map(node => (
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

  const label = session.label || '';
  const status = statusLabel(session);
  const baseLeft = 20 + depth * 14;

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
            <span className={`text-[8px] font-medium uppercase tracking-wide ${statusColor(session)}`}>
              {status}
            </span>
          </div>
          {label && label !== session.agent && (
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
