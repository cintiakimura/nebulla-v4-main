/**
 * Project lifecycle phase for the IDE status strip + first-run ride.
 * Strip is always on; auto-open only while onboarding_ride_active.
 */
import { getBrowserProjectKey, getBrowserProjectName } from './nebulaProjectApi';
import { dispatchOpenLeftSidebar } from './ideLeftSidebar';

function openCenterPane(pane: string): void {
  try {
    window.dispatchEvent(new CustomEvent('nebula-center-open-panel', { detail: { pane } }));
  } catch {
    /* ignore */
  }
}

export type ProjectPhase = 'brainstorm' | 'plan' | 'ui' | 'code' | 'deploy' | 'live';

export const PROJECT_PHASES: ProjectPhase[] = [
  'brainstorm',
  'plan',
  'ui',
  'code',
  'deploy',
  'live',
];

export const PROJECT_PHASE_LABELS: Record<ProjectPhase, string> = {
  brainstorm: 'Brainstorm',
  plan: 'Plan',
  ui: 'UI',
  code: 'Code',
  deploy: 'Deploy',
  live: 'Live',
};

const PHASE_STATUS: Record<ProjectPhase, string> = {
  brainstorm: 'Shaping the idea — tell Nebulla what you’re building.',
  plan: 'Structure from your idea — name the project to continue.',
  ui: 'Generating intentional UI from your plan.',
  code: 'Optional — open Code when you want to edit files.',
  deploy: 'Ready when you are — deploy this version.',
  live: 'Custom domain & DNS — only if you need it.',
};

const PHASE_LS_PREFIX = 'nebula_project_phase_v1:';
const RIDE_LS_PREFIX = 'nebula_onboarding_ride_v1:';
const UI_DONE_LS_PREFIX = 'nebula_phase_ui_done_v1:';
const USER_JUMPED_SESSION = 'nebula_phase_user_jumped_session';

export const NEBULA_PROJECT_PHASE_CHANGED = 'nebula-project-phase-changed';

/** Session-only status line override (ride handoffs). */
let rideStatusOverride: string | null = null;

function storageKey(prefix: string, projectKey?: string): string {
  return `${prefix}${projectKey || getBrowserProjectKey() || 'default'}`;
}

export function phaseStatusLine(phase: ProjectPhase): string {
  if (rideStatusOverride) return rideStatusOverride;
  return PHASE_STATUS[phase];
}

export function setRideStatusOverride(message: string | null): void {
  rideStatusOverride = message?.trim() || null;
  try {
    window.dispatchEvent(new CustomEvent(NEBULA_PROJECT_PHASE_CHANGED, { detail: { override: true } }));
  } catch {
    /* ignore */
  }
}

export function getRideStatusOverride(): string | null {
  return rideStatusOverride;
}

export function readProjectPhase(projectKey?: string): ProjectPhase {
  try {
    const raw = localStorage.getItem(storageKey(PHASE_LS_PREFIX, projectKey))?.trim();
    if (raw && PROJECT_PHASES.includes(raw as ProjectPhase)) return raw as ProjectPhase;
  } catch {
    /* ignore */
  }
  return 'brainstorm';
}

export function writeProjectPhase(phase: ProjectPhase, projectKey?: string): void {
  try {
    localStorage.setItem(storageKey(PHASE_LS_PREFIX, projectKey), phase);
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(
      new CustomEvent(NEBULA_PROJECT_PHASE_CHANGED, { detail: { phase, projectKey } }),
    );
  } catch {
    /* ignore */
  }
}

export function isOnboardingRideActive(projectKey?: string): boolean {
  try {
    return localStorage.getItem(storageKey(RIDE_LS_PREFIX, projectKey)) === '1';
  } catch {
    return false;
  }
}

export function setOnboardingRideActive(active: boolean, projectKey?: string): void {
  try {
    const key = storageKey(RIDE_LS_PREFIX, projectKey);
    if (active) localStorage.setItem(key, '1');
    else localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new CustomEvent(NEBULA_PROJECT_PHASE_CHANGED, { detail: { projectKey } }));
  } catch {
    /* ignore */
  }
}

export function markUiPhaseComplete(projectKey?: string): void {
  try {
    localStorage.setItem(storageKey(UI_DONE_LS_PREFIX, projectKey), '1');
  } catch {
    /* ignore */
  }
}

export function hasUiPhaseComplete(projectKey?: string): boolean {
  try {
    return localStorage.getItem(storageKey(UI_DONE_LS_PREFIX, projectKey)) === '1';
  } catch {
    return false;
  }
}

/** Deploy/Live unlock: named project + first UI result (or explicit ui-done flag). */
export function isDeployUnlocked(projectKey?: string): boolean {
  const name = getBrowserProjectName().trim();
  const named = Boolean(name && !/^untitled/i.test(name));
  return named && hasUiPhaseComplete(projectKey);
}

export function phaseIndex(phase: ProjectPhase): number {
  return PROJECT_PHASES.indexOf(phase);
}

export function isPhaseCompleted(step: ProjectPhase, current: ProjectPhase): boolean {
  return phaseIndex(step) < phaseIndex(current);
}

/** Session flag: user clicked strip/nav ahead — stop auto-opens for this tab session. */
export function markUserJumpedPhase(): void {
  try {
    sessionStorage.setItem(USER_JUMPED_SESSION, '1');
  } catch {
    /* ignore */
  }
}

export function didUserJumpPhase(): boolean {
  try {
    return sessionStorage.getItem(USER_JUMPED_SESSION) === '1';
  } catch {
    return false;
  }
}

export function clearUserJumpedPhase(): void {
  try {
    sessionStorage.removeItem(USER_JUMPED_SESSION);
  } catch {
    /* ignore */
  }
}

/** Start ride for a fresh New Project flow. */
export function beginOnboardingRide(projectKey?: string): void {
  clearUserJumpedPhase();
  setOnboardingRideActive(true, projectKey);
  writeProjectPhase('brainstorm', projectKey);
}

/** End auto-open ride after first Plan→UI loop; keep strip. */
export function completeOnboardingRide(projectKey?: string): void {
  markUiPhaseComplete(projectKey);
  setOnboardingRideActive(false, projectKey);
  const cur = readProjectPhase(projectKey);
  if (phaseIndex(cur) < phaseIndex('code')) {
    writeProjectPhase('code', projectKey);
  }
}

export function navigateToProjectPhase(phase: ProjectPhase): void {
  markUserJumpedPhase();
  writeProjectPhase(phase);

  switch (phase) {
    case 'brainstorm':
      openCenterPane('projects');
      break;
    case 'plan':
      openCenterPane('master-plan');
      break;
    case 'ui':
      openCenterPane('ui-studio-beta');
      break;
    case 'code':
      dispatchOpenLeftSidebar('explorer');
      break;
    case 'deploy':
    case 'live':
      if (isDeployUnlocked()) {
        openCenterPane('secrets');
      }
      // Locked: strip status line explains; no force-open
      break;
    default:
      break;
  }
}

/** Infer phase from center pane (user navigation sync). */
export function phaseFromCenterPane(pane: string | null | undefined): ProjectPhase | null {
  if (!pane) return null;
  if (pane === 'projects') return 'brainstorm';
  if (pane === 'master-plan' || pane === 'mind-map') return 'plan';
  if (pane === 'ui-studio' || pane === 'ui-studio-beta') return 'ui';
  if (pane === 'secrets' || pane === 'dns') return isDeployUnlocked() ? 'deploy' : null;
  if (pane === 'preview') return 'code';
  return null;
}

export function advancePhaseAtLeast(target: ProjectPhase, projectKey?: string): void {
  const cur = readProjectPhase(projectKey);
  if (phaseIndex(target) > phaseIndex(cur)) {
    writeProjectPhase(target, projectKey);
  }
}
