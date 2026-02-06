import React, { useState, useEffect, useRef, useMemo } from 'react';
import { SessionInfo } from '../types';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  sessions: SessionInfo[];
  onSelectSession: (id: string) => void;
  onToggleTheme: () => void;
  onConnect: (url: string) => void;
  gatewayUrl: string;
}

interface Command {
  id: string;
  label: string;
  description?: string;
  emoji?: string;
  category: 'session' | 'action';
  action: () => void;
}

function fuzzyMatch(query: string, text: string): boolean {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

export function CommandPalette({ open, onClose, sessions, onSelectSession, onToggleTheme, onConnect, gatewayUrl }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const cmds: Command[] = [
      { id: 'theme', label: 'Toggle Theme', description: 'Switch between dark and light', emoji: '🎨', category: 'action', action: () => { onToggleTheme(); onClose(); } },
      { id: 'connect', label: 'Reconnect Gateway', description: gatewayUrl, emoji: '🔌', category: 'action', action: () => { onConnect(gatewayUrl); onClose(); } },
    ];

    for (const s of sessions) {
      cmds.push({
        id: `session:${s.id}`,
        label: `${s.agent}`,
        description: s.label || s.subject || s.id,
        emoji: s.emoji || '🤖',
        category: 'session',
        action: () => { onSelectSession(s.id); onClose(); },
      });
    }

    return cmds;
  }, [sessions, onSelectSession, onToggleTheme, onConnect, onClose, gatewayUrl]);

  const filtered = useMemo(() => {
    if (!query) return commands.slice(0, 20);
    return commands.filter(c =>
      fuzzyMatch(query, c.label) || fuzzyMatch(query, c.description || '')
    ).slice(0, 20);
  }, [commands, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      filtered[selectedIndex].action();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  // Scroll selected into view
  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!open) return null;

  const actionCommands = filtered.filter(c => c.category === 'action');
  const sessionCommands = filtered.filter(c => c.category === 'session');

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] palette-backdrop"
      style={{ background: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-reef-bg-elevated border border-reef-border rounded-xl shadow-2xl overflow-hidden palette-container"
        onClick={e => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-reef-border">
          <svg className="w-4 h-4 text-reef-text-dim shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Search sessions, commands..."
            className="flex-1 bg-transparent text-sm text-reef-text-bright placeholder-reef-text-dim focus:outline-none"
          />
          <kbd className="text-[10px] text-reef-text-muted bg-reef-border/50 px-1.5 py-0.5 rounded font-mono">ESC</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-80 overflow-y-auto py-1">
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-reef-text-dim">
              No results for "{query}"
            </div>
          )}

          {actionCommands.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-reef-text-muted">
                Commands
              </div>
              {actionCommands.map((cmd, i) => {
                const globalIdx = filtered.indexOf(cmd);
                return (
                  <div
                    key={cmd.id}
                    className={`flex items-center gap-3 px-3 py-2 mx-1 rounded-lg cursor-pointer text-sm transition-colors duration-75 ${
                      globalIdx === selectedIndex ? 'bg-reef-accent-muted text-reef-text-bright' : 'text-reef-text hover:bg-reef-border/30'
                    }`}
                    onClick={cmd.action}
                    onMouseEnter={() => setSelectedIndex(globalIdx)}
                  >
                    <span className="text-base w-6 text-center">{cmd.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-[13px]">{cmd.label}</div>
                      {cmd.description && <div className="text-[11px] text-reef-text-dim truncate">{cmd.description}</div>}
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {sessionCommands.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-reef-text-muted mt-1">
                Sessions
              </div>
              {sessionCommands.map(cmd => {
                const globalIdx = filtered.indexOf(cmd);
                return (
                  <div
                    key={cmd.id}
                    className={`flex items-center gap-3 px-3 py-2 mx-1 rounded-lg cursor-pointer text-sm transition-colors duration-75 ${
                      globalIdx === selectedIndex ? 'bg-reef-accent-muted text-reef-text-bright' : 'text-reef-text hover:bg-reef-border/30'
                    }`}
                    onClick={cmd.action}
                    onMouseEnter={() => setSelectedIndex(globalIdx)}
                  >
                    <span className="text-base w-6 text-center">{cmd.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-[13px]">{cmd.label}</div>
                      {cmd.description && <div className="text-[11px] text-reef-text-dim truncate">{cmd.description}</div>}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-3 px-4 py-2 border-t border-reef-border text-[10px] text-reef-text-muted">
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
