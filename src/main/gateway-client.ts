import WebSocket from 'ws';
import { createHash } from 'crypto';

export interface GatewaySession {
  key: string;
  kind: string;
  displayName?: string;
  label?: string;
  channel?: string;
  subject?: string;
  chatType?: string;
  updatedAt?: number;
  sessionId?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  modelProvider?: string;
  model?: string;
  contextTokens?: number;
  lastChannel?: string;
  lastAccountId?: string;
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

export interface UsageCost {
  totals: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    totalTokens: number;
    totalCost: number;
  };
  daily: Array<{
    date: string;
    totalTokens: number;
    totalCost: number;
  }>;
}

type EventCallback = (event: any) => void;
type StatusCallback = (status: string) => void;

export class GatewayClient {
  private ws: WebSocket | null = null;
  private url: string;
  private token: string;
  private requestId = 0;
  private pendingRequests: Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }> = new Map();
  private eventListeners: EventCallback[] = [];
  private statusListeners: StatusCallback[] = [];
  private connected = false;

  constructor(url: string, token: string) {
    this.url = url;
    this.token = token;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = this.url.replace(/^http/, 'ws').replace(/\/$/, '');
      this.ws = new WebSocket(wsUrl);

      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
        this.ws?.close();
      }, 10000);

      this.ws.on('open', () => {
        this.emitStatus('connecting');
      });

      // Handle the challenge-response flow
      const onFirstMessage = (data: WebSocket.Data) => {
        try {
          const msg = JSON.parse(data.toString());
          // Handle response to our connect request
          if (msg.type === 'res' && msg.id) {
            const idNum = typeof msg.id === 'string' ? parseInt(msg.id.replace('r', ''), 10) : msg.id;
            const pending = this.pendingRequests.get(idNum);
            if (pending) {
              this.pendingRequests.delete(idNum);
              if (msg.ok === false) {
                pending.reject(new Error(msg.error?.message || 'Connect failed'));
              } else {
                pending.resolve(msg.payload || msg);
              }
              return;
            }
          }

          if (msg.event === 'connect.challenge') {
            // Send connect request with token auth
            const connectMsg = {
              type: 'req',
              id: `r${++this.requestId}`,
              method: 'connect',
              params: {
                minProtocol: 3,
                maxProtocol: 3,
                client: {
                  id: 'cli',
                  version: '1.0.0',
                  platform: 'linux',
                  mode: 'cli',
                },
                auth: { token: this.token },
              },
            };
            this.pendingRequests.set(this.requestId, {
              resolve: (payload: any) => {
                clearTimeout(timeout);
                this.connected = true;
                this.emitStatus('connected');
                this.ws?.removeListener('message', onFirstMessage);
                this.ws?.on('message', (d: WebSocket.Data) => this.handleRawMessage(d));
                resolve();
              },
              reject: (err: Error) => {
                clearTimeout(timeout);
                this.emitStatus('error');
                reject(err);
              },
            });
            this.ws?.send(JSON.stringify(connectMsg));
          }
        } catch {}
      };

      this.ws.on('message', onFirstMessage);

      this.ws.on('close', () => {
        this.connected = false;
        this.emitStatus('disconnected');
      });

      this.ws.on('error', (err: Error) => {
        clearTimeout(timeout);
        this.emitStatus('error');
        reject(err);
      });
    });
  }

  private handleRawMessage(data: WebSocket.Data) {
    try {
      const msg = JSON.parse(data.toString());

      // Response to a request
      if (msg.type === 'res' && msg.id) {
        const idNum = typeof msg.id === 'string' ? parseInt(msg.id.replace('r', ''), 10) : msg.id;
        const pending = this.pendingRequests.get(idNum);
        if (pending) {
          this.pendingRequests.delete(idNum);
          if (msg.ok === false) {
            pending.reject(new Error(msg.error?.message || 'Request failed'));
          } else {
            pending.resolve(msg.payload || msg);
          }
          return;
        }
      }

      // Event
      if (msg.type === 'event') {
        for (const cb of this.eventListeners) cb(msg);
      }
    } catch {}
  }

  private request(method: string, params: any = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.ws || !this.connected) {
        reject(new Error('Not connected'));
        return;
      }
      const id = ++this.requestId;
      this.pendingRequests.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ type: 'req', id: `r${id}`, method, params }));

      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request ${method} timed out`));
        }
      }, 30000);
    });
  }

  async listSessions(): Promise<GatewaySession[]> {
    const result = await this.request('sessions.list', {});
    return result?.sessions || [];
  }

  async chatHistory(sessionKey: string, limit = 50): Promise<ChatMessage[]> {
    const result = await this.request('chat.history', { sessionKey, limit });
    return result?.messages || [];
  }

  async usageCost(): Promise<UsageCost | null> {
    const result = await this.request('usage.cost', {});
    return result || null;
  }

  async getStatus(): Promise<any> {
    return this.request('status', {});
  }

  disconnect() {
    this.connected = false;
    this.ws?.close();
    this.ws = null;
    this.emitStatus('disconnected');
  }

  onEvent(cb: EventCallback) { this.eventListeners.push(cb); }
  onConnectionChange(cb: StatusCallback) { this.statusListeners.push(cb); }

  private emitStatus(status: string) {
    for (const cb of this.statusListeners) cb(status);
  }
}
