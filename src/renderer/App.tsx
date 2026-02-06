import React, { useState, useEffect, useCallback } from 'react';
import { SessionInfo, AppState } from './types';
import { MOCK_SESSIONS } from './mock-data';
import { TopBar } from './components/TopBar';
import { Sidebar } from './components/Sidebar';
import { TerminalView } from './components/TerminalView';
import { StatusBar } from './components/StatusBar';

export function App() {
  const [state, setState] = useState<AppState>({
    sessions: MOCK_SESSIONS,
    selectedSession: null,
    connectionStatus: 'connected',
    gatewayUrl: 'ws://127.0.0.1:18789',
    theme: 'dark',
    totalCost: 0,
  });

  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);

  // Calculate total cost
  useEffect(() => {
    const total = state.sessions.reduce((sum, s) => sum + s.cost, 0);
    setState(prev => ({ ...prev, totalCost: total }));
  }, [state.sessions]);

  // Theme toggling
  useEffect(() => {
    document.documentElement.className = state.theme;
  }, [state.theme]);

  // Connect to gateway (real mode)
  const connectGateway = useCallback(async (url: string) => {
    if (!window.reef) {
      setState(prev => ({ ...prev, connectionStatus: 'connected', gatewayUrl: url }));
      return;
    }
    setState(prev => ({ ...prev, connectionStatus: 'connecting', gatewayUrl: url }));
    try {
      const result = await window.reef.gateway.connect(url);
      if (result.ok) {
        setState(prev => ({ ...prev, connectionStatus: 'connected' }));
      } else {
        setState(prev => ({ ...prev, connectionStatus: 'error' }));
      }
    } catch {
      setState(prev => ({ ...prev, connectionStatus: 'error' }));
    }
  }, []);

  // Listen for session updates from main process
  useEffect(() => {
    if (!window.reef) return;

    const unsub1 = window.reef.gateway.onSessions((sessions: SessionInfo[]) => {
      setState(prev => ({ ...prev, sessions }));
    });

    const unsub2 = window.reef.gateway.onStatus((status: string) => {
      setState(prev => ({
        ...prev,
        connectionStatus: status as AppState['connectionStatus'],
      }));
    });

    return () => { unsub1(); unsub2(); };
  }, []);

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
    <div className="flex flex-col h-screen w-screen select-none">
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
        <main className="flex flex-col flex-1 overflow-hidden">
          {/* Tab bar */}
          {openTabs.length > 0 && (
            <div className="flex bg-reef-bg dark:bg-reef-bg border-b border-reef-border dark:border-reef-border overflow-x-auto">
              {openTabs.map(tabId => {
                const session = state.sessions.find(s => s.id === tabId);
                const isActive = tabId === activeTab;
                return (
                  <div
                    key={tabId}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer border-r border-reef-border whitespace-nowrap ${
                      isActive
                        ? 'bg-reef-bg dark:bg-[#1e1e1e] text-reef-text-bright border-t-2 border-t-reef-accent'
                        : 'bg-reef-sidebar dark:bg-[#2d2d2d] text-reef-text-dim hover:bg-[#2a2a2a]'
                    }`}
                    onClick={() => setActiveTab(tabId)}
                  >
                    {session?.emoji && <span>{session.emoji}</span>}
                    <span>{session?.agent || tabId.split(':')[1]}</span>
                    <StatusDot status={session?.status || 'idle'} />
                    <button
                      className="ml-1 text-reef-text-dim hover:text-reef-text-bright"
                      onClick={(e) => { e.stopPropagation(); closeTab(tabId); }}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Terminal area */}
          <div className="flex-1 overflow-hidden">
            {activeSession ? (
              <TerminalView session={activeSession} />
            ) : (
              <div className="flex items-center justify-center h-full text-reef-text-dim">
                <div className="text-center">
                  <div className="text-6xl mb-4">🐚</div>
                  <div className="text-xl font-light mb-2">The Reef</div>
                  <div className="text-sm">Select a session from the sidebar to view agent activity</div>
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
      />
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const color = status === 'working' ? 'bg-green-500' :
                status === 'idle' ? 'bg-yellow-500' :
                status === 'error' ? 'bg-red-500' : 'bg-gray-500';
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />;
}
