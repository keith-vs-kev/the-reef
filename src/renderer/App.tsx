import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SessionInfo, AppState, LiveEvent } from './types';
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

  // Live actions per session (from event subscriptions)
  const liveActionsRef = useRef<Map<string, LiveEvent['action'][]>>(new Map());

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

  // Listen for pushed data + live events
  useEffect(() => {
    if (!window.reef) {
      setState(prev => ({ ...prev, sessions: MOCK_SESSIONS, connectionStatus: 'connected' }));
      return;
    }

    const unsub1 = window.reef.gateway.onStatus((status: string) => {
      setState(prev => ({
        ...prev,
        connectionStatus: status as AppState['connectionStatus'],
      }));
      if (status === 'connected') {
        refreshSessions();
        refreshUsage();
      }
    });

    const unsub2 = window.reef.gateway.onSessionsData((rawSessions: any[]) => {
      const sessions = rawSessions.map(parseGatewaySession);
      sessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      setState(prev => ({ ...prev, sessions, connectionStatus: 'connected' }));
    });

    const unsub3 = window.reef.gateway.onUsageData((usage: any) => {
      setState(prev => ({
        ...prev,
        usageCost: usage,
        totalCost: usage?.totals?.totalCost || 0,
      }));
    });

    // Live event subscription — update session status in real-time
    // Following Crabwalk's pattern: events update session status + build action nodes per runId
    const unsub4 = window.reef.gateway.onLiveEvent((parsed: LiveEvent) => {
      if (parsed.session) {
        setState(prev => {
          const sessions = prev.sessions.map(s => {
            if (s.key !== parsed.session!.key) return s;
            // Map monitor status to our status
            let status = s.status;
            if (parsed.session!.status === 'thinking') status = 'working';
            else if (parsed.session!.status === 'active') status = 'idle';
            return {
              ...s,
              status,
              updatedAt: parsed.session!.lastActivityAt || s.updatedAt,
            };
          });
          return { ...prev, sessions };
        });
      }

      // Track live actions per session (unified per runId)
      if (parsed.action) {
        const sessionKey = parsed.action.sessionKey;
        const actions = liveActionsRef.current.get(sessionKey) || [];
        // Unified node per runId: update existing or add new
        const actionNodeId = `${parsed.action.runId}-action`;
        const idx = actions.findIndex(a => a!.id === actionNodeId || a!.runId === parsed.action!.runId);
        const unified = { ...parsed.action, id: actionNodeId };
        if (idx >= 0) {
          actions[idx] = unified;
        } else {
          // Tool calls/results get separate nodes
          if (parsed.action.type === 'tool_call' || parsed.action.type === 'tool_result') {
            actions.push(parsed.action);
          } else {
            actions.push(unified);
          }
        }
        liveActionsRef.current.set(sessionKey, actions);
      }
    });

    return () => { unsub1(); unsub2(); unsub3(); unsub4(); };
  }, [refreshSessions, refreshUsage]);

  // Periodic refresh
  useEffect(() => {
    if (state.connectionStatus !== 'connected') return;
    const interval = setInterval(() => { refreshSessions(); }, 10000);
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
          <div className="flex-1 overflow-hidden">
            {activeSession ? (
              <TerminalView session={activeSession} />
            ) : (
              <div className="flex items-center justify-center h-full text-reef-text-dim">
                <div className="text-center">
                  <div className="text-6xl mb-4">🐚</div>
                  <div className="text-xl font-light mb-2">The Reef</div>
                  <div className="text-sm">
                    {state.connectionStatus === 'connected'
                      ? `${state.sessions.length} sessions loaded — select one from the sidebar`
                      : 'Connecting to gateway...'}
                  </div>
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
  const color = status === 'working' || status === 'thinking' ? 'bg-green-500' :
                status === 'idle' || status === 'active' ? 'bg-yellow-500' :
                status === 'error' ? 'bg-red-500' : 'bg-gray-500';
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />;
}
