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
  const recipient = hasType ? parts.slice(3).join(':') : parts.slice(3).join(':');
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
    channel: raw.channel || raw.lastChannel,
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
    recipient: parsed.recipient,
    isGroup: parsed.isGroup,
  };
}
