export interface SessionInfo {
  id: string;
  key: string;
  agent: string;
  emoji?: string;
  status: 'working' | 'idle' | 'error' | 'stopped' | 'thinking';
  model?: string;
  channel?: string;
  cost: number;
  tokenUsage: { input: number; output: number; cacheRead: number; cacheWrite: number };
  startedAt?: string;
  parentSession?: string;
  subagents: string[];
  label?: string;
  subject?: string;
  displayName?: string;
  updatedAt?: number;
  totalTokens?: number;
  platform?: string;
  recipient?: string;
  isGroup?: boolean;
}

export interface ChatMessage {
  role: string;
  content: any[];
  timestamp?: number;
  api?: string;
  provider?: string;
  model?: string;
  usage?: any;
  stopReason?: string;
  toolCallId?: string;
  toolName?: string;
  isError?: boolean;
}

// Parsed live event from gateway (MonitorAction + session update)
export interface LiveEvent {
  session?: {
    key: string;
    status?: 'idle' | 'active' | 'thinking';
    lastActivityAt?: number;
  };
  action?: {
    id: string;
    runId: string;
    sessionKey: string;
    seq: number;
    type: 'start' | 'streaming' | 'complete' | 'aborted' | 'error' | 'tool_call' | 'tool_result';
    eventType: 'chat' | 'agent' | 'system';
    timestamp: number;
    content?: string;
    toolName?: string;
    toolArgs?: unknown;
    startedAt?: number;
    endedAt?: number;
    inputTokens?: number;
    outputTokens?: number;
    stopReason?: string;
  };
}

export interface AppState {
  sessions: SessionInfo[];
  selectedSession: string | null;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  gatewayUrl: string;
  theme: 'dark' | 'light';
  totalCost: number;
  usageCost: any | null;
}

declare global {
  interface Window {
    reef: {
      gateway: {
        connect: (url: string, token?: string) => Promise<{ ok: boolean; error?: string }>;
        disconnect: () => Promise<{ ok: boolean }>;
        sessions: () => Promise<{ ok: boolean; data?: any[]; error?: string }>;
        chatHistory: (sessionKey: string, limit?: number) => Promise<{ ok: boolean; data?: ChatMessage[]; error?: string }>;
        usageCost: () => Promise<{ ok: boolean; data?: any; error?: string }>;
        gatewayStatus: () => Promise<{ ok: boolean; data?: any; error?: string }>;
        send: (sessionId: string, message: string) => Promise<{ ok: boolean; error?: string }>;
        onEvent: (cb: (event: any) => void) => () => void;
        onLiveEvent: (cb: (parsed: LiveEvent) => void) => () => void;
        onSessionsData: (cb: (sessions: any[]) => void) => () => void;
        onUsageData: (cb: (usage: any) => void) => () => void;
        onStatus: (cb: (status: string) => void) => () => void;
      };
    };
  }
}
