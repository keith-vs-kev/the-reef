import WebSocket from 'ws';
import { createHash, randomBytes } from 'crypto';

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

type EventCallback = (event: any) => void;
type SessionsCallback = (sessions: SessionInfo[]) => void;
type StatusCallback = (status: string) => void;

export class GatewayClient {
  private ws: WebSocket | null = null;
  private url: string;
  private token?: string;
  private sessions: Map<string, SessionInfo> = new Map();
  private eventListeners: EventCallback[] = [];
  private sessionsListeners: SessionsCallback[] = [];
  private statusListeners: StatusCallback[] = [];
  private pollInterval: NodeJS.Timeout | null = null;
  private requestId = 0;
  private pendingRequests: Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }> = new Map();

  constructor(url: string, token?: string) {
    this.url = url.replace(/^http/, 'ws');
    this.token = token;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = this.url.replace(/\/$/, '');
      this.ws = new WebSocket(wsUrl);

      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
        this.ws?.close();
      }, 10000);

      this.ws.on('open', async () => {
        clearTimeout(timeout);
        this.emitStatus('connecting');
        try {
          await this.authenticate();
          this.emitStatus('connected');
          this.startPolling();
          resolve();
        } catch (err) {
          reject(err);
        }
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const msg = JSON.parse(data.toString());
          this.handleMessage(msg);
        } catch {}
      });

      this.ws.on('close', () => {
        this.emitStatus('disconnected');
        this.stopPolling();
      });

      this.ws.on('error', (err: Error) => {
        clearTimeout(timeout);
        this.emitStatus('error');
        reject(err);
      });
    });
  }

  private async authenticate(): Promise<void> {
    const connectParams = {
      role: 'operator',
      scopes: ['operator.read'],
      mode: 'cli',
      clientVersion: '1.0.0',
      clientName: 'the-reef',
    };

    const response = await this.request('connect', connectParams);
    
    if (response?.challenge) {
      // Challenge-response auth
      const hash = createHash('sha256');
      hash.update(response.challenge + (this.token || ''));
      const challengeResponse = hash.digest('hex');
      await this.request('challenge-response', { response: challengeResponse });
    }
  }

  private request(method: string, params?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = ++this.requestId;
      this.pendingRequests.set(id, { resolve, reject });
      
      const msg = JSON.stringify({ id, method, params });
      this.ws?.send(msg);

      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request ${method} timed out`));
        }
      }, 30000);
    });
  }

  private handleMessage(msg: any) {
    // Response to a request
    if (msg.id && this.pendingRequests.has(msg.id)) {
      const { resolve, reject } = this.pendingRequests.get(msg.id)!;
      this.pendingRequests.delete(msg.id);
      if (msg.error) {
        reject(new Error(msg.error.message || msg.error));
      } else {
        resolve(msg.result || msg);
      }
      return;
    }

    // Event
    if (msg.method === 'event' || msg.type === 'event') {
      const event = msg.params || msg;
      this.handleEvent(event);
    }
  }

  private handleEvent(event: any) {
    for (const cb of this.eventListeners) cb(event);
    
    // Update session status from events
    if (event.sessionKey) {
      const session = this.sessions.get(event.sessionKey);
      if (session) {
        if (event.type === 'agent' && event.event === 'end') {
          session.status = 'idle';
        } else if (event.type === 'agent' || event.type === 'chat') {
          session.status = 'working';
        }
        this.emitSessions();
      }
    }
  }

  async listSessions(): Promise<SessionInfo[]> {
    try {
      const result = await this.request('sessions.list', {});
      const sessions: SessionInfo[] = [];

      if (result?.sessions) {
        for (const s of result.sessions) {
          const parsed = this.parseSession(s);
          this.sessions.set(parsed.id, parsed);
          sessions.push(parsed);
        }
      }

      // Build subagent tree
      this.buildSubagentTree();
      
      return Array.from(this.sessions.values());
    } catch {
      return Array.from(this.sessions.values());
    }
  }

  private parseSession(raw: any): SessionInfo {
    const key = raw.key || raw.id || '';
    const parts = key.split(':');
    const agent = parts[1] || 'unknown';
    
    const existing = this.sessions.get(key);
    
    return {
      id: key,
      key,
      agent,
      emoji: raw.emoji || existing?.emoji,
      status: raw.status || existing?.status || 'idle',
      model: raw.model || existing?.model,
      channel: raw.channel || parts[2],
      cost: raw.cost || existing?.cost || 0,
      tokenUsage: raw.tokenUsage || existing?.tokenUsage || { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      startedAt: raw.startedAt || existing?.startedAt,
      parentSession: raw.parentSession || (key.includes('subagent') ? this.inferParent(key) : undefined),
      subagents: existing?.subagents || [],
    };
  }

  private inferParent(key: string): string | undefined {
    // Subagent keys contain 'subagent' — try to find the parent
    for (const [id, session] of this.sessions) {
      if (id !== key && !id.includes('subagent') && session.agent === key.split(':')[1]?.split('.')[0]) {
        return id;
      }
    }
    return undefined;
  }

  private buildSubagentTree() {
    // Reset subagents
    for (const session of this.sessions.values()) {
      session.subagents = [];
    }
    
    for (const session of this.sessions.values()) {
      if (session.parentSession && this.sessions.has(session.parentSession)) {
        this.sessions.get(session.parentSession)!.subagents.push(session.id);
      }
    }
  }

  async sendMessage(sessionId: string, message: string): Promise<void> {
    await this.request('sessions.send', { sessionId, message });
  }

  private startPolling() {
    this.pollInterval = setInterval(async () => {
      await this.listSessions();
      this.emitSessions();
    }, 5000);
  }

  private stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  disconnect() {
    this.stopPolling();
    this.ws?.close();
    this.ws = null;
    this.sessions.clear();
    this.emitStatus('disconnected');
  }

  onEvent(cb: EventCallback) { this.eventListeners.push(cb); }
  onSessionsUpdate(cb: SessionsCallback) { this.sessionsListeners.push(cb); }
  onConnectionChange(cb: StatusCallback) { this.statusListeners.push(cb); }

  private emitSessions() {
    const sessions = Array.from(this.sessions.values());
    for (const cb of this.sessionsListeners) cb(sessions);
  }

  private emitStatus(status: string) {
    for (const cb of this.statusListeners) cb(status);
  }
}
