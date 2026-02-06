import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SessionInfo, ChatMessage } from '../types';

interface TerminalViewProps {
  session: SessionInfo;
}

const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  green: '\x1b[38;2;78;201;176m',
  blue: '\x1b[38;2;86;156;214m',
  yellow: '\x1b[38;2;220;220;170m',
  orange: '\x1b[38;2;206;145;120m',
  red: '\x1b[38;2;244;71;71m',
  cyan: '\x1b[38;2;0;122;204m',
  gray: '\x1b[38;2;133;133;133m',
  white: '\x1b[38;2;224;224;224m',
  magenta: '\x1b[38;2;197;134;192m',
};

function extractTextFromContent(content: any[]): string {
  if (!content || !Array.isArray(content)) return '';
  return content.map(c => {
    if (typeof c === 'string') return c;
    if (c.type === 'text') return c.text || '';
    if (c.type === 'toolCall') {
      const args = typeof c.arguments === 'string' ? c.arguments : JSON.stringify(c.arguments || {});
      return `[tool_call: ${c.name}] ${args.substring(0, 300)}`;
    }
    if (c.type === 'tool_use') {
      const args = typeof c.input === 'string' ? c.input : JSON.stringify(c.input || {});
      return `[tool_call: ${c.name}] ${args.substring(0, 300)}`;
    }
    return '';
  }).filter(Boolean).join('\n');
}

function formatTimestamp(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function writeMessageToTerminal(term: Terminal, msg: ChatMessage) {
  const ts = formatTimestamp(msg.timestamp);
  const tsPrefix = ts ? `${COLORS.gray}[${ts}]${COLORS.reset} ` : '';

  if (msg.role === 'user') {
    const text = extractTextFromContent(msg.content);
    if (!text) return;
    // Truncate very long user messages
    const display = text.length > 500 ? text.substring(0, 500) + '...' : text;
    for (const line of display.split('\n')) {
      term.writeln(`${tsPrefix}${COLORS.blue}${COLORS.bold}user ▸${COLORS.reset} ${COLORS.white}${line}${COLORS.reset}`);
    }
  } else if (msg.role === 'assistant') {
    const parts = msg.content || [];
    for (const part of parts) {
      if (part.type === 'text' && part.text) {
        const text = part.text.length > 1000 ? part.text.substring(0, 1000) + '...' : part.text;
        for (const line of text.split('\n')) {
          term.writeln(`${tsPrefix}${COLORS.green}assistant ▸${COLORS.reset} ${line}`);
        }
      } else if (part.type === 'toolCall' || part.type === 'tool_use') {
        const name = part.name || 'unknown';
        const args = typeof part.arguments === 'string'
          ? part.arguments
          : typeof part.input === 'string'
            ? part.input
            : JSON.stringify(part.arguments || part.input || {});
        const shortArgs = args.length > 200 ? args.substring(0, 200) + '...' : args;
        term.writeln(`${tsPrefix}${COLORS.yellow}⚡ ${name}${COLORS.reset} ${COLORS.gray}${shortArgs}${COLORS.reset}`);
      }
    }
    // Show usage if present
    if (msg.usage) {
      const cost = msg.usage.cost?.total;
      const tokens = msg.usage.input + msg.usage.output + (msg.usage.cacheRead || 0);
      term.writeln(`${COLORS.gray}   tokens: ${tokens.toLocaleString()}${cost ? ` | cost: $${cost.toFixed(4)}` : ''}${COLORS.reset}`);
    }
  } else if (msg.role === 'toolResult' || msg.role === 'tool') {
    const name = msg.toolName || 'result';
    const text = extractTextFromContent(msg.content);
    const display = text.length > 300 ? text.substring(0, 300) + '...' : text;
    if (msg.isError) {
      term.writeln(`${tsPrefix}${COLORS.red}✗ ${name}:${COLORS.reset} ${COLORS.red}${display}${COLORS.reset}`);
    } else {
      term.writeln(`${tsPrefix}${COLORS.magenta}→ ${name}${COLORS.reset} ${COLORS.gray}${display.split('\n')[0]}${COLORS.reset}`);
    }
  } else if (msg.role === 'system') {
    const text = extractTextFromContent(msg.content);
    if (text) {
      term.writeln(`${COLORS.gray}${COLORS.dim}[system] ${text.substring(0, 200)}${COLORS.reset}`);
    }
  }
}

export function TerminalView({ session }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [loading, setLoading] = useState(true);
  const [messageCount, setMessageCount] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      theme: {
        background: '#1e1e1e',
        foreground: '#cccccc',
        cursor: '#aeafad',
        selectionBackground: '#264f78',
        black: '#000000',
        red: '#f44747',
        green: '#4ec9b0',
        yellow: '#dcdcaa',
        blue: '#569cd6',
        magenta: '#c586c0',
        cyan: '#9cdcfe',
        white: '#e0e0e0',
      },
      fontSize: 13,
      fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Menlo', monospace",
      lineHeight: 1.4,
      cursorBlink: false,
      cursorStyle: 'block',
      scrollback: 10000,
      allowTransparency: true,
      disableStdin: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());

    term.open(containerRef.current);
    fitAddon.fit();

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // Write header
    term.writeln(`${COLORS.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${COLORS.reset}`);
    term.writeln(`${COLORS.white}${COLORS.bold}  ${session.emoji || '🤖'} ${session.agent}${COLORS.reset} ${COLORS.gray}— ${session.key}${COLORS.reset}`);
    const info = [
      session.model && `Model: ${session.model}`,
      `Status: ${session.status}`,
      session.totalTokens && `Tokens: ${session.totalTokens.toLocaleString()}`,
      session.subject && `Subject: ${session.subject}`,
      session.label && `Label: ${session.label}`,
    ].filter(Boolean).join(' | ');
    term.writeln(`${COLORS.gray}  ${info}${COLORS.reset}`);
    term.writeln(`${COLORS.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${COLORS.reset}`);
    term.writeln('');

    // Fetch real chat history
    setLoading(true);
    if (window.reef) {
      window.reef.gateway.chatHistory(session.key, 30).then(result => {
        setLoading(false);
        if (result.ok && result.data && result.data.length > 0) {
          setMessageCount(result.data.length);
          for (const msg of result.data) {
            writeMessageToTerminal(term, msg);
            term.writeln(''); // spacing between messages
          }
          term.writeln(`${COLORS.gray}─── end of history (${result.data.length} messages) ───${COLORS.reset}`);
        } else {
          term.writeln(`${COLORS.gray}No chat history available for this session.${COLORS.reset}`);
          if (result.error) {
            term.writeln(`${COLORS.red}Error: ${result.error}${COLORS.reset}`);
          }
        }
      }).catch(err => {
        setLoading(false);
        term.writeln(`${COLORS.red}Failed to fetch chat history: ${err}${COLORS.reset}`);
      });
    } else {
      setLoading(false);
      term.writeln(`${COLORS.gray}No gateway connection — showing empty view${COLORS.reset}`);
    }

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      term.dispose();
    };
  }, [session.id]);

  return (
    <div className="flex flex-col h-full">
      {/* Terminal header bar */}
      <div className="flex items-center gap-3 px-4 py-1.5 bg-[#252526] border-b border-reef-border text-xs">
        <span className="text-reef-text-bright font-medium">
          {session.emoji} {session.agent}
        </span>
        <span className="text-reef-text-dim">—</span>
        <StatusBadge status={session.status} />
        <span className="text-reef-text-dim">{session.model}</span>
        {session.subject && <span className="text-reef-text-dim">• {session.subject}</span>}
        <div className="flex-1" />
        {loading && <span className="text-yellow-400 animate-pulse">Loading history...</span>}
        {!loading && messageCount > 0 && (
          <span className="text-reef-text-dim">{messageCount} messages</span>
        )}
        <span className="text-reef-text-dim">
          {(session.totalTokens || 0).toLocaleString()} tokens
        </span>
      </div>
      <div ref={containerRef} className="flex-1 p-1" />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles = {
    working: 'bg-green-500/20 text-green-400 border-green-500/30',
    idle: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    error: 'bg-red-500/20 text-red-400 border-red-500/30',
    stopped: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${styles[status as keyof typeof styles] || styles.stopped}`}>
      {status}
    </span>
  );
}
