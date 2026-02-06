import React, { useState, useEffect, useRef } from 'react';

interface SpawnModalProps {
  open: boolean;
  onClose: () => void;
  onSpawn: (task: string, provider: string, model: string) => void;
}

const PROVIDER_DEFAULTS: Record<string, string> = {
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o',
  google: 'gemini-2.5-flash',
};

export function SpawnModal({ open, onClose, onSpawn }: SpawnModalProps) {
  const [task, setTask] = useState('');
  const [provider, setProvider] = useState('anthropic');
  const [model, setModel] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      setTask('');
      setModel('');
      setProvider('anthropic');
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = () => {
    if (!task.trim()) return;
    onSpawn(task, provider, model || PROVIDER_DEFAULTS[provider]);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={handleKeyDown}
    >
      <div className="bg-reef-bg-elevated border border-reef-border rounded-xl shadow-2xl w-[520px] max-w-[90vw] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-reef-border">
          <h2 className="text-sm font-semibold text-reef-text-bright flex items-center gap-2">
            <span className="text-base">🚀</span>
            Spawn Agent
          </h2>
          <button
            onClick={onClose}
            className="text-reef-text-dim hover:text-reef-text-bright w-6 h-6 flex items-center justify-center rounded hover:bg-reef-border/30 transition-colors"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Task */}
          <div>
            <label className="block text-[11px] font-medium text-reef-text-dim mb-1.5 uppercase tracking-wide">
              Task
            </label>
            <textarea
              ref={inputRef}
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder="What should the agent do?"
              rows={3}
              className="w-full px-3 py-2 text-sm bg-reef-bg border border-reef-border rounded-lg text-reef-text-bright placeholder-reef-text-dim focus:border-reef-accent focus:ring-1 focus:ring-reef-accent/20 focus:outline-none resize-none transition-all"
            />
          </div>

          {/* Provider */}
          <div>
            <label className="block text-[11px] font-medium text-reef-text-dim mb-1.5 uppercase tracking-wide">
              Provider
            </label>
            <div className="flex gap-2">
              {[
                { id: 'anthropic', label: 'Anthropic', icon: '🟣', desc: 'Claude' },
                { id: 'openai', label: 'OpenAI', icon: '🟢', desc: 'GPT / o-series' },
                { id: 'google', label: 'Google', icon: '🔵', desc: 'Gemini' },
              ].map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setProvider(p.id); setModel(''); }}
                  className={`flex-1 flex flex-col items-center gap-1 py-2.5 px-3 rounded-lg border text-xs transition-all ${
                    provider === p.id
                      ? 'border-reef-accent bg-reef-accent-muted text-reef-text-bright ring-1 ring-reef-accent/30'
                      : 'border-reef-border hover:border-reef-text-dim text-reef-text-dim hover:text-reef-text'
                  }`}
                >
                  <span className="text-lg">{p.icon}</span>
                  <span className="font-medium">{p.label}</span>
                  <span className="text-[10px] text-reef-text-muted">{p.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Model */}
          <div>
            <label className="block text-[11px] font-medium text-reef-text-dim mb-1.5 uppercase tracking-wide">
              Model <span className="text-reef-text-muted font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={PROVIDER_DEFAULTS[provider]}
              className="w-full px-3 py-2 text-sm bg-reef-bg border border-reef-border rounded-lg text-reef-text-bright placeholder-reef-text-dim focus:border-reef-accent focus:ring-1 focus:ring-reef-accent/20 focus:outline-none transition-all"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-reef-border bg-reef-bg/50">
          <span className="text-[10px] text-reef-text-muted">⌘+Enter to spawn</span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-reef-text-dim hover:text-reef-text border border-reef-border rounded-md hover:bg-reef-border/20 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!task.trim()}
              className="px-4 py-1.5 text-xs font-medium text-white bg-reef-accent hover:bg-reef-accent/90 rounded-md disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Spawn Agent
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
