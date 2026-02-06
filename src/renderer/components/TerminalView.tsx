import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SessionInfo } from '../types';
import { MOCK_TERMINAL_LINES, MOCK_TERMINAL_LINES_SENTINEL, MOCK_TERMINAL_LINES_SCOUT } from '../mock-data';

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
};

function getTerminalLines(agent: string) {
  if (agent === 'sentinel') return MOCK_TERMINAL_LINES_SENTINEL;
  if (agent === 'scout') return MOCK_TERMINAL_LINES_SCOUT;
  return MOCK_TERMINAL_LINES;
}

function formatLine(line: { type: string; text: string }): string {
  switch (line.type) {
    case 'system':
      return `${COLORS.gray}${line.text}${COLORS.reset}`;
    case 'agent':
      return `${COLORS.green}${line.text}${COLORS.reset}`;
    case 'tool':
      return `${COLORS.yellow}${line.text}${COLORS.reset}`;
    case 'info':
      return `${COLORS.blue}${line.text}${COLORS.reset}`;
    case 'error':
      return `${COLORS.red}${line.text}${COLORS.reset}`;
    default:
      return line.text;
  }
}

export function TerminalView({ session }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

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
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 5000,
      allowTransparency: true,
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
    term.writeln(`${COLORS.white}${COLORS.bold}  ${session.emoji || '🤖'} ${session.agent}${COLORS.reset} ${COLORS.gray}— ${session.id}${COLORS.reset}`);
    term.writeln(`${COLORS.gray}  Model: ${session.model || 'unknown'} | Status: ${session.status} | Cost: $${session.cost.toFixed(2)}${COLORS.reset}`);
    term.writeln(`${COLORS.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${COLORS.reset}`);
    term.writeln('');

    // Progressively write mock terminal output
    const lines = getTerminalLines(session.agent);
    let lineIndex = 0;

    const writeNext = () => {
      if (lineIndex < lines.length) {
        term.writeln(formatLine(lines[lineIndex]));
        lineIndex++;
      }
    };

    // Write lines with delay for realistic feel
    const interval = setInterval(writeNext, 300);

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      clearInterval(interval);
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
        <div className="flex-1" />
        <span className="text-reef-text-dim">
          {session.tokenUsage.input.toLocaleString()} tokens in / {session.tokenUsage.output.toLocaleString()} out
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
