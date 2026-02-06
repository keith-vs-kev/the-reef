import { SessionInfo } from './types';

// Agent emoji map
const AGENT_EMOJIS: Record<string, string> = {
  kev: '😎',
  'rex-claude': '🦖',
  'rex-codex': '🦕',
  scout: '🔍',
  pixel: '🎨',
  hawk: '🦅',
  atlas: '🗺️',
  sentinel: '🛡️',
  ally: '🤝',
  blaze: '🔥',
  chase: '🏃',
  dash: '⚡',
  dot: '•',
  echo: '📡',
  finn: '🐟',
  forge: '🔨',
  law: '⚖️',
};

export function parseGatewaySession(raw: any): SessionInfo {
  const key = raw.key || '';
  const parts = key.split(':');
  const agent = parts[1] || 'unknown';
  const isSubagent = key.includes('subagent');

  // Determine status from recent activity
  const updatedAt = raw.updatedAt || 0;
  const ageMs = Date.now() - updatedAt;
  let status: SessionInfo['status'] = 'idle';
  if (raw.abortedLastRun) {
    status = 'error';
  } else if (ageMs < 60000 && raw.outputTokens > 0) {
    status = 'working';
  } else if (ageMs < 300000) {
    status = 'idle';
  } else {
    status = 'stopped';
  }

  // Calculate cost from usage if available
  const cost = raw.cost || 0;

  return {
    id: key,
    key,
    agent,
    emoji: AGENT_EMOJIS[agent] || '🤖',
    status,
    model: raw.model,
    channel: raw.channel || raw.lastChannel,
    cost,
    tokenUsage: {
      input: raw.inputTokens || 0,
      output: raw.outputTokens || 0,
      cacheRead: raw.cacheReadTokens || 0,
      cacheWrite: raw.cacheWriteTokens || 0,
    },
    totalTokens: raw.totalTokens || 0,
    startedAt: raw.updatedAt ? new Date(raw.updatedAt).toISOString() : undefined,
    parentSession: isSubagent ? inferParent(key, parts) : undefined,
    subagents: [],
    label: raw.label,
    subject: raw.subject,
    displayName: raw.displayName,
    updatedAt: raw.updatedAt,
  };
}

function inferParent(key: string, parts: string[]): string | undefined {
  // subagent keys look like: agent:rex-claude:subagent:uuid
  // parent would be the main session for that agent, but we can't know for sure
  return undefined;
}

export function buildSessionTree(sessions: SessionInfo[]): SessionInfo[] {
  const byId = new Map(sessions.map(s => [s.id, s]));

  // Link subagents to parents
  for (const session of sessions) {
    if (session.parentSession && byId.has(session.parentSession)) {
      byId.get(session.parentSession)!.subagents.push(session.id);
    }
  }

  return sessions;
}

export function formatMessageContent(content: any[]): string {
  if (!content || !Array.isArray(content)) return '';
  return content.map(c => {
    if (typeof c === 'string') return c;
    if (c.type === 'text') return c.text || '';
    if (c.type === 'toolCall') return `⚡ ${c.name}(${JSON.stringify(c.arguments || {}).substring(0, 100)}...)`;
    if (c.type === 'toolResult') return `→ ${c.text || JSON.stringify(c.content || '').substring(0, 200)}`;
    return JSON.stringify(c).substring(0, 200);
  }).join('\n');
}
