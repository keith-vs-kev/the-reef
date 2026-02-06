/**
 * OpenClaw Gateway API Client
 * 
 * Typed client for interacting with the OpenClaw Gateway HTTP API.
 * All agent session management flows through this client.
 */

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface Session {
  id: string;
  label: string;
  agent: string;
  channel: string;
  status: 'active' | 'idle' | 'stopped';
  createdAt: string;
  tokenUsage: TokenUsage;
  model: string;
}

export interface SpawnOptions {
  agent: string;
  prompt: string;
  channel?: string;
  model?: string;
}

export interface HistoryEntry {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  tokenUsage?: TokenUsage;
}

export interface SessionStatus {
  id: string;
  status: 'active' | 'idle' | 'stopped';
  tokenUsage: TokenUsage;
  model: string;
  uptime: number;
}

export class OpenClawClient {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = token;
  }

  async sessionsList(): Promise<Session[]> {
    return this.request<Session[]>('sessions_list');
  }

  async sessionsSpawn(opts: SpawnOptions): Promise<Session> {
    return this.request<Session>('sessions_spawn', opts);
  }

  async sessionsSend(sessionId: string, message: string): Promise<void> {
    await this.request('sessions_send', { sessionId, message });
  }

  async sessionsHistory(sessionId: string, offset?: number): Promise<HistoryEntry[]> {
    return this.request<HistoryEntry[]>('sessions_history', { sessionId, offset });
  }

  async sessionStatus(sessionId: string): Promise<SessionStatus> {
    return this.request<SessionStatus>('session_status', { sessionId });
  }

  private async request<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${this.baseUrl}/api`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.token ? { 'Authorization': `Bearer ${this.token}` } : {}),
      },
      body: JSON.stringify({ method, params: params ?? {} }),
    });

    if (!response.ok) {
      throw new Error(`OpenClaw API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    if (data.error) {
      throw new Error(`OpenClaw API error: ${data.error.message ?? JSON.stringify(data.error)}`);
    }

    return data.result as T;
  }
}
