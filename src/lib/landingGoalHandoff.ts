/**
 * Landing → (login if needed) → Build goal handoff.
 * Uses existing project/session localStorage contracts that AIChat already consumes.
 */

import { FORCE_GUEST_MODE } from './testingBranch';
import {
  createProjectForCurrentSession,
  fetchSessionUser,
  renameActiveProjectDisplayName,
  selectCloudProjectByName,
} from './nebulaCloud';
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
import { resetProjectFromScratch } from './ideProjectReset';
import { shortNameFromIdea } from './projectNameFromIdea';
import { getBrowserProjectName, setBrowserProjectName } from './nebulaProjectApi';

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

/** Same create/reuse path as Dashboard `onStartFromIdea` (`MyProjectsHome`). */
async function ensureProjectOrReuse(label: string): Promise<void> {
  const wanted = label.trim() || 'New Project';
  try {
    await createProjectForCurrentSession(wanted);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/1 project|upgrade|Pricing/i.test(msg)) throw err;
    const existing = getBrowserProjectName().trim();
    if (existing) {
      try {
        await selectCloudProjectByName(existing);
      } catch {
        /* guest / already bound */
      }
    }
    try {
      const user = await fetchSessionUser();
      await renameActiveProjectDisplayName(wanted, user?.uid ? 'cloud' : 'guest');
    } catch {
      setBrowserProjectName(wanted);
    }
  }
}

/**
 * T1 — Landing Build: reset/create project, name from goal, then Build (login gate when needed).
 */
export async function continueFromLandingGoal(
  goal: string,
  startType?: IdeStartProjectType,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = goal.trim();
  const type = startType === undefined ? readStoredStartType() : startType;
  if (trimmed) {
    if (!commitLandingGoalHandoff(trimmed, type)) {
      return { ok: false, error: 'Add a short goal to continue.' };
    }
    const label = shortNameFromIdea(trimmed);
    await resetProjectFromScratch(label);
    try {
      await ensureProjectOrReuse(label);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Could not start the project.' };
    }
    try {
      const user = FORCE_GUEST_MODE ? null : await fetchSessionUser();
      await renameActiveProjectDisplayName(label, user?.uid ? 'cloud' : 'guest');
    } catch {
      setBrowserProjectName(label);
    }
    // Reset clears pending type + legacy prompt; restore like Dashboard after create.
    if (type === 'Web App' || type === 'Mobile App' || type === 'Landing Page') {
      setPendingProjectType(type);
    }
    setPendingProjectIdea(trimmed);
    setPendingStartMode('fast_prototype');
    markGuidedStartOnReady();
    try {
      localStorage.setItem(LEGACY_INITIAL_PROMPT_KEY, trimmed);
    } catch {
      /* ignore */
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
