import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, Terminal, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchJson } from '../../lib/apiFetch';
import { withProjectBody, withProjectQuery } from '../../lib/nebulaProjectApi';

type Line = { type: 'command' | 'stdout' | 'stderr' | 'info'; text: string };

type TerminalPanelProps = {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
};

export function TerminalPanel({ collapsed = false, onToggleCollapse }: TerminalPanelProps) {
  const [lines, setLines] = useState<Line[]>([]);
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  const appendLines = useCallback(
    (next: Line[]) => {
      setLines((prev) => [...prev, ...next]);
      requestAnimationFrame(scrollToBottom);
    },
    [scrollToBottom],
  );

  const runCommand = useCallback(
    async (raw: string) => {
      const cmd = raw.trim();
      if (!cmd || running) return;

      setRunning(true);
      setInput('');
      setHistoryIndex(-1);
      setCommandHistory((prev) => (prev[prev.length - 1] === cmd ? prev : [...prev, cmd].slice(-100)));

      appendLines([{ type: 'command', text: `$ ${cmd}` }]);

      try {
        const data = await fetchJson<{ output?: string }>(withProjectQuery('/api/terminal/exec'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(withProjectBody({ command: cmd.slice(0, 4000) })),
        });
        const out = typeof data.output === 'string' ? data.output : '';
        if (out.trim()) {
          appendLines(out.replace(/\r\n/g, '\n').split('\n').map((t) => ({ type: 'stdout' as const, text: t })));
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        appendLines([{ type: 'stderr', text: msg }]);
      } finally {
        setRunning(false);
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    },
    [running, appendLines],
  );

  useEffect(() => {
    if (!collapsed) inputRef.current?.focus();
  }, [collapsed]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = '0';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void runCommand(input);
      return;
    }
    if (e.key === 'ArrowUp' && !e.shiftKey && !e.metaKey && !e.altKey) {
      const el = e.currentTarget;
      if (el.selectionStart === 0 && el.selectionEnd === 0 && commandHistory.length > 0) {
        e.preventDefault();
        const next = historyIndex < 0 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(next);
        setInput(commandHistory[next] ?? '');
      }
      return;
    }
    if (e.key === 'ArrowDown' && !e.shiftKey && !e.metaKey && !e.altKey) {
      const el = e.currentTarget;
      if (el.selectionStart === el.value.length && historyIndex >= 0) {
        e.preventDefault();
        if (historyIndex >= commandHistory.length - 1) {
          setHistoryIndex(-1);
          setInput('');
        } else {
          const next = historyIndex + 1;
          setHistoryIndex(next);
          setInput(commandHistory[next] ?? '');
        }
      }
    }
  };

  const header = (
    <div className="tonal-seam-b flex h-8 shrink-0 items-center gap-1.5 px-2">
      <div className="surface-base type-label-sm flex items-center gap-1.5 rounded px-2 py-0.5 text-foreground">
        <Terminal className="h-3 w-3 shrink-0" />
        Terminal
      </div>
      {!collapsed ? (
        <button
          type="button"
          title="Clear terminal"
          aria-label="Clear terminal"
          className="btn-secondary-surface rounded p-1 text-muted-foreground hover:text-foreground"
          onClick={() => setLines([])}
        >
          <Trash2 className="h-3 w-3" />
        </button>
      ) : null}
      <div className="flex-1" />
      <button
        type="button"
        title={collapsed ? 'Show terminal' : 'Hide terminal'}
        aria-label={collapsed ? 'Show terminal' : 'Hide terminal'}
        aria-expanded={!collapsed}
        className="btn-secondary-surface rounded p-1 text-muted-foreground hover:text-foreground"
        onClick={() => onToggleCollapse?.()}
      >
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', collapsed && 'rotate-180')} />
      </button>
    </div>
  );

  if (collapsed) {
    return (
      <div className="surface-active tonal-seam-t flex h-full min-h-8 flex-col">{header}</div>
    );
  }

  return (
    <div className="surface-active tonal-seam-t flex h-full min-h-0 flex-col">
      {header}

      <div
        ref={scrollRef}
        className="type-body-md min-h-0 flex-1 cursor-text overflow-auto bg-[var(--surface)] p-2 font-mono text-[12px] leading-[1.45]"
        onClick={() => inputRef.current?.focus()}
      >
        {lines.length === 0 ? (
          <p className="mb-2 text-muted-foreground/80">
            Shell in project root · Enter to run · Shift+Enter for newline · ↑↓ history
          </p>
        ) : null}
        {lines.map((line, i) => (
          <div
            key={i}
            className={cn(
              'whitespace-pre-wrap break-words',
              line.type === 'command' && 'text-emerald-400/95',
              line.type === 'stdout' && 'text-foreground/90',
              line.type === 'stderr' && 'text-red-400',
              line.type === 'info' && 'text-muted-foreground',
            )}
          >
            {line.text || '\u00A0'}
          </div>
        ))}

        <div className="mt-1 flex items-start gap-0">
          <span className="shrink-0 select-none pt-px text-emerald-400/95">$</span>
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            disabled={running}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            onChange={(e) => {
              setInput(e.target.value);
              if (historyIndex >= 0) setHistoryIndex(-1);
            }}
            onKeyDown={handleKeyDown}
            className="min-h-[18px] w-full flex-1 resize-none overflow-hidden bg-transparent pl-1.5 pt-px text-foreground outline-none placeholder:text-muted-foreground/50 disabled:opacity-50"
            placeholder={running ? 'Running…' : ''}
            aria-label="Terminal input"
          />
        </div>
      </div>
    </div>
  );
}
