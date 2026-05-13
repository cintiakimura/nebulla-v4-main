import { useState } from 'react';
import { AlignLeft, ChevronDown, Play, Plus, Square, Terminal, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const terminalOutput = [
  { type: 'command', text: '$ pnpm dev' },
  { type: 'info', text: '' },
  { type: 'success', text: '  ▲ Next.js 15.1.0' },
  { type: 'info', text: '  - Local:        http://localhost:3000' },
  { type: 'muted', text: '  - Network:      http://192.168.1.5:3000' },
  { type: 'info', text: '' },
  { type: 'success', text: ' ✓ Starting...' },
  { type: 'success', text: ' ✓ Ready in 1.2s' },
  { type: 'info', text: '' },
  { type: 'info', text: ' ○ Compiling /page ...' },
  { type: 'success', text: ' ✓ Compiled /page in 234ms' },
  { type: 'warning', text: ' ⚠ ./src/hooks/useAuth.ts' },
  { type: 'muted', text: "   Exported 'validateToken' is unused" },
  { type: 'info', text: '' },
] as const;

export function TerminalPanel() {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isRunning, setIsRunning] = useState(true);
  const [verbose, setVerbose] = useState(false);

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
    <div className="surface-active tonal-seam-t flex h-full flex-col">
      <div className="tonal-seam-b flex h-8 shrink-0 items-center gap-2 px-2">
        <div className="surface-base type-label-sm flex items-center gap-1.5 rounded px-2 py-0.5 text-foreground">
          <Terminal className="h-3 w-3" />
          Terminal
        </div>
        <button type="button" className="btn-secondary-surface rounded p-1 text-muted-foreground">
          <Plus className="h-3 w-3" />
        </button>

        <div className="flex-1" />

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setIsRunning(!isRunning)}
            title={isRunning ? 'Stop' : 'Run'}
            className={cn(
              'btn-secondary-surface flex h-6 w-6 items-center justify-center rounded',
              isRunning ? 'text-destructive' : 'text-primary',
            )}
          >
            {isRunning ? <Square className="h-3.5 w-3.5 fill-current" /> : <Play className="h-3.5 w-3.5 fill-current" />}
          </button>

          <button
            type="button"
            onClick={() => setVerbose(!verbose)}
            title="Verbose output"
            className={cn(
              'btn-secondary-surface flex h-6 items-center gap-1 rounded px-1.5 text-[10px] text-muted-foreground',
              verbose && 'active-tab-sheen text-primary',
            )}
          >
            <AlignLeft className="h-3 w-3" />
            Verbose
          </button>

          <button type="button" className="btn-secondary-surface rounded p-1 text-muted-foreground" onClick={() => setIsMinimized(true)}>
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <button type="button" className="btn-secondary-surface rounded p-1 text-muted-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="type-body-md flex-1 overflow-auto bg-background p-3 font-mono leading-relaxed">
        {terminalOutput.map((line, i) => (
          <div
            key={i}
            className={cn(
              line.type === 'command' && 'text-foreground',
              line.type === 'success' && 'text-[#3FB950]',
              line.type === 'warning' && 'text-[#D29922]',
              line.type === 'muted' && 'text-muted-foreground',
              line.type === 'info' && 'text-foreground',
            )}
          >
            {line.text || '\u00A0'}
          </div>
        ))}
        <div className="flex items-center gap-1 text-foreground">
          <span className="text-primary">$</span>
          <span className="animate-pulse">▋</span>
        </div>
      </div>
    </div>
  );
}
