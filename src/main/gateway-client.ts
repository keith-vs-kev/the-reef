// Gateway client adopted from Crabwalk's ClawdbotClient pattern
// WebSocket protocol v3, challenge-response auth, event subscriptions

import WebSocket from 'ws';
import {
  type GatewayFrame,
  type RequestFrame,
  type ResponseFrame,
  type EventFrame,
  type HelloOk,
  type ChatEvent,
  type AgentEvent,
  type MonitorSession,
  type MonitorAction,
  createConnectParams,
  parseSessionKey,
} from './protocol';

type EventCallback = (event: EventFrame) => void;
type StatusCallback = (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void;

interface ChallengePayload {
  nonce: string;
  ts: number;
}

export class GatewayClient {
  private ws: WebSocket | null = null;
  private requestId = 0;
  private pendingRequests = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private eventListeners: EventCallback[] = [];
  private statusListeners: StatusCallback[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _connected = false;
  private _connecting = false;

  // runId → sessionKey mapping (learned from chat/agent events)
  private runSessionMap = new Map<string, string>();
  // Unified action nodes per runId
  private actions = new Map<string, MonitorAction>();

  constructor(
    private url: string,
    private token?: string,
  ) {}

  get connected() { return this._connected; }

  async connect(): Promise<HelloOk> {
    if (this._connecting || this._connected) {
      return { type: 'hello-ok', protocol: 3 } as HelloOk;
    }
    this._connecting = true;
    this.emitStatus('connecting');

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this._connecting = false;
        this.ws?.close();
        this.emitStatus('error');
        reject(new Error('Connection timeout — is openclaw gateway running?'));
      }, 10000);

      try {
        this.ws = new WebSocket(this.url);
      } catch (e) {
        clearTimeout(timeout);
        this._connecting = false;
        this.emitStatus('error');
        reject(new Error(`Failed to create WebSocket: ${e}`));
        return;
      }

      this.ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());

          // Challenge-response auth flow
          if (msg.type === 'event' && msg.event === 'connect.challenge') {
            this.handleChallenge(msg.payload as ChallengePayload);
            return;
          }

          // Handle connect response (hello-ok)
          if (msg.type === 'res' && msg.ok && (msg.payload as HelloOk)?.type === 'hello-ok') {
            clearTimeout(timeout);
            this._connected = true;
            this._connecting = false;
            this.emitStatus('connected');
            resolve(msg.payload as HelloOk);
            return;
          }

          // Handle connect error
          if (msg.type === 'res' && msg.ok === false && this._connecting) {
            clearTimeout(timeout);
            this._connecting = false;
            this.emitStatus('error');
            reject(new Error(msg.error?.message || 'Connect failed'));
            return;
          }

          // Normal message handling (post-connect)
          if (this._connected) {
            this.handleMessage(msg);
          }
        } catch {}
      });

      this.ws.on('error', (err) => {
        clearTimeout(timeout);
        this._connecting = false;
        this.emitStatus('error');
        reject(err);
      });

      this.ws.on('close', (code) => {
        clearTimeout(timeout);
        const wasConnected = this._connected;
        this._connected = false;
        this._connecting = false;
        this.emitStatus('disconnected');
        // Auto-reconnect if was connected and not clean close
        if (wasConnected && code !== 1000) {
          this.scheduleReconnect();
        }
      });
    });
  }

  private handleChallenge(_challenge: ChallengePayload) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const params = createConnectParams(this.token);
    const req: RequestFrame = {
      type: 'req',
      id: `connect-${Date.now()}`,
      method: 'connect',
      params,
    };
    this.ws.send(JSON.stringify(req));
  }

  private handleMessage(msg: GatewayFrame) {
    switch (msg.type) {
      case 'res':
        this.handleResponse(msg as ResponseFrame);
        break;
      case 'event':
        this.handleEvent(msg as EventFrame);
        break;
    }
  }

  private handleResponse(res: ResponseFrame) {
    const pending = this.pendingRequests.get(res.id);
    if (pending) {
      this.pendingRequests.delete(res.id);
      if (res.ok) {
        pending.resolve(res.payload);
      } else {
        pending.reject(new Error(res.error?.message || 'Request failed'));
      }
    }
  }

  private handleEvent(event: EventFrame) {
    // Learn runId → sessionKey from chat/agent events
    if (event.event === 'chat' && event.payload) {
      const chat = event.payload as ChatEvent;
      if (chat.runId && chat.sessionKey) {
        this.runSessionMap.set(chat.runId, chat.sessionKey);
      }
    }
    if (event.event === 'agent' && event.payload) {
      const agent = event.payload as AgentEvent;
      if (agent.runId && agent.sessionKey) {
        this.runSessionMap.set(agent.runId, agent.sessionKey);
      }
    }

    for (const listener of this.eventListeners) {
      try { listener(event); } catch {}
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(() => {});
    }, 5000);
  }

  // ── Typed request method ───────────────────────────────────

  async request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected');
    }
    const id = `req-${++this.requestId}`;
    const req: RequestFrame = { type: 'req', id, method, params };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
      });
      this.ws!.send(JSON.stringify(req));
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request ${method} timed out`));
        }
      }, 30000);
    });
  }

  // ── API methods ────────────────────────────────────────────

  async listSessions(): Promise<any[]> {
    const result = await this.request<{ sessions: any[] }>('sessions.list', {});
    return result?.sessions || [];
  }

  async chatHistory(sessionKey: string, limit = 50): Promise<any[]> {
    const result = await this.request<{ messages: any[] }>('chat.history', { sessionKey, limit });
    return result?.messages || [];
  }

  async usageCost(): Promise<any> {
    return this.request('usage.cost', {});
  }

  async getStatus(): Promise<any> {
    return this.request('status', {});
  }

  // ── Subscriptions ──────────────────────────────────────────

  onEvent(cb: EventCallback): () => void {
    this.eventListeners.push(cb);
    return () => {
      const idx = this.eventListeners.indexOf(cb);
      if (idx >= 0) this.eventListeners.splice(idx, 1);
    };
  }

  onConnectionChange(cb: StatusCallback) {
    this.statusListeners.push(cb);
  }

  // ── runId resolution ───────────────────────────────────────

  resolveSessionKey(runId: string): string | undefined {
    return this.runSessionMap.get(runId);
  }

  // ── Lifecycle ──────────────────────────────────────────────

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this._connected = false;
    this._connecting = false;
    this.emitStatus('disconnected');
  }

  private emitStatus(status: 'connecting' | 'connected' | 'disconnected' | 'error') {
    for (const cb of this.statusListeners) cb(status);
  }
}
