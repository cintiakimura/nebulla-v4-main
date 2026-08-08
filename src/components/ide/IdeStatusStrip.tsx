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
 * Header: steps only (detail lines live in App Status / UI Studio, not under the strip).
 */
export function IdeStatusStrip({ variant = 'header' }: { variant?: 'header' | 'banner' }) {
  const [phase, setPhase] = useState<ProjectPhase>(() => readProjectPhase());
  const [deployOk, setDeployOk] = useState(() => isDeployUnlocked());
  const [status, setStatus] = useState(() => phaseStatusLine(readProjectPhase()));
  const [codePulse, setCodePulse] = useState(false);
  const prevPhaseRef = useRef<ProjectPhase | null>(null);
  const inHeader = variant === 'header';

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
    // Header uses static phase copy only — never ride overrides (those go to App Status / Studio).
    const base =
      (next === 'deploy' || next === 'live') && !unlocked
        ? 'Deploy unlocks after your first UI result.'
        : ({
            brainstorm: 'Shaping the idea — tell Nebulla what you’re building.',
            plan: 'Structure from your idea — name the project to continue.',
            ui: 'Open UI Studio to generate and refine.',
            code: 'Optional — open Code when you want to edit files.',
            deploy: 'Ready when you are — deploy this version.',
            live: 'Custom domain & DNS — only if you need it.',
          } as Record<ProjectPhase, string>)[next];
    setStatus(base);
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
      className={cn(
        inHeader
          ? 'flex min-w-0 flex-1 flex-col items-center justify-center px-2 py-0.5'
          : 'shrink-0 border-b border-border/80 bg-black/40 px-3 py-2 sm:px-4',
      )}
      role="navigation"
      aria-label="Project lifecycle"
      title={status}
    >
      <ol
        className={cn(
          'flex items-center',
          inHeader ? 'max-w-full flex-nowrap gap-0 overflow-x-auto' : 'flex-wrap gap-1 sm:gap-0',
        )}
      >
        {PROJECT_PHASES.map((step, i) => {
          const current = step === phase;
          const done = isPhaseCompleted(step, phase);
          const locked = (step === 'deploy' || step === 'live') && !deployOk;
          return (
            <li key={step} className="flex shrink-0 items-center">
              {i > 0 ? (
                <span
                  className={cn(
                    'mx-0.5 h-px bg-border sm:mx-1',
                    inHeader ? 'w-2 lg:w-3' : 'hidden w-3 sm:inline-block',
                  )}
                  aria-hidden
                />
              ) : null}
              <button
                type="button"
                onClick={() => navigateToProjectPhase(step)}
                title={
                  locked
                    ? 'Available after first UI'
                    : `${PROJECT_PHASE_LABELS[step]}${current ? ` — ${status}` : ''}`
                }
                className={cn(
                  'inline-flex items-center gap-0.5 rounded-md font-normal transition-colors',
                  inHeader ? 'px-1.5 py-0.5 text-[10px] lg:px-2 lg:text-[11px]' : 'gap-1 px-2 py-1 text-[11px]',
                  current && 'bg-[#111111] text-foreground ring-1 ring-primary/50',
                  step === 'code' && codePulse && 'ring-1 ring-primary/60 bg-[#111111]/80',
                  done && !current && 'text-foreground/80',
                  !done && !current && 'text-muted-foreground hover:text-foreground',
                  locked && 'opacity-50',
                )}
              >
                {done ? (
                  <Check className="h-2.5 w-2.5 shrink-0 text-foreground/60 lg:h-3 lg:w-3" aria-hidden />
                ) : null}
                <span>{PROJECT_PHASE_LABELS[step]}</span>
              </button>
            </li>
          );
        })}
      </ol>
      {/* Banner variant only — header keeps steps; detail belongs in App Status / UI Studio */}
      {!inHeader ? (
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{status}</p>
      ) : null}
    </div>
  );
}
