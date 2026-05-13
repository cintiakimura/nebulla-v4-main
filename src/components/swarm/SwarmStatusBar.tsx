'use client';

import { useSwarm } from './SwarmProvider';
import { Loader2, Network } from 'lucide-react';

export function SwarmStatusBar() {
  const { isRunning, activeAgents, currentPhase, intensity, isEnabled } = useSwarm();

  if (isRunning) {
    const hasReviewer = activeAgents.includes('reviewer');
    const statusHint = hasReviewer
      ? 'Planner, Researcher, Tester in parallel; then Reviewer (Grok 4.1).'
      : 'Support agents running in parallel.';

    return (
      <div className="flex shrink-0 flex-col gap-1.5 border-b border-primary/25 bg-primary/10 px-3 py-2.5 text-xs sm:flex-row sm:items-center sm:gap-3 sm:text-sm">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden />
          <span className="font-semibold text-foreground">
            Swarm running · {currentPhase.replace(/_/g, ' ')} · {intensity.replace(/_/g, ' ')}
          </span>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground sm:text-xs">
          {activeAgents.map((agent) => (
            <span key={agent} className="capitalize">
              {agent}
            </span>
          ))}
        </div>
        <span className="text-[11px] font-medium text-primary sm:ml-auto sm:text-xs">{statusHint}</span>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-muted/35 px-3 py-2 text-[11px] text-muted-foreground sm:text-xs">
      <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
        <Network className="h-3.5 w-3.5 text-primary/90" aria-hidden />
        Swarm
      </span>
      <span
        className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
          isEnabled ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
        }`}
      >
        {isEnabled ? 'On' : 'Off'}
      </span>
      <span className="text-muted-foreground">
        Intensity: <span className="text-foreground/90">{intensity.replace(/_/g, ' ')}</span>
        {' · '}
        Handoff when execution rules allow agents to run.
      </span>
    </div>
  );
}
