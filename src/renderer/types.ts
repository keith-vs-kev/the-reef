export interface SessionInfo {
  id: string;
  key: string;
  agent: string;
  emoji?: string;
  status: 'working' | 'idle' | 'error' | 'stopped';
  model?: string;
  channel?: string;
  cost: number;
  tokenUsage: { input: number; output: number; cacheRead: number; cacheWrite: number };
  startedAt?: string;
  parentSession?: string;
  subagents: string[];
}

export interface AppState {
  sessions: SessionInfo[];
  selectedSession: string | null;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  gatewayUrl: string;
  theme: 'dark' | 'light';
  totalCost: number;
}

declare global {
  interface Window {
    reef: {
      gateway: {
        connect: (url: string, token?: string) => Promise<{ ok: boolean; error?: string }>;
        disconnect: () => Promise<{ ok: boolean }>;
        sessions: () => Promise<{ ok: boolean; data?: SessionInfo[]; error?: string }>;
        send: (sessionId: string, message: string) => Promise<{ ok: boolean; error?: string }>;
        onEvent: (cb: (event: any) => void) => () => void;
        onSessions: (cb: (sessions: SessionInfo[]) => void) => () => void;
        onStatus: (cb: (status: string) => void) => () => void;
      };
    };
  }
}
