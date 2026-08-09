/**
 * Landing → (login if needed) → Build goal handoff.
 * Uses existing project/session localStorage contracts that AIChat already consumes.
 */

import { FORCE_GUEST_MODE } from './testingBranch';
import { fetchSessionUser } from './nebulaCloud';
import { goToApp, goToLogin } from './authNavigate';
import {
  persistLandingGoalForBuild,
  readStoredShellGoal,
  readStoredStartType,
  writeStoredShellScreen,
  type IdeStartProjectType,
} from './ideShellScreens';
import {
  markGuidedStartOnReady,
  peekPendingProjectIdea,
  setPendingProjectIdea,
  setPendingProjectType,
} from './ideHomeEvents';
import { peekPendingStartMode, setPendingStartMode } from './ideStartMode';
import { markGuidedEnterBuild } from './guidedFunnel';

/** Durable shell goal key (also written by persistLandingGoalForBuild). Survives refresh. */
export const LANDING_GOAL_DURABLE_KEY = 'nebula_shell_goal_v1';

/** Legacy AssistantSidebar auto-send key (cleared on consume there). */
const LEGACY_INITIAL_PROMPT_KEY = 'nebula_initial_prompt';

/**
 * Persist goal for UI + agent pipeline. Does not navigate.
 * Returns false if goal empty.
 */
export function commitLandingGoalHandoff(
  goal: string,
  startType?: IdeStartProjectType,
): boolean {
  const type = startType === undefined ? readStoredStartType() : startType;
  if (!persistLandingGoalForBuild(goal, type ?? null)) return false;

  const trimmed = goal.trim().slice(0, 4000);
  setPendingProjectIdea(trimmed);
  setPendingStartMode('fast_prototype');
  if (type === 'Web App' || type === 'Mobile App' || type === 'Landing Page') {
    setPendingProjectType(type);
  }
  markGuidedStartOnReady();

  try {
    localStorage.setItem(LEGACY_INITIAL_PROMPT_KEY, trimmed);
  } catch {
    /* ignore */
  }
  return true;
}

/**
 * If durable shell goal exists but pending idea was cleared/lost before agent ran,
 * re-queue the pending idea (does not force a new guided flag every time).
 */
export function ensurePendingIdeaFromShellGoal(): void {
  const goal = readStoredShellGoal();
  if (!goal) return;
  if (!peekPendingProjectIdea()) {
    setPendingProjectIdea(goal);
  }
  if (!peekPendingStartMode()) {
    setPendingStartMode('fast_prototype');
  }
}

/**
 * T1 — Landing Build: handoff goal (if present) → Build (login gate when needed).
 */
export async function continueFromLandingGoal(
  goal: string,
  startType?: IdeStartProjectType,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = goal.trim();
  if (trimmed) {
    if (!commitLandingGoalHandoff(trimmed, startType)) {
      return { ok: false, error: 'Add a short goal to continue.' };
    }
  } else {
    writeStoredShellScreen('build');
  }
  markGuidedEnterBuild();

  if (FORCE_GUEST_MODE) {
    goToApp();
    return { ok: true };
  }

  const user = await fetchSessionUser();
  if (user) {
    goToApp();
    return { ok: true };
  }

  goToLogin('/app');
  return { ok: true };
}
