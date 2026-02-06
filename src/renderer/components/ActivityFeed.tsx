import React from 'react';
import { SessionInfo } from '../types';

interface ActivityFeedProps {
  sessions: SessionInfo[];
  connectionStatus: string;
  onSelectSession: (id: string) => void;
}

function timeAgo(ts?: number | string): string {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function ActivityFeed({ sessions, connectionStatus, onSelectSession }: ActivityFeedProps) {
  const activeSessions = sessions.filter(s => s.status === 'working' || s.status === 'idle');
  const recentSessions = sessions
    .filter(s => s.status === 'stopped' || s.status === 'error')
    .slice(0, 8);

  return (
    <div className="flex items-center justify-center h-full">
      <div className="w-full max-w-lg animate-fade-in px-6">
        {/* Hero */}
        <div className="text-center mb-10">
          <div className="text-6xl mb-4 opacity-90">🐚</div>
          <h1 className="text-2xl font-semibold text-reef-text-bright tracking-tight mb-1">
            The Reef
          </h1>
          <p className="text-sm text-reef-text-dim">
            {connectionStatus === 'connected'
              ? `${sessions.length} sessions · ${activeSessions.length} active`
              : 'Connecting to gateway…'}
          </p>
          <p className="text-[11px] text-reef-text-muted mt-2">
            Press <kbd className="bg-reef-border/50 px-1.5 py-0.5 rounded font-mono text-[10px]">⌘K</kbd> to search
          </p>
        </div>

        {/* Active agents */}
        {activeSessions.length > 0 && (
          <div className="mb-6">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-reef-text-dim mb-2 px-1">
              Active Now
            </h2>
            <div className="space-y-1">
              {activeSessions.map(s => (
                <button
                  key={s.id}
                  onClick={() => onSelectSession(s.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-transparent hover:bg-reef-border/20 hover:border-reef-border transition-all duration-150 text-left group"
                >
                  <span className="text-xl">{s.emoji || '🤖'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-reef-text-bright">{s.agent}</span>
                      <span className="w-2 h-2 rounded-full status-dot-active" />
                    </div>
                    {(s.label || s.subject) && (
                      <div className="text-[11px] text-reef-text-dim truncate">{s.label || s.subject}</div>
                    )}
                  </div>
                  {s.model && (
                    <span className="text-[10px] font-mono text-reef-text-muted">{s.model}</span>
                  )}
                  <svg className="w-4 h-4 text-reef-text-muted opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Recent completions */}
        {recentSessions.length > 0 && (
          <div>
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-reef-text-dim mb-2 px-1">
              Recent
            </h2>
            <div className="space-y-0.5">
              {recentSessions.map(s => (
                <button
                  key={s.id}
                  onClick={() => onSelectSession(s.id)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-reef-border/20 transition-colors duration-150 text-left"
                >
                  <span className="text-base opacity-60">{s.emoji || '🤖'}</span>
                  <span className="text-[12px] text-reef-text-dim flex-1 truncate">{s.agent}</span>
                  {s.status === 'error' && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
                  <span className="text-[10px] text-reef-text-muted">{timeAgo(s.updatedAt || s.startedAt)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {connectionStatus === 'connecting' && (
          <div className="flex justify-center gap-1 mt-8">
            {[0, 1, 2].map(i => (
              <div
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-reef-accent animate-pulse"
                style={{ animationDelay: `${i * 200}ms` }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
