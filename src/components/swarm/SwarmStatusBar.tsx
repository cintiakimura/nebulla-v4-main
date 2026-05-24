'use client';

import { useSwarm } from './SwarmProvider';
import { Loader2, ShieldCheck } from 'lucide-react';

export function SwarmStatusBar() {
  const { isRunning, activeAgents } = useSwarm();

  if (isRunning) {
    return (
      <div className="flex shrink-0 flex-col gap-1.5 border-b border-primary/25 bg-primary/10 px-3 py-2.5 text-xs sm:flex-row sm:items-center sm:gap-3 sm:text-sm">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden />
          <span className="text-foreground" style={{ fontWeight: 500 }}>
            Inspect — Quality (Grok)
          </span>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground sm:text-xs">
          {activeAgents.map((agent) => (
            <span key={agent} className="capitalize">
              {agent}
            </span>
          ))}
        </div>
        <span className="text-[11px] font-medium text-primary sm:ml-auto sm:text-xs">
          Code review and test suggestions on the active editor scope.
        </span>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-muted/35 px-3 py-2 text-[11px] text-muted-foreground sm:text-xs">
      <span className="inline-flex items-center gap-1.5 text-foreground" style={{ fontWeight: 500 }}>
        <ShieldCheck className="h-3.5 w-3.5 text-primary/90" aria-hidden />
        Quality
      </span>
      <span className="text-muted-foreground">
        Run <span className="text-foreground/90">Inspect</span> in the IDE top bar for a manual review pass on open files.
      </span>
    </div>
  );
}
