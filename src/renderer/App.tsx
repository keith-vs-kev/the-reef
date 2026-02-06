import React, { useState, useEffect, useCallback } from 'react';
import { SessionInfo, AppState } from './types';
import { MOCK_SESSIONS } from './mock-data';
import { parseGatewaySession } from './gateway-utils';
import { TopBar } from './components/TopBar';
import { Sidebar } from './components/Sidebar';
import { TerminalView } from './components/TerminalView';
import { StatusBar } from './components/StatusBar';

export function App() {
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

  useEffect(() => {
    document.documentElement.className = state.theme;
  }, [state.theme]);

  const connectGateway = useCallback(async (url: string) => {
    if (!window.reef) {
      setState(prev => ({ ...prev, connectionStatus: 'connected', gatewayUrl: url, sessions: MOCK_SESSIONS }));
      return;
    }
    setState(prev => ({ ...prev, connectionStatus: 'connecting', gatewayUrl: url }));
    try {
      const result = await window.reef.gateway.connect(url);
      if (result.ok) {
        setState(prev => ({ ...prev, connectionStatus: 'connected' }));
        await refreshSessions();
        await refreshUsage();
      } else {
        setState(prev => ({ ...prev, connectionStatus: 'error', sessions: MOCK_SESSIONS }));
      }
    } catch {
      setState(prev => ({ ...prev, connectionStatus: 'error', sessions: MOCK_SESSIONS }));
    }
  }, []);

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
      return;
    }
    const unsub1 = window.reef.gateway.onStatus((status: string) => {
      setState(prev => ({ ...prev, connectionStatus: status as AppState['connectionStatus'] }));
      if (status === 'connected') { refreshSessions(); refreshUsage(); }
    });
    const unsub2 = window.reef.gateway.onSessionsData((rawSessions: any[]) => {
      const sessions = rawSessions.map(parseGatewaySession);
      sessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      setState(prev => ({ ...prev, sessions, connectionStatus: 'connected' }));
    });
    const unsub3 = window.reef.gateway.onUsageData((usage: any) => {
      setState(prev => ({ ...prev, usageCost: usage, totalCost: usage?.totals?.totalCost || 0 }));
    });
    return () => { unsub1(); unsub2(); unsub3(); };
  }, [refreshSessions, refreshUsage]);

  useEffect(() => {
    if (state.connectionStatus !== 'connected') return;
    const interval = setInterval(refreshSessions, 10000);
    return () => clearInterval(interval);
  }, [state.connectionStatus, refreshSessions]);

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

  const activeSession = state.sessions.find(s => s.id === activeTab);

  return (
    <div className="flex flex-col h-screen w-screen select-none bg-reef-bg">
      <TopBar
        gatewayUrl={state.gatewayUrl}
        connectionStatus={state.connectionStatus}
        theme={state.theme}
        onConnect={connectGateway}
        onToggleTheme={toggleTheme}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          sessions={state.sessions}
          selectedSession={state.selectedSession}
          onSelectSession={selectSession}
        />
        <main className="flex flex-col flex-1 overflow-hidden bg-reef-bg">
          {/* Tab bar */}
          {openTabs.length > 0 && (
            <div className="flex bg-reef-bg-elevated border-b border-reef-border overflow-x-auto">
              {openTabs.map(tabId => {
                const session = state.sessions.find(s => s.id === tabId);
                const isActive = tabId === activeTab;
                return (
                  <div
                    key={tabId}
                    className={`flex items-center gap-1.5 px-3 py-2 text-xs cursor-pointer border-r border-reef-border whitespace-nowrap transition-colors ${
                      isActive
                        ? 'bg-reef-bg text-reef-text-bright border-b-2 border-b-reef-accent -mb-px'
                        : 'text-reef-text-dim hover:text-reef-text hover:bg-reef-border/20'
                    }`}
                    onClick={() => setActiveTab(tabId)}
                  >
                    {session?.emoji && <span className="text-sm">{session.emoji}</span>}
                    <span className="font-medium">{session?.agent || tabId.split(':')[1]}</span>
                    <StatusDot status={session?.status || 'stopped'} />
                    <button
                      className="ml-1 text-reef-text-muted hover:text-reef-text-bright rounded-sm hover:bg-reef-border/50 w-4 h-4 flex items-center justify-center transition-colors"
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
          <div className="flex-1 overflow-hidden">
            {activeSession ? (
              <TerminalView session={activeSession} />
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center animate-fade-in">
                  <div className="text-7xl mb-6 opacity-80">🐚</div>
                  <div className="text-2xl font-light text-reef-text-bright mb-2 tracking-tight">
                    The Reef
                  </div>
                  <div className="text-sm text-reef-text-dim max-w-xs mx-auto leading-relaxed">
                    {state.connectionStatus === 'connected'
                      ? `${state.sessions.length} sessions loaded — select one from the sidebar`
                      : 'Connecting to gateway…'}
                  </div>
                  {state.connectionStatus === 'connecting' && (
                    <div className="mt-6 flex justify-center gap-1">
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
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const color = status === 'working' ? 'bg-emerald-500' :
                status === 'idle' ? 'bg-amber-500' :
                status === 'error' ? 'bg-red-500' : 'bg-zinc-600';
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${color}`} />;
}
