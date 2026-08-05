/**
 * Lightweight first-run sequencer: open surfaces once while ride is active.
 * Never fights user strip/nav jumps.
 */
import {
  advancePhaseAtLeast,
  beginOnboardingRide,
  completeOnboardingRide,
  didUserJumpPhase,
  hasUiPhaseComplete,
  isOnboardingRideActive,
  setRideStatusOverride,
  writeProjectPhase,
} from './ideProjectPhase';
import { getBrowserProjectName } from './nebulaProjectApi';
import { fetchMasterPlanStatus } from './masterPlanStatus';
import { dispatchUiStudioBetaRun } from './uiStudioBetaEngine';

const openedThisSession = new Set<string>();
let firstGenerateAttempted = false;

function openOnce(key: string, pane: string): void {
  if (openedThisSession.has(key)) return;
  if (didUserJumpPhase()) return;
  if (!isOnboardingRideActive()) return;
  openedThisSession.add(key);
  try {
    window.dispatchEvent(new CustomEvent('nebula-center-open-panel', { detail: { pane } }));
  } catch {
    /* ignore */
  }
}

function namedProject(): boolean {
  const n = getBrowserProjectName().trim();
  return Boolean(n && !/^untitled/i.test(n));
}

/** Enough plan/brief to run UI Gen without wasting tokens on empty input. */
async function isBriefReadyForFirstUi(): Promise<boolean> {
  const st = await fetchMasterPlanStatus();
  if (!st) return false;
  if (typeof st.uiBriefLength === 'number' && st.uiBriefLength >= 80) return true;
  if (st.allowGo) return true;
  if (st.shape === 'complete') return true;
  const goal = st.sectionLengths?.['1. Goal of the app'] ?? 0;
  const pages = st.sectionLengths?.['4. Pages and navigation'] ?? 0;
  const ui = st.sectionLengths?.['5. UI/UX design'] ?? 0;
  return goal >= 40 && (pages >= 40 || ui >= 40);
}

/** Open UI Studio then run first generate once if brief-ready. */
async function maybeFirstUiGenerate(): Promise<void> {
  if (firstGenerateAttempted || didUserJumpPhase() || !isOnboardingRideActive()) return;

  // Let IdeUiStudioBeta mount and attach its run listener.
  await new Promise((r) => window.setTimeout(r, 700));
  if (didUserJumpPhase() || !isOnboardingRideActive() || firstGenerateAttempted) return;

  const ready = await isBriefReadyForFirstUi();
  if (!ready) {
    setRideStatusOverride(
      'UI Studio is open — finish Discovery / Save Master Plan so the brief is ready, then Generate UI.',
    );
    return;
  }

  firstGenerateAttempted = true;
  setRideStatusOverride('Generating intentional UI from your plan…');
  dispatchUiStudioBetaRun({
    autoTriggered: true,
    projectName: getBrowserProjectName().trim() || undefined,
    openPane: false,
  });
}

/** Call when New Project / guided start begins. */
export function onRideGuidedStart(): void {
  if (hasUiPhaseComplete()) return;
  beginOnboardingRide();
  openedThisSession.clear();
  firstGenerateAttempted = false;
  setRideStatusOverride(null);
  // Idea/type already queued from My Projects → open Plan once chat is ready.
  window.setTimeout(() => onRideIntentCaptured(), 900);
}

/** Intent captured (idea / type) → open Plan once. */
export function onRideIntentCaptured(): void {
  if (!isOnboardingRideActive()) return;
  advancePhaseAtLeast('plan');
  openOnce('plan', 'master-plan');
}

/** Project named → open UI Studio once; first generate if brief-ready. */
export function onRideProjectNamed(): void {
  if (!isOnboardingRideActive()) return;
  if (!namedProject()) return;
  advancePhaseAtLeast('ui');
  openOnce('ui', 'ui-studio-beta');
  void maybeFirstUiGenerate();
}

/** First successful UI cycle → end ride, soft Code phase. */
export function onRideFirstUiComplete(ev?: Event): void {
  const detail = (ev as CustomEvent<{ ok?: boolean }> | undefined)?.detail;
  if (detail && detail.ok === false) return;
  setRideStatusOverride(null);
  completeOnboardingRide();
}

/** Sync phase when user opens a center pane (no auto-open). */
export function onRideCenterPaneOpened(pane: string): void {
  if (pane === 'master-plan' || pane === 'mind-map') {
    advancePhaseAtLeast('plan');
  } else if (pane === 'ui-studio' || pane === 'ui-studio-beta') {
    advancePhaseAtLeast('ui');
  }
}

export function installOnboardingRideListeners(): () => void {
  const onGuided = () => onRideGuidedStart();
  const onUiDone = (ev: Event) => onRideFirstUiComplete(ev);
  const onNamedForRide = () => onRideProjectNamed();
  const onWorkspaceSync = () => {
    if (namedProject() && isOnboardingRideActive()) {
      advancePhaseAtLeast('plan');
    }
  };
  /** If brief arrives after Studio opened, retry first generate once. */
  const onPlanUpdated = () => {
    if (!isOnboardingRideActive() || firstGenerateAttempted) return;
    if (openedThisSession.has('ui')) void maybeFirstUiGenerate();
  };

  window.addEventListener('nebula-start-guided-chat', onGuided);
  window.addEventListener('nebula-ui-studio-beta-complete', onUiDone);
  window.addEventListener('nebula-project-named-for-ride', onNamedForRide);
  window.addEventListener('nebula-workspace-context-synced', onWorkspaceSync);
  window.addEventListener('nebula-master-plan-updated', onPlanUpdated);

  return () => {
    window.removeEventListener('nebula-start-guided-chat', onGuided);
    window.removeEventListener('nebula-ui-studio-beta-complete', onUiDone);
    window.removeEventListener('nebula-project-named-for-ride', onNamedForRide);
    window.removeEventListener('nebula-workspace-context-synced', onWorkspaceSync);
    window.removeEventListener('nebula-master-plan-updated', onPlanUpdated);
  };
}

/** After idea prompt saved — advance toward Plan. */
export function onRideIdeaSaved(): void {
  if (!isOnboardingRideActive()) {
    beginOnboardingRide();
  }
  writeProjectPhase('brainstorm');
  window.setTimeout(() => onRideIntentCaptured(), 400);
}
