import React, { useCallback, useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { fetchMasterPlanStatus, type MasterPlanStatus } from '../../lib/masterPlanStatus';
import { getAppRuntimeSnapshot, subscribeAppRuntime } from '../../lib/ideAppRuntimeStatus';
import { computeIdeNextAction, type IdeNextAction } from '../../lib/ideNextAction';
import { useIdeWorkspace } from './IdeWorkspaceContext';

/**
 * Lightweight "what next?" strip — not a six-phase dashboard.
 */
export function IdeNextActionBar() {
  const { assistantInteractionMode } = useIdeWorkspace();
  const [status, setStatus] = useState<MasterPlanStatus | null>(null);
  const [action, setAction] = useState<IdeNextAction | null>(null);

  const refresh = useCallback(() => {
    void fetchMasterPlanStatus().then((s) => {
      setStatus(s);
      const next = computeIdeNextAction({
        masterPlanStatus: s,
        appRuntime: getAppRuntimeSnapshot(),
        interactionMode: assistantInteractionMode === 'agent' ? 'agent' : 'chat',
      });
      setAction(next);
    });
  }, [assistantInteractionMode]);

  useEffect(() => {
    refresh();
    const onMp = () => refresh();
    window.addEventListener('nebula-master-plan-updated', onMp);
    const unsub = subscribeAppRuntime(() => {
      const next = computeIdeNextAction({
        masterPlanStatus: status,
        appRuntime: getAppRuntimeSnapshot(),
        interactionMode: assistantInteractionMode === 'agent' ? 'agent' : 'chat',
      });
      setAction(next);
    });
    return () => {
      window.removeEventListener('nebula-master-plan-updated', onMp);
      unsub();
    };
  }, [refresh, status, assistantInteractionMode]);

  if (!action) return null;

  return (
    <div className="mx-3 mb-1 flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-foreground/90">
      <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">Next</span>
      <button
        type="button"
        className="inline-flex min-w-0 flex-1 items-center gap-1.5 text-left font-medium hover:text-primary"
        onClick={() => {
          if (action.event) {
            window.dispatchEvent(new CustomEvent(action.event));
          }
        }}
        title={action.detail}
      >
        <span className="truncate">{action.label}</span>
        <ArrowRight className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
      </button>
      <span className="hidden max-w-[45%] truncate text-[10px] text-muted-foreground sm:inline">
        {action.detail}
      </span>
    </div>
  );
}
