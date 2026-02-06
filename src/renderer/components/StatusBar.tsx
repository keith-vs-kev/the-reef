import React from 'react';
import { SessionInfo } from '../types';

interface StatusBarProps {
  sessions: SessionInfo[];
  totalCost: number;
  connectionStatus: string;
  usageCost?: any;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export function StatusBar({ sessions, totalCost, connectionStatus, usageCost }: StatusBarProps) {
  const activeSessions = sessions.filter(s => s.status === 'working').length;
  const totalSessions = sessions.length;
  const totalTokens = usageCost?.totals?.totalTokens || 0;

  const today = new Date().toISOString().split('T')[0];
  const todayCost = usageCost?.daily?.find((d: any) => d.date === today)?.totalCost || 0;

  // "Burning fast" if today's cost > $5
  const isBurning = todayCost > 5;

  return (
    <div className="flex items-center h-7 px-3 bg-reef-bg-elevated border-t border-reef-border text-[11px] gap-1 shrink-0 select-none">
      {/* Connection status */}
      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded">
        <span className={`w-1.5 h-1.5 rounded-full ${
          connectionStatus === 'connected' ? 'bg-emerald-500' :
          connectionStatus === 'error' ? 'bg-red-500' : 'bg-zinc-500'
        }`} />
        <span className="text-reef-text-dim font-medium">
          {connectionStatus === 'connected' ? 'Gateway' : connectionStatus}
        </span>
      </div>

      {/* Active sessions */}
      {activeSessions > 0 && (
        <div className="flex items-center gap-1 px-2 py-0.5 text-emerald-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-medium">{activeSessions} active</span>
        </div>
      )}

      <div className="flex-1" />

      {/* Today's cost */}
      {todayCost > 0 && (
        <div className="flex items-center gap-1 px-2 py-0.5 text-reef-text-dim">
          <span>Today</span>
          <span className={`font-mono font-medium ${isBurning ? 'text-orange-400' : 'text-reef-text'}`}>
            {isBurning && '🔥'} ${todayCost.toFixed(2)}
          </span>
        </div>
      )}

      {/* Separator */}
      <span className="text-reef-border">·</span>

      {/* 30d cost */}
      <div className="flex items-center gap-1 px-2 py-0.5 text-reef-text-dim">
        <span>30d</span>
        <span className="font-mono font-medium text-reef-text">${totalCost.toFixed(2)}</span>
      </div>

      {/* Tokens */}
      {totalTokens > 0 && (
        <>
          <span className="text-reef-border">·</span>
          <div className="flex items-center gap-1 px-2 py-0.5 text-reef-text-dim">
            <span className="font-mono">{formatTokens(totalTokens)}</span>
            <span>tokens</span>
          </div>
        </>
      )}

      {/* Session count */}
      <span className="text-reef-border">·</span>
      <div className="flex items-center gap-1 px-2 py-0.5 text-reef-text-dim">
        <span className="font-mono">{totalSessions}</span>
        <span>sessions</span>
      </div>
    </div>
  );
}
