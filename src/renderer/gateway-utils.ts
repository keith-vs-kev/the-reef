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

function extractPlatform(ch: string | undefined): string {
  if (!ch) return 'internal';
  // If channel is like "whatsapp:g-mongodojo" or "whatsapp", extract just the platform
  const colon = ch.indexOf(':');
  if (colon > 0) return ch.substring(0, colon);
  return ch;
}

// Adopted from Crabwalk's parseSessionKey
function parseSessionKey(key: string): {
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
  // For recipient, extract just the chat identifier (type:id)
  const recipient = hasType ? parts.slice(3).join(':') : parts.slice(2).join(':');
  return { agentId, platform, recipient, isGroup };
}

export function parseGatewaySession(raw: any): SessionInfo {
  const key = raw.key || '';
  const parsed = parseSessionKey(key);
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

  return {
    id: key,
    key,
    agent: parsed.agentId,
    emoji: AGENT_EMOJIS[parsed.agentId] || '🤖',
    status,
    model: raw.model,
    channel: extractPlatform(raw.channel || raw.lastChannel || parsed.platform),
    cost: raw.cost || 0,
    tokenUsage: {
      input: raw.inputTokens || 0,
      output: raw.outputTokens || 0,
      cacheRead: raw.cacheReadTokens || 0,
      cacheWrite: raw.cacheWriteTokens || 0,
    },
    totalTokens: raw.totalTokens || 0,
    startedAt: raw.updatedAt ? new Date(raw.updatedAt).toISOString() : undefined,
    parentSession: isSubagent ? (raw.spawnedBy || undefined) : undefined,
    subagents: [],
    label: raw.label,
    subject: raw.subject,
    displayName: raw.displayName,
    updatedAt: raw.updatedAt,
    platform: parsed.platform,
    recipient: raw.recipient || parsed.recipient,
    isGroup: raw.isGroup ?? parsed.isGroup,
  };
}
