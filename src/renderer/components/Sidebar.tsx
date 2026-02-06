import React, { useState } from 'react';
import { SessionInfo } from '../types';

interface SidebarProps {
  sessions: SessionInfo[];
  selectedSession: string | null;
  onSelectSession: (id: string) => void;
}

export function Sidebar({ sessions, selectedSession, onSelectSession }: SidebarProps) {
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());

  // Build tree: top-level sessions (no parent) and their subagents
  const topLevel = sessions.filter(s => !s.parentSession);
  const subagentMap = new Map<string, SessionInfo[]>();
  for (const s of sessions) {
    if (s.parentSession) {
      const list = subagentMap.get(s.parentSession) || [];
      list.push(s);
      subagentMap.set(s.parentSession, list);
    }
  }

  const toggleExpand = (id: string) => {
    setExpandedSessions(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="w-60 min-w-[200px] max-w-[320px] bg-reef-sidebar dark:bg-[#252526] border-r border-reef-border flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-reef-text-dim">
        <span>Sessions</span>
        <div className="flex items-center gap-1">
          <button className="hover:text-reef-text-bright" title="Refresh">↻</button>
        </div>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto py-1">
        {topLevel.map(session => {
          const subs = subagentMap.get(session.id) || [];
          const hasSubs = subs.length > 0;
          const isExpanded = expandedSessions.has(session.id) || hasSubs;
          const isSelected = selectedSession === session.id;

          return (
            <div key={session.id}>
              <SessionRow
                session={session}
                isSelected={isSelected}
                hasChildren={hasSubs}
                isExpanded={isExpanded}
                depth={0}
                onClick={() => onSelectSession(session.id)}
                onToggle={() => toggleExpand(session.id)}
              />
              {isExpanded && subs.map(sub => (
                <SessionRow
                  key={sub.id}
                  session={sub}
                  isSelected={selectedSession === sub.id}
                  hasChildren={false}
                  isExpanded={false}
                  depth={1}
                  onClick={() => onSelectSession(sub.id)}
                  onToggle={() => {}}
                />
              ))}
            </div>
          );
        })}
      </div>

      {/* Squad drop zone */}
      <div className="m-2 p-3 border border-dashed border-reef-border rounded-md text-center text-reef-text-dim text-xs">
        <div className="text-lg mb-1">+</div>
        Drag agents here to create a squad
      </div>
    </div>
  );
}

function SessionRow({
  session,
  isSelected,
  hasChildren,
  isExpanded,
  depth,
  onClick,
  onToggle,
}: {
  session: SessionInfo;
  isSelected: boolean;
  hasChildren: boolean;
  isExpanded: boolean;
  depth: number;
  onClick: () => void;
  onToggle: () => void;
}) {
  const statusColor = session.status === 'working' ? 'text-green-400' :
                       session.status === 'idle' ? 'text-yellow-400' :
                       session.status === 'error' ? 'text-red-400' : 'text-gray-500';

  const statusDot = session.status === 'working' ? '●' :
                    session.status === 'idle' ? '●' :
                    session.status === 'error' ? '●' : '○';

  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1 cursor-pointer text-[13px] ${
        isSelected
          ? 'bg-reef-accent/20 text-reef-text-bright'
          : 'hover:bg-[#2a2d2e] text-reef-text'
      }`}
      style={{ paddingLeft: `${8 + depth * 16}px` }}
      onClick={onClick}
    >
      {/* Expand arrow */}
      {hasChildren ? (
        <span
          className="text-[10px] text-reef-text-dim w-3 cursor-pointer"
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
        >
          {isExpanded ? '▼' : '▶'}
        </span>
      ) : (
        <span className="w-3" />
      )}

      {/* Emoji / icon */}
      <span className="text-sm w-5 text-center">{session.emoji || '🤖'}</span>

      {/* Agent name */}
      <span className="flex-1 truncate font-medium">{session.agent}</span>

      {/* Status */}
      <span className={`text-[10px] ${statusColor}`}>{statusDot}</span>
      <span className="text-[10px] text-reef-text-dim">{session.status}</span>

      {/* Cost */}
      <span className="text-[11px] text-reef-text-dim ml-1">${session.cost.toFixed(2)}</span>
    </div>
  );
}
