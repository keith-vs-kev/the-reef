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

  return (
    <div className="flex items-center h-10 px-4 bg-reef-sidebar dark:bg-[#323233] border-b border-reef-border drag-region">
      {/* App title */}
      <div className="flex items-center gap-2 mr-6 no-drag">
        <span className="text-lg">🐚</span>
        <span className="text-sm font-semibold text-reef-text-bright tracking-wide">The Reef</span>
      </div>

      {/* Gateway URL input */}
      <div className="flex items-center gap-2 flex-1 max-w-md no-drag">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onConnect(url)}
          placeholder="Gateway URL..."
          className="flex-1 h-6 px-2 text-xs bg-reef-bg dark:bg-[#3c3c3c] border border-reef-border rounded text-reef-text placeholder-reef-text-dim focus:border-reef-accent focus:outline-none"
        />
        <button
          onClick={() => onConnect(url)}
          className={`h-6 px-3 text-xs rounded font-medium ${
            connectionStatus === 'connected'
              ? 'bg-reef-success/20 text-reef-success border border-reef-success/30'
              : 'bg-reef-accent text-white hover:bg-reef-accent-hover'
          }`}
        >
          {connectionStatus === 'connected' ? '● Connected' :
           connectionStatus === 'connecting' ? '○ Connecting...' :
           connectionStatus === 'error' ? '● Error' : 'Connect'}
        </button>
      </div>

      <div className="flex-1" />

      {/* Theme toggle */}
      <button
        onClick={onToggleTheme}
        className="no-drag w-7 h-7 flex items-center justify-center rounded hover:bg-reef-border text-reef-text-dim hover:text-reef-text-bright"
        title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      >
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>
    </div>
  );
}
