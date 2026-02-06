import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SessionInfo, ChatMessage } from '../types';

interface TerminalViewProps {
  session: SessionInfo;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  green: '\x1b[38;2;34;197;94m',
  blue: '\x1b[38;2;14;165;233m',
  yellow: '\x1b[38;2;234;179;8m',
  orange: '\x1b[38;2;249;115;22m',
  red: '\x1b[38;2;239;68;68m',
  cyan: '\x1b[38;2;6;182;212m',
  gray: '\x1b[38;2;82;82;91m',
  white: '\x1b[38;2;250;250;250m',
  magenta: '\x1b[38;2;168;85;247m',
  teal: '\x1b[38;2;14;165;233m',
  dimWhite: '\x1b[38;2;161;161;170m',
  bgDim: '\x1b[48;2;15;15;18m',
};

function extractTextFromContent(content: any[]): string {
  if (!content || !Array.isArray(content)) return '';
  return content.map(c => {
    if (typeof c === 'string') return c;
    if (c.type === 'text') return c.text || '';
    if (c.type === 'toolCall' || c.type === 'tool_use') {
      const args = typeof c.arguments === 'string' ? c.arguments :
                   typeof c.input === 'string' ? c.input :
                   JSON.stringify(c.arguments || c.input || {});
      return `[${c.name}] ${args.substring(0, 300)}`;
    }
    return '';
  }).filter(Boolean).join('\n');
}

function formatTimestamp(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit' });
}

function writeMessageToTerminal(term: Terminal, msg: ChatMessage) {
  const ts = formatTimestamp(msg.timestamp);
  const tsStr = ts ? `${COLORS.gray}${ts} ` : '';

  if (msg.role === 'user') {
    const text = extractTextFromContent(msg.content);
    if (!text) return;
    const display = text.length > 500 ? text.substring(0, 500) + '…' : text;
    term.writeln('');
    term.writeln(`${tsStr}${COLORS.blue}${COLORS.bold}▍ user${COLORS.reset}`);
    for (const line of display.split('\n')) {
      term.writeln(`  ${COLORS.white}${line}${COLORS.reset}`);
    }
  } else if (msg.role === 'assistant') {
    const parts = msg.content || [];
    let hasText = false;
    for (const part of parts) {
      if (part.type === 'text' && part.text) {
        if (!hasText) {
          term.writeln('');
          term.writeln(`${tsStr}${COLORS.teal}${COLORS.bold}▍ assistant${COLORS.reset}`);
          hasText = true;
        }
        const text = part.text.length > 1000 ? part.text.substring(0, 1000) + '…' : part.text;
        for (const line of text.split('\n')) {
          term.writeln(`  ${COLORS.dimWhite}${line}${COLORS.reset}`);
        }
      } else if (part.type === 'toolCall' || part.type === 'tool_use') {
        const name = part.name || 'unknown';
        const args = typeof part.arguments === 'string'
          ? part.arguments
          : typeof part.input === 'string'
            ? part.input
            : JSON.stringify(part.arguments || part.input || {});
        const shortArgs = args.length > 200 ? args.substring(0, 200) + '…' : args;
        term.writeln(`  ${COLORS.yellow}⚡ ${name}${COLORS.reset}${COLORS.gray} ${shortArgs}${COLORS.reset}`);
      }
    }
    if (msg.usage) {
      const cost = msg.usage.cost?.total;
      const tokens = (msg.usage.input || 0) + (msg.usage.output || 0) + (msg.usage.cacheRead || 0);
      const parts = [];
      if (tokens) parts.push(`${tokens.toLocaleString()} tok`);
      if (cost) parts.push(`$${cost.toFixed(4)}`);
      if (parts.length) {
        term.writeln(`  ${COLORS.gray}${parts.join(' · ')}${COLORS.reset}`);
      }
    }
  } else if (msg.role === 'toolResult' || msg.role === 'tool') {
    const name = msg.toolName || 'result';
    const text = extractTextFromContent(msg.content);
    const display = text.length > 300 ? text.substring(0, 300) + '…' : text;
    if (msg.isError) {
      term.writeln(`  ${COLORS.red}✗ ${name}: ${display}${COLORS.reset}`);
    } else {
      term.writeln(`  ${COLORS.magenta}↩ ${name}${COLORS.reset} ${COLORS.gray}${display.split('\n')[0]}${COLORS.reset}`);
    }
  } else if (msg.role === 'system') {
    const text = extractTextFromContent(msg.content);
    if (text) {
      term.writeln(`${COLORS.gray}${COLORS.dim}  ◈ system: ${text.substring(0, 200)}${COLORS.reset}`);
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
        background: '#09090b',
        foreground: '#a1a1aa',
        cursor: '#52525b',
        selectionBackground: 'rgba(14, 165, 233, 0.3)',
        black: '#09090b',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#0ea5e9',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#fafafa',
      },
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', 'Menlo', monospace",
      lineHeight: 1.5,
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

    // Write clean header
    term.writeln('');
    term.writeln(`  ${COLORS.teal}${COLORS.bold}${session.emoji || '🤖'} ${session.agent}${COLORS.reset}`);
    const infoParts = [
      session.model,
      session.status,
      session.totalTokens && `${formatTokens(session.totalTokens)} tokens`,
    ].filter(Boolean);
    if (infoParts.length) {
      term.writeln(`  ${COLORS.gray}${infoParts.join(' · ')}${COLORS.reset}`);
    }
    if (session.subject) {
      term.writeln(`  ${COLORS.gray}${session.subject}${COLORS.reset}`);
    }
    term.writeln(`  ${COLORS.gray}${'─'.repeat(70)}${COLORS.reset}`);

    // Fetch chat history
    setLoading(true);
    if (window.reef) {
      window.reef.gateway.chatHistory(session.key, 30).then(result => {
        setLoading(false);
        if (result.ok && result.data && result.data.length > 0) {
          setMessageCount(result.data.length);
          for (const msg of result.data) {
            writeMessageToTerminal(term, msg);
          }
          term.writeln('');
          term.writeln(`  ${COLORS.gray}── ${result.data.length} messages ──${COLORS.reset}`);
        } else {
          term.writeln('');
          term.writeln(`  ${COLORS.gray}No history available${COLORS.reset}`);
          if (result.error) {
            term.writeln(`  ${COLORS.red}${result.error}${COLORS.reset}`);
          }
        }
      }).catch(err => {
        setLoading(false);
        term.writeln(`  ${COLORS.red}Failed to fetch history: ${err}${COLORS.reset}`);
      });
    } else {
      setLoading(false);
      term.writeln(`  ${COLORS.gray}No gateway connection${COLORS.reset}`);
    }

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
    <div className="flex flex-col h-full bg-reef-bg">
      {/* Header bar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-reef-bg-elevated border-b border-reef-border text-xs">
        <span className="text-base">{session.emoji || '🤖'}</span>
        <span className="text-reef-text-bright font-semibold text-[13px]">{session.agent}</span>

        <StatusPill status={session.status} />

        {session.model && (
          <span className="text-reef-text-dim font-mono text-[11px] bg-reef-border/30 px-1.5 py-0.5 rounded">
            {session.model}
          </span>
        )}

        {session.subject && (
          <span className="text-reef-text-dim text-[11px] truncate max-w-[300px]">
            {session.subject}
          </span>
        )}

        <div className="flex-1" />

        {loading && (
          <div className="flex items-center gap-1.5 text-reef-accent">
            <span className="w-1.5 h-1.5 rounded-full bg-reef-accent animate-pulse" />
            <span className="text-[11px]">Loading…</span>
          </div>
        )}
        {!loading && messageCount > 0 && (
          <span className="text-reef-text-dim text-[11px]">{messageCount} msgs</span>
        )}
        {(session.totalTokens || 0) > 0 && (
          <span className="text-reef-text-dim text-[11px] font-mono">
            {formatTokens(session.totalTokens || 0)} tok
          </span>
        )}
        {session.cost > 0 && (
          <span className="text-reef-text-dim text-[11px] font-mono">
            ${session.cost.toFixed(2)}
          </span>
        )}
      </div>

      {/* Terminal */}
      <div ref={containerRef} className="flex-1" />
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; dot: string }> = {
    working: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-500' },
    idle: { bg: 'bg-amber-500/10', text: 'text-amber-400', dot: 'bg-amber-500' },
    error: { bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-500' },
    stopped: { bg: 'bg-zinc-500/10', text: 'text-zinc-500', dot: 'bg-zinc-600' },
  };
  const c = config[status] || config.stopped;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {status}
    </span>
  );
}
