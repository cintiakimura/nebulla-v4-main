/**
 * Single recommended next action for the IDE (Layer 5).
 */
import type { MasterPlanStatus } from './masterPlanStatus';
import type { AppRuntimeSnapshot } from './ideAppRuntimeStatus';
import { isMasterPlanCompleteForDiscovery } from './masterPlanSections';

export type IdeNextAction = {
  id: string;
  label: string;
  detail: string;
  /** Optional product event to dispatch when user clicks */
  event?: string;
};

export function computeIdeNextAction(opts: {
  masterPlanStatus: MasterPlanStatus | null;
  masterPlanRaw?: Record<string, unknown> | null;
  appRuntime: AppRuntimeSnapshot;
  interactionMode: 'chat' | 'agent';
}): IdeNextAction {
  const { masterPlanStatus, masterPlanRaw, appRuntime, interactionMode } = opts;
  const errors = appRuntime.issues.filter((i) => i.severity === 'error' || i.severity === 'warn');

  if (appRuntime.pendingValidation) {
    return {
      id: 'validate-slice',
      label: 'Validate last slice',
      detail: 'Reload Preview and wait for App Status to clear before the next Go.',
      event: 'nebula-reload-app-preview',
    };
  }
  if (errors.length > 0) {
    return {
      id: 'fix-app-status',
      label: 'Fix with Agent',
      detail: 'App Status has issues — open App Status and fix with evidence.',
      event: 'nebula-open-app-status',
    };
  }

  const complete =
    masterPlanStatus?.shape === 'complete' &&
    (masterPlanStatus.gaps?.filter((g) => g.severity === 'block').length ?? 0) === 0
      ? true
      : masterPlanRaw
        ? isMasterPlanCompleteForDiscovery(masterPlanRaw)
        : false;

  if (!complete) {
    // Security baseline is auto-applied assumptions — never the primary next action / Go blocker.
    return {
      id: 'discovery',
      label: 'Continue Discovery',
      detail: 'Finish pages, research, and design tokens one question at a time.',
    };
  }

  if (typeof masterPlanStatus?.uiBriefLength === 'number' && masterPlanStatus.uiBriefLength < 80) {
    return {
      id: 'ui-brief',
      label: 'Save Master Plan for UI brief',
      detail: 'Page contracts need a UI brief before Generate UI.',
      event: 'nebula-open-master-plan',
    };
  }

  if (interactionMode === 'chat') {
    return {
      id: 'switch-agent',
      label: 'Switch to Agent to build',
      detail: 'Plan looks ready — Agent mode runs Go and file applies.',
    };
  }

  return {
    id: 'go-foundation',
    label: 'Go: next slice',
    detail: 'One coherent slice (Foundation → Auth → Data+API → Primary…). Validate after.',
  };
}
