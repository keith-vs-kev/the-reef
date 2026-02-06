// OpenClaw Gateway Protocol v3 types
// Adopted from Crabwalk (src/integrations/openclaw/protocol.ts)

// ── Frame types ──────────────────────────────────────────────

export interface RequestFrame {
  type: 'req';
  id: string;
  method: string;
  params?: unknown;
}

export interface ResponseFrame {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: { code: string; message: string };
}

export interface EventFrame {
  type: 'event';
  event: string;
  payload?: unknown;
  seq?: number;
  stateVersion?: { presence: number; health: number };
}

export type GatewayFrame = RequestFrame | ResponseFrame | EventFrame;

// ── Connection ───────────────────────────────────────────────

export interface ClientInfo {
  id: string;
  displayName?: string;
  version: string;
  platform: string;
  mode: 'ui' | 'cli' | 'bot';
}

export interface ConnectParams {
  minProtocol: 3;
  maxProtocol: 3;
  client: ClientInfo;
  auth?: { token?: string };
  role?: string;
  scopes?: string[];
  caps?: string[];
  commands?: string[];
  permissions?: Record<string, boolean>;
  locale?: string;
  userAgent?: string;
}

export interface HelloOk {
  type: 'hello-ok';
  protocol: number;
  server: { version: string; host: string; connId: string };
  snapshot: {
    presence: PresenceEntry[];
    health: unknown;
    stateVersion: { presence: number; health: number };
  };
  features: { methods: string[]; events: string[] };
}

export interface PresenceEntry {
  key?: string;
  host?: string;
  ip?: string;
  version?: string;
  platform?: string;
  mode?: string;
  text?: string;
  ts?: number;
}

// ── Chat events ──────────────────────────────────────────────

export interface ChatEvent {
  runId: string;
  sessionKey: string;
  seq: number;
  state: 'delta' | 'final' | 'aborted' | 'error';
  message?: unknown;
  errorMessage?: string;
  usage?: { inputTokens?: number; outputTokens?: number };
  stopReason?: string;
}

// ── Agent events ─────────────────────────────────────────────

export interface AgentEvent {
  runId: string;
  seq: number;
  stream: string;
  ts: number;
  data: Record<string, unknown>;
  sessionKey?: string;
}

// ── Exec events ──────────────────────────────────────────────

export interface ExecStartedEvent {
  pid: number;
  command: string;
  sessionId: string;
  runId: string;
  startedAt: number;
}

export interface ExecOutputEvent {
  pid: number;
  runId: string;
  sessionId?: string;
  stream: 'stdout' | 'stderr' | string;
  output: string;
}

export interface ExecCompletedEvent {
  pid: number;
  runId: string;
  sessionId?: string;
  exitCode: number;
  durationMs: number;
  status: string;
}

// ── Monitor types (unified action model) ─────────────────────

export interface MonitorSession {
  key: string;
  agentId: string;
  platform: string;
  recipient: string;
  isGroup: boolean;
  lastActivityAt: number;
  status: 'idle' | 'active' | 'thinking';
  spawnedBy?: string;
  // Extended fields from sessions.list
  model?: string;
  channel?: string;
  subject?: string;
  label?: string;
  displayName?: string;
  totalTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface MonitorAction {
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
  duration?: number;
  inputTokens?: number;
  outputTokens?: number;
  stopReason?: string;
}

// ── Utility ──────────────────────────────────────────────────

export function parseSessionKey(key: string): {
  agentId: string;
  platform: string;
  recipient: string;
  isGroup: boolean;
} {
  const parts = key.split(':');
  const agentId = parts[1] || 'unknown';
  const platform = parts[2] || 'unknown';
  const hasType = ['channel', 'group', 'dm', 'thread', 'subagent'].includes(parts[3] || '');
  const isGroup = parts[3] === 'group' || parts[3] === 'channel';
  const recipient = hasType ? parts.slice(3).join(':') : parts.slice(3).join(':');
  return { agentId, platform, recipient, isGroup };
}

export function createConnectParams(token?: string): ConnectParams {
  return {
    minProtocol: 3,
    maxProtocol: 3,
    client: {
      id: 'cli',
      version: '0.1.0',
      platform: 'linux',
      mode: 'cli',
    },
    role: 'operator',
    scopes: ['operator.read'],
    caps: [],
    commands: [],
    permissions: {},
    locale: 'en-US',
    userAgent: 'the-reef/0.1.0',
    auth: token ? { token } : undefined,
  };
}
