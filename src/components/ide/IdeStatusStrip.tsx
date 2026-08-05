import { useCallback, useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  NEBULA_PROJECT_PHASE_CHANGED,
  PROJECT_PHASES,
  PROJECT_PHASE_LABELS,
  isDeployUnlocked,
  isPhaseCompleted,
  navigateToProjectPhase,
  phaseStatusLine,
  readProjectPhase,
  type ProjectPhase,
} from '../../lib/ideProjectPhase';

/**
 * Permanent park-map of the project lifecycle. Clickable; never locks navigation.
 */
export function IdeStatusStrip() {
  const [phase, setPhase] = useState<ProjectPhase>(() => readProjectPhase());
  const [deployOk, setDeployOk] = useState(() => isDeployUnlocked());
  const [status, setStatus] = useState(() => phaseStatusLine(readProjectPhase()));
  const [codePulse, setCodePulse] = useState(false);
  const prevPhaseRef = useRef<ProjectPhase | null>(null);

  const refresh = useCallback(() => {
    const next = readProjectPhase();
    const unlocked = isDeployUnlocked();
    if (prevPhaseRef.current !== null && prevPhaseRef.current !== 'code' && next === 'code') {
      setCodePulse(true);
      window.setTimeout(() => setCodePulse(false), 2800);
    }
    prevPhaseRef.current = next;
    setPhase(next);
    setDeployOk(unlocked);
    setStatus(
      (next === 'deploy' || next === 'live') && !unlocked
        ? 'Deploy unlocks after your first UI result.'
        : phaseStatusLine(next),
    );
  }, []);

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener(NEBULA_PROJECT_PHASE_CHANGED, onChange);
    window.addEventListener('nebula-ui-studio-beta-complete', onChange);
    window.addEventListener('nebula-master-plan-updated', onChange);
    window.addEventListener('nebula-workspace-context-synced', onChange);
    return () => {
      window.removeEventListener(NEBULA_PROJECT_PHASE_CHANGED, onChange);
      window.removeEventListener('nebula-ui-studio-beta-complete', onChange);
      window.removeEventListener('nebula-master-plan-updated', onChange);
      window.removeEventListener('nebula-workspace-context-synced', onChange);
    };
  }, [refresh]);

  return (
    <div
      className="shrink-0 border-b border-border/80 bg-black/40 px-3 py-2 sm:px-4"
      role="navigation"
      aria-label="Project lifecycle"
    >
      <ol className="flex flex-wrap items-center gap-1 sm:gap-0">
        {PROJECT_PHASES.map((step, i) => {
          const current = step === phase;
          const done = isPhaseCompleted(step, phase);
          const locked = (step === 'deploy' || step === 'live') && !deployOk;
          return (
            <li key={step} className="flex items-center">
              {i > 0 ? (
                <span className="mx-1 hidden h-px w-3 bg-border sm:inline-block" aria-hidden />
              ) : null}
              <button
                type="button"
                onClick={() => navigateToProjectPhase(step)}
                title={
                  locked
                    ? 'Available after first UI'
                    : PROJECT_PHASE_LABELS[step]
                }
                className={cn(
                  'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-normal transition-colors',
                  current && 'bg-[#111111] text-foreground ring-1 ring-border',
                  step === 'code' && codePulse && 'ring-1 ring-foreground/35 bg-[#111111]/80',
                  done && !current && 'text-foreground/80',
                  !done && !current && 'text-muted-foreground hover:text-foreground',
                  locked && 'opacity-50',
                )}
              >
                {done ? (
                  <Check className="h-3 w-3 shrink-0 text-foreground/60" aria-hidden />
                ) : null}
                <span>{PROJECT_PHASE_LABELS[step]}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{status}</p>
    </div>
  );
}
