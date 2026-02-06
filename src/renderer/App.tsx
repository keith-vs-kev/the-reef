import React, { useState, useEffect, useCallback } from 'react';
import { SessionInfo, AppState } from './types';
import { MOCK_SESSIONS } from './mock-data';
import { parseGatewaySession } from './gateway-utils';
import { TopBar } from './components/TopBar';
import { Sidebar } from './components/Sidebar';
import { ChatView } from './components/ChatView';
import { StatusBar } from './components/StatusBar';
import { CommandPalette } from './components/CommandPalette';
import { ActivityFeed } from './components/ActivityFeed';
import { SpawnModal } from './components/SpawnModal';
import { useToast } from './components/ToastContainer';

export function App() {
  const { addToast } = useToast();
  const [state, setState] = useState<AppState>({
    sessions: [],
    selectedSession: null,
    connectionStatus: 'disconnected',
    gatewayUrl: 'ws://127.0.0.1:18789',
    theme: 'dark',
    totalCost: 0,
    usageCost: null,
  });

  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [spawnOpen, setSpawnOpen] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(true);

  useEffect(() => {
    document.documentElement.className = state.theme;
  }, [state.theme]);

  // Cmd+K command palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen(prev => !prev);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        setSpawnOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const connectGateway = useCallback(async (url: string) => {
    if (!window.reef) {
      setState(prev => ({ ...prev, connectionStatus: 'connected', gatewayUrl: url, sessions: MOCK_SESSIONS }));
      setSessionsLoading(false);
      return;
    }
    setState(prev => ({ ...prev, connectionStatus: 'connecting', gatewayUrl: url }));
    try {
      const result = await window.reef.gateway.connect(url);
      if (result.ok) {
        setState(prev => ({ ...prev, connectionStatus: 'connected' }));
        addToast('Gateway connected', 'success');
        await refreshSessions();
        await refreshUsage();
      } else {
        setState(prev => ({ ...prev, connectionStatus: 'error', sessions: MOCK_SESSIONS }));
        setSessionsLoading(false);
        addToast('Gateway connection failed', 'error');
      }
    } catch {
      setState(prev => ({ ...prev, connectionStatus: 'error', sessions: MOCK_SESSIONS }));
      setSessionsLoading(false);
      addToast('Gateway connection error', 'error');
    }
  }, [addToast]);

  const refreshSessions = useCallback(async () => {
    if (!window.reef) return;
    try {
      const result = await window.reef.gateway.sessions();
      if (result.ok && result.data) {
        const sessions = result.data.map(parseGatewaySession);
        sessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        setState(prev => ({ ...prev, sessions }));
      }
    } catch {}
    setSessionsLoading(false);
  }, []);

  const refreshUsage = useCallback(async () => {
    if (!window.reef) return;
    try {
      const result = await window.reef.gateway.usageCost();
      if (result.ok && result.data) {
        setState(prev => ({
          ...prev,
          usageCost: result.data,
          totalCost: result.data.totals?.totalCost || 0,
        }));
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!window.reef) {
      setState(prev => ({ ...prev, sessions: MOCK_SESSIONS, connectionStatus: 'connected' }));
      setSessionsLoading(false);
      return;
    }
    const unsub1 = window.reef.gateway.onStatus((status: string) => {
      setState(prev => ({ ...prev, connectionStatus: status as AppState['connectionStatus'] }));
      if (status === 'connected') {
        refreshSessions();
        refreshUsage();
        addToast('Gateway reconnected', 'success');
      }
    });
    const unsub2 = window.reef.gateway.onSessionsData((rawSessions: any[]) => {
      const sessions = rawSessions.map(parseGatewaySession);
      sessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      setState(prev => ({ ...prev, sessions, connectionStatus: 'connected' }));
      setSessionsLoading(false);
    });
    const unsub3 = window.reef.gateway.onUsageData((usage: any) => {
      setState(prev => ({ ...prev, usageCost: usage, totalCost: usage?.totals?.totalCost || 0 }));
    });
    return () => { unsub1(); unsub2(); unsub3(); };
  }, [refreshSessions, refreshUsage, addToast]);

  useEffect(() => {
    if (state.connectionStatus !== 'connected') return;
    const interval = setInterval(refreshSessions, 10000);
    return () => clearInterval(interval);
  }, [state.connectionStatus, refreshSessions]);

  // Auto-select first active session on load
  useEffect(() => {
    if (state.sessions.length > 0 && !activeTab) {
      const active = state.sessions.find(s => s.status === 'working' || s.status === 'idle');
      if (active) {
        selectSession(active.id);
      }
    }
  }, [state.sessions]);

  const selectSession = useCallback((sessionId: string) => {
    setState(prev => ({ ...prev, selectedSession: sessionId }));
    if (!openTabs.includes(sessionId)) {
      setOpenTabs(prev => [...prev, sessionId]);
    }
    setActiveTab(sessionId);
  }, [openTabs]);

  const closeTab = useCallback((sessionId: string) => {
    setOpenTabs(prev => {
      const next = prev.filter(id => id !== sessionId);
      if (activeTab === sessionId) {
        setActiveTab(next.length > 0 ? next[next.length - 1] : null);
      }
      return next;
    });
  }, [activeTab]);

  const toggleTheme = useCallback(() => {
    setState(prev => ({ ...prev, theme: prev.theme === 'dark' ? 'light' : 'dark' }));
  }, []);

  const handleSpawn = useCallback(async (task: string, provider: string, model: string) => {
    try {
      const resp = await fetch('http://localhost:7777/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task, provider, model }),
      });
      const data = await resp.json();
      if (data.session) {
        addToast(`Agent spawned (${provider})`, 'success');
        refreshSessions();
      } else {
        addToast(`Spawn failed: ${data.error}`, 'error');
      }
    } catch (err: any) {
      addToast(`Spawn error: ${err.message}`, 'error');
    }
  }, [addToast, refreshSessions]);

  const activeSession = state.sessions.find(s => s.id === activeTab);

  return (
    <div className="flex flex-col h-screen w-screen select-none bg-reef-bg">
      <TopBar
        gatewayUrl={state.gatewayUrl}
        connectionStatus={state.connectionStatus}
        theme={state.theme}
        onConnect={connectGateway}
        onToggleTheme={toggleTheme}
        onOpenPalette={() => setPaletteOpen(true)}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          sessions={state.sessions}
          selectedSession={state.selectedSession}
          onSelectSession={selectSession}
          loading={sessionsLoading}
          onSpawn={() => setSpawnOpen(true)}
        />
        <main className="flex flex-col flex-1 overflow-hidden bg-reef-bg relative">
          {/* Tab bar */}
          {openTabs.length > 0 && (
            <div className="flex bg-reef-bg-elevated border-b border-reef-border overflow-x-auto">
              {openTabs.map(tabId => {
                const session = state.sessions.find(s => s.id === tabId);
                const isActive = tabId === activeTab;
                const isWorking = session?.status === 'working' || session?.status === 'idle';
                return (
                  <div
                    key={tabId}
                    className={`flex items-center gap-1.5 px-3 py-2 text-xs cursor-pointer border-r border-reef-border whitespace-nowrap transition-all duration-150 ${
                      isActive
                        ? 'bg-reef-bg text-reef-text-bright border-b-2 border-b-reef-accent -mb-px'
                        : 'text-reef-text-dim hover:text-reef-text hover:bg-reef-border/20'
                    }`}
                    onClick={() => setActiveTab(tabId)}
                  >
                    {session?.emoji && <span className="text-sm">{session.emoji}</span>}
                    <span className="font-medium">{session?.agent || tabId.split(':')[1]}</span>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      isWorking ? 'status-dot-active' :
                      session?.status === 'error' ? 'bg-red-500' : 'bg-zinc-600'
                    }`} />
                    <button
                      className="ml-1 text-reef-text-muted hover:text-reef-text-bright rounded-sm hover:bg-reef-border/50 w-4 h-4 flex items-center justify-center transition-colors duration-150"
                      onClick={(e) => { e.stopPropagation(); closeTab(tabId); }}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-hidden relative">
            {activeSession ? (
              <ChatView session={activeSession} />
            ) : (
              <ActivityFeed
                sessions={state.sessions}
                connectionStatus={state.connectionStatus}
                onSelectSession={selectSession}
              />
            )}
          </div>
        </main>
      </div>
      <StatusBar
        sessions={state.sessions}
        totalCost={state.totalCost}
        connectionStatus={state.connectionStatus}
        usageCost={state.usageCost}
      />

      {/* Spawn Modal */}
      <SpawnModal
        open={spawnOpen}
        onClose={() => setSpawnOpen(false)}
        onSpawn={handleSpawn}
      />

      {/* Command Palette */}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        sessions={state.sessions}
        onSelectSession={selectSession}
        onToggleTheme={toggleTheme}
        onConnect={connectGateway}
        gatewayUrl={state.gatewayUrl}
      />
    </div>
  );
}
