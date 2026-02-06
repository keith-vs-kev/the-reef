// Event parser adopted from Crabwalk's parser.ts
// Converts raw gateway events into MonitorAction/MonitorSession updates

import type {
  EventFrame,
  ChatEvent,
  AgentEvent,
  ExecStartedEvent,
  ExecOutputEvent,
  ExecCompletedEvent,
  MonitorSession,
  MonitorAction,
} from './protocol';
import { parseSessionKey } from './protocol';

export interface ParsedEvent {
  session?: Partial<MonitorSession> & { key: string };
  action?: MonitorAction;
}

export function parseEventFrame(frame: EventFrame): ParsedEvent | null {
  // Skip system/health events
  if (frame.event === 'health' || frame.event === 'tick' || frame.event === 'presence') {
    return null;
  }

  if (frame.event === 'chat' && frame.payload) {
    const chat = frame.payload as ChatEvent;
    return {
      action: chatEventToAction(chat),
      session: {
        key: chat.sessionKey,
        status: chat.state === 'delta' ? 'thinking' : 'active',
        lastActivityAt: Date.now(),
      },
    };
  }

  if (frame.event === 'agent' && frame.payload) {
    const agent = frame.payload as AgentEvent;

    // Lifecycle events (start/end)
    if (agent.stream === 'lifecycle') {
      return {
        action: agentEventToAction(agent),
        session: agent.sessionKey ? {
          key: agent.sessionKey,
          status: agent.data?.phase === 'start' ? 'thinking' : 'active',
          lastActivityAt: Date.now(),
        } : undefined,
      };
    }

    // Assistant stream (cumulative text)
    if (agent.stream === 'assistant' && typeof agent.data?.text === 'string') {
      return {
        action: agentEventToAction(agent),
        session: agent.sessionKey ? {
          key: agent.sessionKey,
          status: 'thinking',
          lastActivityAt: Date.now(),
        } : undefined,
      };
    }

    // Tool events
    if (agent.data?.type === 'tool_use' || agent.data?.type === 'tool_result') {
      return {
        action: agentEventToAction(agent),
        session: agent.sessionKey ? {
          key: agent.sessionKey,
          status: 'thinking',
          lastActivityAt: Date.now(),
        } : undefined,
      };
    }

    return null;
  }

  return null;
}

function chatEventToAction(event: ChatEvent): MonitorAction {
  let type: MonitorAction['type'] = 'streaming';
  if (event.state === 'final') type = 'complete';
  else if (event.state === 'aborted') type = 'aborted';
  else if (event.state === 'error') type = 'error';

  const action: MonitorAction = {
    id: `${event.runId}-${event.seq}`,
    runId: event.runId,
    sessionKey: event.sessionKey,
    seq: event.seq,
    type,
    eventType: 'chat',
    timestamp: Date.now(),
  };

  if (event.state === 'final') {
    if (event.usage) {
      action.inputTokens = event.usage.inputTokens;
      action.outputTokens = event.usage.outputTokens;
    }
    if (event.stopReason) {
      action.stopReason = event.stopReason;
    }
  }

  // Extract content from message
  if (event.message) {
    action.content = extractContent(event.message);
  }
  if (event.errorMessage) {
    action.content = event.errorMessage;
  }

  return action;
}

function agentEventToAction(event: AgentEvent): MonitorAction {
  let type: MonitorAction['type'] = 'streaming';
  let content: string | undefined;
  let toolName: string | undefined;
  let toolArgs: unknown;
  let startedAt: number | undefined;
  let endedAt: number | undefined;

  if (event.stream === 'lifecycle') {
    if (event.data.phase === 'start') {
      type = 'start';
      startedAt = typeof event.data.startedAt === 'number' ? event.data.startedAt : event.ts;
    } else if (event.data.phase === 'end') {
      type = 'complete';
      endedAt = typeof event.data.endedAt === 'number' ? event.data.endedAt : event.ts;
    }
  } else if (event.data?.type === 'tool_use') {
    type = 'tool_call';
    toolName = String(event.data.name || 'unknown');
    toolArgs = event.data.input;
    content = `Tool: ${toolName}`;
  } else if (event.data?.type === 'tool_result') {
    type = 'tool_result';
    content = String(event.data.content || '');
  } else if (event.data?.type === 'text' || typeof event.data?.text === 'string') {
    type = 'streaming';
    content = String(event.data.text || '');
  }

  return {
    id: `${event.runId}-${event.seq}`,
    runId: event.runId,
    sessionKey: event.sessionKey || event.stream,
    seq: event.seq,
    type,
    eventType: 'agent',
    timestamp: event.ts,
    content,
    toolName,
    toolArgs,
    startedAt,
    endedAt,
  };
}

function extractContent(message: unknown): string | undefined {
  if (typeof message === 'string') return message;
  if (typeof message !== 'object' || !message) return undefined;

  const msg = message as Record<string, unknown>;
  if (Array.isArray(msg.content)) {
    const texts: string[] = [];
    for (const block of msg.content) {
      if (typeof block === 'object' && block) {
        const b = block as Record<string, unknown>;
        if (b.type === 'text' && typeof b.text === 'string') texts.push(b.text);
      }
    }
    return texts.length > 0 ? texts.join('') : undefined;
  }
  if (typeof msg.content === 'string') return msg.content;
  if (typeof msg.text === 'string') return msg.text;
  return undefined;
}
