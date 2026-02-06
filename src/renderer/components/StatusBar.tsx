import React from 'react';
import { SessionInfo } from '../types';

interface StatusBarProps {
  sessions: SessionInfo[];
  totalCost: number;
  connectionStatus: string;
  usageCost?: any;
}

export function StatusBar({ sessions, totalCost, connectionStatus, usageCost }: StatusBarProps) {
  const activeSessions = sessions.filter(s => s.status === 'working').length;
  const totalSessions = sessions.length;

  // Today's cost from usage data
  const today = new Date().toISOString().split('T')[0];
  const todayCost = usageCost?.daily?.find((d: any) => d.date === today)?.totalCost || 0;

  const connectionColor = connectionStatus === 'connected' ? 'text-green-400' :
                          connectionStatus === 'error' ? 'text-red-400' : 'text-gray-400';

  const totalTokens = usageCost?.totals?.totalTokens || 0;

  return (
    <div className="flex items-center h-6 px-3 bg-reef-accent dark:bg-[#007acc] text-white text-[11px] gap-4 shrink-0">
      {/* Connection status */}
      <div className="flex items-center gap-1">
        <span className={connectionStatus === 'connected' ? '' : 'opacity-60'}>
          {connectionStatus === 'connected' ? '⚡' : connectionStatus === 'error' ? '⚠️' : '○'}
        </span>
        <span className="font-medium">
          {connectionStatus === 'connected' ? 'Gateway' : connectionStatus}
        </span>
      </div>

      <div className="flex-1" />

      {/* Today's cost */}
      {todayCost > 0 && (
        <div className="flex items-center gap-1">
          <span>📅</span>
          <span>Today: ${todayCost.toFixed(2)}</span>
        </div>
      )}

      {/* Total cost (30d) */}
      <div className="flex items-center gap-1.5">
        <span>🐚</span>
        <span className="font-medium">${totalCost.toFixed(2)}</span>
        <span className="opacity-60">30d</span>
      </div>

      {/* Total tokens */}
      {totalTokens > 0 && (
        <div className="flex items-center gap-1 opacity-80">
          <span>{(totalTokens / 1_000_000).toFixed(1)}M tokens</span>
        </div>
      )}

      {/* Sessions */}
      <div className="flex items-center gap-1">
        <span>{activeSessions > 0 ? `${activeSessions} active` : `${totalSessions} sessions`}</span>
      </div>
    </div>
  );
}
