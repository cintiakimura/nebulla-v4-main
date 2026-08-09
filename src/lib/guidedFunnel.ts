/**
 * Guided product funnel (T1–T8) — navigation/events only.
 * One-shot guards prevent double-navigation per stage.
 */

import { writeStoredShellScreen } from './ideShellScreens';

const ENTER_BUILD_KEY = 'nebula_guided_enter_build_v1';
const FORCE_DASHBOARD_KEY = 'nebula_guided_force_dashboard_v1';
const CYCLE_KEY = 'nebula_guided_cycle_v1';

export type GuidedCycleFlags = {
  /** T2 Done already navigated to Code this cycle */
  doneToCode?: boolean;
  /** T4 commit success already navigated to Plan */
  commitToPlan?: boolean;
  /** T5/T6 deploy→URL→docs cycle started / docs prompt shown */
  deployDocsShown?: boolean;
};

function readLs(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLs(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function removeLs(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function readCycle(): GuidedCycleFlags {
  try {
    const raw = readLs(CYCLE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as GuidedCycleFlags;
  } catch {
    return {};
  }
}

function writeCycle(next: GuidedCycleFlags): void {
  writeLs(CYCLE_KEY, JSON.stringify(next));
}

/** New project / landing Build — reset stage guards for a fresh funnel. */
export function resetGuidedCycle(): void {
  removeLs(CYCLE_KEY);
}

/** T1: landing Build → enter Build (and start existing pipeline via handoff). */
export function markGuidedEnterBuild(): void {
  writeLs(ENTER_BUILD_KEY, '1');
  removeLs(FORCE_DASHBOARD_KEY);
  resetGuidedCycle();
  writeStoredShellScreen('build');
}

export function consumeGuidedEnterBuild(): boolean {
  if (readLs(ENTER_BUILD_KEY) !== '1') return false;
  removeLs(ENTER_BUILD_KEY);
  return true;
}

/** T8: return visit / post-login → Dashboard once. */
export function markForceDashboardOnce(): void {
  writeLs(FORCE_DASHBOARD_KEY, '1');
  removeLs(ENTER_BUILD_KEY);
  writeStoredShellScreen('dashboard');
}

export function consumeForceDashboardOnce(): boolean {
  if (readLs(FORCE_DASHBOARD_KEY) !== '1') return false;
  removeLs(FORCE_DASHBOARD_KEY);
  return true;
}

/** T2: Done → Code + pulse git. Returns false if already fired this cycle. */
export function tryGuidedDoneToCode(): boolean {
  const c = readCycle();
  if (c.doneToCode) return false;
  writeCycle({ ...c, doneToCode: true });
  writeStoredShellScreen('code');
  dispatchGuidedNav('code');
  pulseGuided('git');
  return true;
}

/** T4: successful commit → Plan + pulse deploy. */
export function tryGuidedCommitSuccessToPlan(): boolean {
  const c = readCycle();
  if (c.commitToPlan) return false;
  writeCycle({ ...c, commitToPlan: true });
  writeStoredShellScreen('plan');
  dispatchGuidedNav('plan');
  pulseGuided('deploy');
  return true;
}

/**
 * T5 success arm: open URL popup (listener). Returns false if docs cycle already used.
 * Call only after deploy attempt resolves OK / URL known.
 */
export function tryGuidedOpenLiveUrlPopup(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) return false;
  const c = readCycle();
  if (c.deployDocsShown) return false;
  writeCycle({ ...c, deployDocsShown: true });
  try {
    window.dispatchEvent(
      new CustomEvent('nebula-guided-live-url', { detail: { url: trimmed } }),
    );
  } catch {
    /* ignore */
  }
  return true;
}

/** After URL confirm/dismiss → docs popup (always once after URL event). */
export function dispatchGuidedDocsPrompt(): void {
  try {
    window.dispatchEvent(new CustomEvent('nebula-guided-docs-prompt'));
  } catch {
    /* ignore */
  }
}

/** T7: after docs Download|Skip → Dashboard. */
export function guidedFinishToDashboard(): void {
  writeStoredShellScreen('dashboard');
  dispatchGuidedNav('dashboard');
}

export type GuidedNavScreen = 'build' | 'code' | 'plan' | 'dashboard';

export function dispatchGuidedNav(screen: GuidedNavScreen): void {
  try {
    window.dispatchEvent(new CustomEvent('nebula-guided-nav', { detail: { screen } }));
  } catch {
    /* ignore */
  }
}

export type GuidedPulseKind = 'git' | 'deploy';

export function pulseGuided(kind: GuidedPulseKind): void {
  try {
    window.dispatchEvent(new CustomEvent('nebula-guided-pulse', { detail: { kind } }));
  } catch {
    /* ignore */
  }
}

/** Stub markdown when technical-documentation API fails. */
export function downloadGuidedDocsStub(): void {
  const body = `# Nebulla — Technical documentation

_This is a placeholder export. The Master Plan technical documentation API was unavailable._

Generated: ${new Date().toISOString()}

## Next steps
- Open Plan → Master Plan → Export technical documentation when the API is ready.
`;
  const blob = new Blob([body], { type: 'text/markdown;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = 'nebulla-technical-documentation.md';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}
