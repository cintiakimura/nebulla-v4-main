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
  writeProjectPhase,
} from './ideProjectPhase';
import { getBrowserProjectName } from './nebulaProjectApi';

const openedThisSession = new Set<string>();

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

/** Call when New Project / guided start begins. */
export function onRideGuidedStart(): void {
  if (hasUiPhaseComplete()) return;
  beginOnboardingRide();
  openedThisSession.clear();
  // Idea/type already queued from My Projects → open Plan once chat is ready.
  window.setTimeout(() => onRideIntentCaptured(), 900);
}

/** Intent captured (idea / type) → open Plan once. */
export function onRideIntentCaptured(): void {
  if (!isOnboardingRideActive()) return;
  advancePhaseAtLeast('plan');
  openOnce('plan', 'master-plan');
}

/** Project named → open UI Studio once (generate stays user/pipeline driven). */
export function onRideProjectNamed(): void {
  if (!isOnboardingRideActive()) return;
  if (!namedProject()) return;
  advancePhaseAtLeast('ui');
  openOnce('ui', 'ui-studio-beta');
}

/** First UI cycle finished → end ride, soft Code phase. */
export function onRideFirstUiComplete(): void {
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
  const onUiDone = () => onRideFirstUiComplete();
  const onNamedForRide = () => onRideProjectNamed();
  const onWorkspaceSync = () => {
    if (namedProject() && isOnboardingRideActive()) {
      advancePhaseAtLeast('plan');
    }
  };

  window.addEventListener('nebula-start-guided-chat', onGuided);
  window.addEventListener('nebula-ui-studio-beta-complete', onUiDone);
  window.addEventListener('nebula-project-named-for-ride', onNamedForRide);
  window.addEventListener('nebula-workspace-context-synced', onWorkspaceSync);

  return () => {
    window.removeEventListener('nebula-start-guided-chat', onGuided);
    window.removeEventListener('nebula-ui-studio-beta-complete', onUiDone);
    window.removeEventListener('nebula-project-named-for-ride', onNamedForRide);
    window.removeEventListener('nebula-workspace-context-synced', onWorkspaceSync);
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
