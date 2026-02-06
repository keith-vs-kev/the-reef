import React, { useState } from 'react';

interface TopBarProps {
  gatewayUrl: string;
  connectionStatus: string;
  theme: 'dark' | 'light';
  onConnect: (url: string) => void;
  onToggleTheme: () => void;
}

export function TopBar({ gatewayUrl, connectionStatus, theme, onConnect, onToggleTheme }: TopBarProps) {
  const [url, setUrl] = useState(gatewayUrl);

  const statusConfig = {
    connected: { dot: 'bg-emerald-500', text: 'Connected', ring: 'ring-emerald-500/20' },
    connecting: { dot: 'bg-amber-500 animate-pulse', text: 'Connecting...', ring: 'ring-amber-500/20' },
    error: { dot: 'bg-red-500', text: 'Error', ring: 'ring-red-500/20' },
    disconnected: { dot: 'bg-zinc-500', text: 'Disconnected', ring: 'ring-zinc-500/20' },
  };
  const status = statusConfig[connectionStatus as keyof typeof statusConfig] || statusConfig.disconnected;

  return (
    <div className="flex items-center h-12 px-4 bg-reef-sidebar border-b border-reef-border drag-region">
      {/* App branding */}
      <div className="flex items-center gap-2.5 mr-8 no-drag">
        <span className="text-xl">🐚</span>
        <span className="text-sm font-semibold text-reef-text-bright tracking-tight">
          The Reef
        </span>
        <span className="text-[10px] text-reef-text-dim font-medium bg-reef-accent-muted text-reef-accent px-1.5 py-0.5 rounded-full">
          POC
        </span>
      </div>

      {/* Gateway URL input */}
      <div className="flex items-center gap-2 flex-1 max-w-lg no-drag">
        <div className="relative flex-1">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onConnect(url)}
            placeholder="ws://gateway-url..."
            className="w-full h-8 pl-3 pr-3 text-xs bg-reef-bg border border-reef-border rounded-lg text-reef-text-bright placeholder-reef-text-dim focus:border-reef-accent focus:ring-1 focus:ring-reef-accent/30 focus:outline-none transition-all font-mono"
          />
        </div>
        <button
          onClick={() => onConnect(url)}
          className={`h-8 px-3 text-xs rounded-lg font-medium flex items-center gap-1.5 transition-all ring-1 ${
            connectionStatus === 'connected'
              ? `bg-emerald-500/10 text-emerald-400 ${status.ring}`
              : 'bg-reef-accent text-white hover:bg-reef-accent-hover ring-reef-accent/30'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
          <span>{status.text}</span>
        </button>
      </div>

      <div className="flex-1" />

      {/* Theme toggle */}
      <button
        onClick={onToggleTheme}
        className="no-drag w-8 h-8 flex items-center justify-center rounded-lg hover:bg-reef-border/50 text-reef-text-dim hover:text-reef-text-bright transition-colors"
        title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      >
        <span className="text-sm">{theme === 'dark' ? '☀️' : '🌙'}</span>
      </button>
    </div>
  );
}
