import { useCallback, useRef, useState } from 'react';
import { ChevronDown, Plus, Terminal, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchJson } from '../../lib/apiFetch';
import { withProjectBody, withProjectQuery } from '../../lib/nebulaProjectApi';

type Line = { type: 'command' | 'stdout' | 'stderr' | 'info'; text: string };

export function TerminalPanel() {
  const [isMinimized, setIsMinimized] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const appendLines = useCallback((next: Line[]) => {
    setLines((prev) => [...prev, ...next]);
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }));
  }, []);

  const runCommand = useCallback(async () => {
    const cmd = input.trim();
    if (!cmd || running) return;
    setRunning(true);
    setInput('');
    appendLines([{ type: 'command', text: `$ ${cmd}` }]);
    try {
      const data = await fetchJson<{ output?: string }>(withProjectQuery('/api/terminal/exec'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(withProjectBody({ command: cmd.slice(0, 4000) })),
      });
      const out = typeof data.output === 'string' ? data.output : '';
      if (out) {
        appendLines(out.split('\n').map((t) => ({ type: 'stdout' as const, text: t })));
      } else {
        appendLines([{ type: 'info', text: '(no output)' }]);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      appendLines([{ type: 'stderr', text: msg }]);
    } finally {
      setRunning(false);
    }
  }, [input, running, appendLines]);

  if (isMinimized) {
    return (
      <div className="surface-active tonal-seam-t flex h-8 items-center justify-between px-3">
        <div className="flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="type-label-sm">Terminal</span>
        </div>
        <button
          type="button"
          onClick={() => setIsMinimized(false)}
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronDown className="h-4 w-4 rotate-180" />
        </button>
      </div>
    );
  }

  return (
    <div className="surface-active tonal-seam-t flex h-full min-h-0 flex-col">
      <div className="tonal-seam-b flex h-8 shrink-0 items-center gap-2 px-2">
        <div className="surface-base type-label-sm flex items-center gap-1.5 rounded px-2 py-0.5 text-foreground">
          <Terminal className="h-3 w-3" />
          Terminal
        </div>
        <button
          type="button"
          title="Clear output"
          aria-label="Clear output"
          className="btn-secondary-surface rounded p-1 text-muted-foreground"
          onClick={() => setLines([])}
        >
          <Plus className="h-3 w-3 rotate-45" />
        </button>

        <div className="flex-1" />

        <button type="button" className="btn-secondary-surface rounded p-1 text-muted-foreground" onClick={() => setIsMinimized(true)}>
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="Minimize terminal"
          aria-label="Minimize terminal"
          className="btn-secondary-surface rounded p-1 text-muted-foreground"
          onClick={() => setIsMinimized(true)}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="type-body-md min-h-0 flex-1 overflow-auto bg-background p-3 font-mono leading-relaxed">
        {lines.length === 0 ? (
          <p className="text-muted-foreground">Run shell commands in the active workspace (cwd = project root).</p>
        ) : null}
        {lines.map((line, i) => (
          <div
            key={i}
            className={cn(
              line.type === 'command' && 'text-foreground',
              line.type === 'stdout' && 'text-foreground/90',
              line.type === 'stderr' && 'text-destructive',
              line.type === 'info' && 'text-muted-foreground',
            )}
          >
            {line.text || '\u00A0'}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="tonal-seam-t flex shrink-0 gap-2 border-t border-white/5 p-2">
        <span className="type-body-md shrink-0 self-center text-primary">$</span>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void runCommand();
            }
          }}
          disabled={running}
          placeholder="Command…"
          className="type-body-md min-w-0 flex-1 bg-transparent font-mono text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-50"
          aria-label="Terminal command"
        />
        <button
          type="button"
          disabled={running || !input.trim()}
          onClick={() => void runCommand()}
          className="btn-primary-cta type-label-sm shrink-0 rounded-md px-3 py-1.5 disabled:opacity-40"
        >
          {running ? '…' : 'Run'}
        </button>
      </div>
    </div>
  );
}
