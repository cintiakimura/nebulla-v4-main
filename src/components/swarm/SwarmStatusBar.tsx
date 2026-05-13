'use client';

import { useSwarm } from './SwarmProvider';
import { Loader2 } from 'lucide-react';

export function SwarmStatusBar() {
  const { isRunning, activeAgents, currentPhase, intensity } = useSwarm();

  if (!isRunning) return null;

  const hasReviewer = activeAgents.includes('reviewer');
  const statusHint = hasReviewer
    ? 'Planner, Researcher, Tester run in parallel; then Reviewer (Grok 4.1).'
    : 'Support agents running in parallel.';

  return (
    <div className="flex flex-col gap-1 bg-muted/80 border-b px-6 py-2 text-sm sm:flex-row sm:items-center sm:gap-3">
      <div className="flex items-center gap-3">
        <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
        <span className="font-medium">
          Swarm — phase {currentPhase.replace('_', ' ')} ({intensity.replace(/_/g, ' ')})
        </span>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
        {activeAgents.map((agent) => (
          <span key={agent} className="capitalize">
            • {agent}
          </span>
        ))}
      </div>

      <span className="sm:ml-auto text-xs text-emerald-600 font-medium">{statusHint}</span>
    </div>
  );
}
