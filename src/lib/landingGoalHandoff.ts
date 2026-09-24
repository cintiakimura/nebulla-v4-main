/**
 * Landing → (login if needed) → Build goal handoff.
 * Uses existing project/session localStorage contracts that AIChat already consumes.
 */

import { FORCE_GUEST_MODE } from './testingBranch';
import {
  fetchSessionUser,
  mintEmptyProjectFromHome,
  renameActiveProjectDisplayName,
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
  NEBULA_START_GUIDED_ON_READY_KEY,
  peekPendingProjectIdea,
  setPendingProjectIdea,
  setPendingProjectType,
} from './ideHomeEvents';
import { peekPendingStartMode, setPendingStartMode } from './ideStartMode';
import { markGuidedEnterBuild } from './guidedFunnel';
import { resetProjectFromScratch } from './ideProjectReset';
import { inferProductName } from './projectNameFromIdea';
import { persistProductIdentityClient } from './productIdentityClient';
import { isUsableProjectGoal } from './spineSequenceGates';
import { getBrowserProjectKey, getBrowserProjectName, setBrowserProjectName } from './nebulaProjectApi';

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
  const trimmed = goal.trim().slice(0, 4000);
  // Phase 1: junk/empty goals must not start the Fast Prototype pipeline.
  if (!isUsableProjectGoal(trimmed)) return false;
  if (!persistLandingGoalForBuild(trimmed, type ?? null)) return false;

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
 * Re-queue Fast Prototype only when landing / My Projects armed a start
 * (`nebula_start_guided_on_ready`). A leftover shell goal must not restart
 * the pipeline on every Build visit / refresh.
 */
export function ensurePendingIdeaFromShellGoal(): void {
  let armed = false;
  try {
    armed = localStorage.getItem(NEBULA_START_GUIDED_ON_READY_KEY) === '1';
  } catch {
    armed = false;
  }
  if (!armed) return;
  const goal = readStoredShellGoal();
  if (!goal) return;
  if (!peekPendingProjectIdea()) {
    setPendingProjectIdea(goal);
  }
  if (!peekPendingStartMode()) {
    setPendingStartMode('fast_prototype');
  }
}

/** Same mint path as Dashboard `onStartFromIdea` — new key, leftover disk untouched. */
async function ensureProjectOrReuse(label: string): Promise<void> {
  await mintEmptyProjectFromHome(label.trim() || 'New Project');
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
    if (!isUsableProjectGoal(trimmed)) {
      return { ok: false, error: 'Write a short goal (who the app is for and what it helps them do).' };
    }
    if (!commitLandingGoalHandoff(trimmed, type)) {
      return { ok: false, error: 'Add a short goal to continue.' };
    }
    const label = inferProductName(trimmed, type);
    const beforeKey = getBrowserProjectKey();
    try {
      await ensureProjectOrReuse(label);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Could not start the project.' };
    }
    if (!getBrowserProjectKey() || getBrowserProjectKey() === beforeKey) {
      return { ok: false, error: 'Could not open an empty workspace. Leftover project files were left untouched.' };
    }
    await resetProjectFromScratch(label, { goal: trimmed, projectType: type });
    try {
      await renameActiveProjectDisplayName(label, 'guest');
    } catch {
      setBrowserProjectName(label);
    }
    void persistProductIdentityClient({
      projectName: label,
      goal: trimmed,
      projectType: type,
    });
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
