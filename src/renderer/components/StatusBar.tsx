import React from 'react';
import { SessionInfo } from '../types';

interface StatusBarProps {
  sessions: SessionInfo[];
  totalCost: number;
  connectionStatus: string;
}

export function StatusBar({ sessions, totalCost, connectionStatus }: StatusBarProps) {
  const activeSessions = sessions.filter(s => s.status === 'working').length;
  const totalSessions = sessions.length;
  
  // Mock cost rate
  const costRate = 0.12;

  const connectionColor = connectionStatus === 'connected' ? 'text-green-400' :
                          connectionStatus === 'error' ? 'text-red-400' : 'text-gray-400';

  return (
    <div className="flex items-center h-6 px-3 bg-reef-accent dark:bg-[#007acc] text-white text-[11px] gap-4 shrink-0">
      {/* Branch / git info */}
      <div className="flex items-center gap-1">
        <span>⚡</span>
        <span className="font-medium">main</span>
        <span className="opacity-60">⎇ 0 ↓ 0</span>
      </div>

      <div className="flex-1" />

      {/* Cost */}
      <div className="flex items-center gap-1.5">
        <span>🐚</span>
        <span className="font-medium">${totalCost.toFixed(2)}</span>
        <span className="opacity-60">↑${costRate.toFixed(2)}/min</span>
      </div>

      {/* Active sessions */}
      <div className="flex items-center gap-1">
        <span>{activeSessions} agents</span>
      </div>

      {/* Uptime */}
      <div className="flex items-center gap-1 opacity-60">
        <span>⏱ 18m 32s</span>
      </div>
    </div>
  );
}
