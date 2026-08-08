import { useCallback, useEffect, useState } from 'react';
import { BookMarked, Network } from 'lucide-react';
import { MasterPlan } from '../MasterPlan';
import { MindMapIdeRoute } from './MindMapIdeRoute';
import {
  getBrowserProjectKey,
  getBrowserProjectName,
  setBrowserProjectName,
} from '../../lib/nebulaProjectApi';
import { advancePhaseAtLeast, writeProjectPhase } from '../../lib/ideProjectPhase';

type PlanView = 'plan' | 'mind-map';

/**
 * Single Plan surface: Master Plan (SoT) + Mind Map bound to the same project.
 */
function readPlanViewPref(): PlanView {
  try {
    const v = sessionStorage.getItem('nebula_plan_view');
    if (v === 'mind-map') return 'mind-map';
  } catch {
    /* ignore */
  }
  return 'plan';
}

export function IdePlanPage({ onClose }: { onClose: () => void }) {
  const [view, setView] = useState<PlanView>(() => readPlanViewPref());
  const [name, setName] = useState(() => getBrowserProjectName().trim() || '');
  const projectKey = getBrowserProjectKey();

  useEffect(() => {
    try {
      sessionStorage.setItem('nebula_plan_view', view);
    } catch {
      /* ignore */
    }
  }, [view]);

  useEffect(() => {
    const onOpenMind = () => setView('mind-map');
    const onOpenPlan = () => setView('plan');
    const onView = (ev: Event) => {
      const v = (ev as CustomEvent<{ view?: PlanView }>).detail?.view;
      if (v === 'plan' || v === 'mind-map') setView(v);
    };
    window.addEventListener('nebula-open-mind-map', onOpenMind);
    window.addEventListener('nebula-open-master-plan', onOpenPlan);
    window.addEventListener('nebula-plan-view', onView);
    return () => {
      window.removeEventListener('nebula-open-mind-map', onOpenMind);
      window.removeEventListener('nebula-open-master-plan', onOpenPlan);
      window.removeEventListener('nebula-plan-view', onView);
    };
  }, []);

  const commitName = useCallback(
    (opts?: { advanceRide?: boolean }) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const prev = getBrowserProjectName().trim();
      setBrowserProjectName(trimmed);
      advancePhaseAtLeast('plan');
      writeProjectPhase('plan');
      try {
        window.dispatchEvent(new CustomEvent('nebula-workspace-context-synced'));
        // First-run: advance to UI only on explicit Continue / Enter, not every blur.
        if (opts?.advanceRide) {
          window.dispatchEvent(new CustomEvent('nebula-project-named-for-ride'));
        } else if (trimmed !== prev && prev && !/^untitled/i.test(prev)) {
          /* renamed existing — keep phase only */
        }
      } catch {
        /* ignore */
      }
    },
    [name],
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-4 py-2.5">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <label className="text-[11px] text-muted-foreground" htmlFor="nebula-plan-project-name">
            Project name
          </label>
          <input
            id="nebula-plan-project-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => commitName()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitName({ advanceRide: true });
              }
            }}
            placeholder="Name this project"
            className="min-w-[12rem] flex-1 rounded-lg border border-border bg-black px-2.5 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
          />
          <button
            type="button"
            onClick={() => commitName({ advanceRide: true })}
            className="btn-cyan inline-flex items-center rounded-lg px-4 py-2 text-xs"
          >
            Continue
          </button>
          <span className="text-[10px] text-muted-foreground">Git optional — Source Control</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setView('plan')}
            aria-pressed={view === 'plan'}
            className="btn-cyan inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs"
          >
            <BookMarked className="h-3.5 w-3.5" aria-hidden />
            Master Plan
          </button>
          <button
            type="button"
            onClick={() => setView('mind-map')}
            aria-pressed={view === 'mind-map'}
            className="btn-cyan inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs"
          >
            <Network className="h-3.5 w-3.5" aria-hidden />
            Mind Map
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {view === 'plan' ? (
          <MasterPlan projectKey={projectKey} onClose={onClose} />
        ) : (
          <MindMapIdeRoute />
        )}
      </div>
    </div>
  );
}
