/**
 * UI mockup gate — first UI Gen v2 after Master Plan + ui-brief, before coding finishes.
 * Single-API-key safe: architecture turn completes → mockup → coding (sequential).
 */

import { isMasterPlanReadyForUiMockup } from './masterPlanSections';
import { getBrowserProjectKey, withProjectQuery } from './nebulaProjectApi';
import { readResponseJson } from './apiFetch';
import { isFastPrototypeMode } from './ideStartMode';
import { isLoadableStudioModel } from '../../lib/uiMockupArtifactHonesty';

export type InferenceFirstStage =
  | 'research'
  | 'plan_drafted'
  | 'ui_mockup'
  | 'coding'
  | 'refine';

const STAGE_PREFIX = 'nebula_if_stage:';
const MOCKUP_DONE_PREFIX = 'nebula_ui_mockup_started:';

function stageKey(projectKey?: string): string {
  const key = (projectKey || getBrowserProjectKey() || 'default').trim() || 'default';
  return `${STAGE_PREFIX}${key}`;
}

function mockupDoneKey(projectKey?: string): string {
  const key = (projectKey || getBrowserProjectKey() || 'default').trim() || 'default';
  return `${MOCKUP_DONE_PREFIX}${key}`;
}

export function setInferenceFirstStage(stage: InferenceFirstStage, projectKey?: string): void {
  try {
    sessionStorage.setItem(stageKey(projectKey), stage);
  } catch {
    /* ignore */
  }
}

export function getInferenceFirstStage(projectKey?: string): InferenceFirstStage | null {
  try {
    const v = sessionStorage.getItem(stageKey(projectKey));
    if (
      v === 'research' ||
      v === 'plan_drafted' ||
      v === 'ui_mockup' ||
      v === 'coding' ||
      v === 'refine'
    ) {
      return v;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Mark mockup stage in progress (does NOT mean App Preview was updated). */
export function markUiMockupStageStarted(projectKey?: string): void {
  setInferenceFirstStage('ui_mockup', projectKey);
}

/** Only after a successful generation that can feed App Preview. */
export function markUiMockupSucceeded(projectKey?: string): void {
  try {
    sessionStorage.setItem(mockupDoneKey(projectKey), '1');
  } catch {
    /* ignore */
  }
  setInferenceFirstStage('ui_mockup', projectKey);
}

export function wasUiMockupStageStarted(projectKey?: string): boolean {
  try {
    return sessionStorage.getItem(mockupDoneKey(projectKey)) === '1';
  } catch {
    return false;
  }
}

/**
 * Skip /generate only when Studio already has a loadable model.
 * Leftover `user_visible_stage` / `final_status` "Ready" is not success (Phase 7.4).
 */
export function statusLooksReadyForSkip(st: {
  has_loadable_model?: boolean;
  user_visible_stage?: string;
  final_status?: string;
}): boolean {
  return st.has_loadable_model === true;
}

/**
 * True when UI Gen produced a **loadable Studio model** and meta is usable.
 * preview_applied / gate alone are NOT enough (false “already on disk” left Studio Waiting).
 */
export async function hasPersistedUiMockup(): Promise<boolean> {
  try {
    const r = await fetch(withProjectQuery('/api/ui-studio-beta/preview'), {
      credentials: 'include',
      cache: 'no-store',
    });
    if (!r.ok) return false;
    const st = (await readResponseJson(r)) as {
      model?: { pages?: Record<string, unknown> } | null;
      preview_applied?: boolean;
      quality_gate_result?: string;
      final_status?: string;
    };
    if (!isLoadableStudioModel(st.model)) return false;
    const gate = String(st.quality_gate_result || '').toLowerCase();
    const gateOk = gate === 'pass' || gate === 'repair';
    const ready = String(st.final_status || '').toLowerCase() === 'ready';
    return st.preview_applied === true || gateOk || ready;
  } catch {
    return false;
  }
}

export function clearUiMockupStageFlags(projectKey?: string): void {
  try {
    sessionStorage.removeItem(mockupDoneKey(projectKey));
    sessionStorage.removeItem(stageKey(projectKey));
  } catch {
    /* ignore */
  }
}

export type FoundationCodingGateReason = 'mockup_ready' | 'explicit_skip' | 'blocked';

/**
 * Phase 7.5: Foundation coding starts after persisted mockup, or when mockup was skipped / failed.
 * Does not start a second UI Gen — only answers whether Go may proceed.
 */
export async function canStartFoundationCoding(options?: {
  /** True when Stage B could not run or returned failure (skip path). */
  mockupSkippedOrFailed?: boolean;
}): Promise<{ ok: boolean; reason: FoundationCodingGateReason }> {
  if (await hasPersistedUiMockup()) {
    return { ok: true, reason: 'mockup_ready' };
  }
  if (options?.mockupSkippedOrFailed) {
    return { ok: true, reason: 'explicit_skip' };
  }
  return { ok: false, reason: 'blocked' };
}

export type UiMockupReadiness = {
  ok: boolean;
  reasons: string[];
  planComplete: boolean;
  uiBriefLength: number;
  inferenceFirst: boolean;
};

const UI_BRIEF_MIN = 80;

export function readinessBlocksAutoFoundation(
  r: Pick<UiMockupReadiness, 'ok' | 'reasons' | 'planComplete' | 'uiBriefLength'>,
): boolean {
  if (r.ok) return false;
  if (!r.planComplete) return true;
  if ((r.uiBriefLength || 0) < UI_BRIEF_MIN) return true;
  return r.reasons.some((x) => /ui-brief|incomplete/i.test(x));
}

/**
 * True when architecture inputs are ready for UI Gen v2 mockup.
 * Does not start generation — call runUiStudioBetaGeneration after this returns ok.
 */
export function canStartUiMockup(input: {
  masterPlan: Record<string, unknown> | null | undefined;
  uiBriefLength: number;
  inferenceFirst?: boolean;
  blocked?: boolean;
}): boolean {
  if (input.blocked) return false;
  if (input.inferenceFirst === false) {
    // Still allow when plan+brief ready on normal build path
  }
  // Structure-ready (§§1–5 + routes). Security-only gaps do not block first mockup.
  if (!isMasterPlanReadyForUiMockup(input.masterPlan)) return false;
  if ((input.uiBriefLength || 0) < UI_BRIEF_MIN) return false;
  return true;
}

export async function assessUiMockupReadiness(options?: {
  projectKey?: string;
  blocked?: boolean;
}): Promise<UiMockupReadiness> {
  const reasons: string[] = [];
  let plan: Record<string, unknown> | null = null;
  try {
    const r = await fetch(withProjectQuery('/api/master-plan/read'), {
      credentials: 'include',
      cache: 'no-store',
    });
    if (r.ok) {
      plan = (await readResponseJson(r)) as Record<string, unknown>;
    }
  } catch {
    plan = null;
  }

  const planComplete = isMasterPlanReadyForUiMockup(plan);
  if (!planComplete) reasons.push('Master Plan draft incomplete (§§1–5 / usable §4 pages)');

  let uiBriefLength = 0;
  try {
    const st = await fetch(withProjectQuery('/api/master-plan/status'), {
      credentials: 'include',
      cache: 'no-store',
    });
    if (st.ok) {
      const body = (await readResponseJson(st)) as { uiBriefLength?: number };
      if (typeof body.uiBriefLength === 'number') uiBriefLength = body.uiBriefLength;
    }
  } catch {
    uiBriefLength = 0;
  }
  if (uiBriefLength < UI_BRIEF_MIN) {
    reasons.push('ui-brief.md missing or too short');
  }

  const inferenceFirst = isFastPrototypeMode(options?.projectKey);
  const ok = canStartUiMockup({
    masterPlan: plan,
    uiBriefLength,
    inferenceFirst,
    blocked: options?.blocked,
  });

  return {
    ok,
    reasons: ok ? [] : reasons,
    planComplete,
    uiBriefLength,
    inferenceFirst,
  };
}
