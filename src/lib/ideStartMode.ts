/**
 * Project start path: Guided (full architecture interview) vs Fast Prototype.
 * Orthogonal to Chat vs Agent. Additive — Guided remains the default.
 */

import { getBrowserProjectKey } from './nebulaProjectApi';

export type IdeStartMode = 'guided' | 'fast_prototype';

/** One-shot across My Projects → reload → AIChat bootstrap. */
export const NEBULA_PENDING_START_MODE_KEY = 'nebula_pending_start_mode_v1';

const STORED_PREFIX = 'nebula_start_mode_v1:';

export function isIdeStartMode(v: unknown): v is IdeStartMode {
  return v === 'guided' || v === 'fast_prototype';
}

export function normalizeStartMode(v: unknown): IdeStartMode {
  return v === 'fast_prototype' ? 'fast_prototype' : 'guided';
}

export function setPendingStartMode(mode: IdeStartMode): void {
  try {
    localStorage.setItem(NEBULA_PENDING_START_MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

export function peekPendingStartMode(): IdeStartMode | null {
  try {
    const v = localStorage.getItem(NEBULA_PENDING_START_MODE_KEY);
    return isIdeStartMode(v) ? v : null;
  } catch {
    return null;
  }
}

/** Read and clear pending start mode (once per bootstrap). */
export function consumePendingStartMode(): IdeStartMode {
  const v = peekPendingStartMode() ?? 'guided';
  try {
    localStorage.removeItem(NEBULA_PENDING_START_MODE_KEY);
  } catch {
    /* ignore */
  }
  return normalizeStartMode(v);
}

function storedKey(projectKey?: string): string {
  const key = (projectKey || getBrowserProjectKey() || 'default').trim() || 'default';
  return `${STORED_PREFIX}${key}`;
}

/** Durable per-project start mode (survives Chat↔Agent toggles). */
export function setStoredStartMode(mode: IdeStartMode, projectKey?: string): void {
  try {
    localStorage.setItem(storedKey(projectKey), mode);
  } catch {
    /* ignore */
  }
}

export function getStoredStartMode(projectKey?: string): IdeStartMode {
  try {
    return normalizeStartMode(localStorage.getItem(storedKey(projectKey)));
  } catch {
    return 'guided';
  }
}

export function clearStoredStartMode(projectKey?: string): void {
  try {
    localStorage.removeItem(storedKey(projectKey));
  } catch {
    /* ignore */
  }
}

export function isFastPrototypeMode(projectKey?: string): boolean {
  return getStoredStartMode(projectKey) === 'fast_prototype';
}

/**
 * Free-chat / paste detection for Fast Prototype.
 * Must NOT steal coding fixes, debug, file-open, or App Status turns.
 */
export function detectFastPrototypeIntent(
  text: string,
  options?: {
    masterPlanComplete?: boolean;
    hasAppStatusPayload?: boolean;
  },
): boolean {
  const t = text.trim();
  if (!t || t.length < 12) return false;
  if (options?.hasAppStatusPayload) return false;
  if (options?.masterPlanComplete) return false;

  // Never steal debug / fix / file ops
  if (
    /\[APP_STATUS_DEBUG\]/i.test(t) ||
    /\b(fix|debug|error|stack\s*trace|console|broken|crash|bug)\b/i.test(t) ||
    /\b(open|read)\s+(file|https?:\/\/|github\.com)/i.test(t) ||
    /^ide_open_file:/im.test(t)
  ) {
    return false;
  }

  if (/\bfast\s*prototype\b/i.test(t)) return true;
  if (/^fast\s*prototype\s*:/i.test(t)) return true;

  // Complete brief paste: "Build a … app …" when plan is empty — not a tiny coding ask.
  const looksLikeGreenfieldBrief =
    /^(build|create|make|design|scaffold)\b/i.test(t) &&
    /\b(app|application|platform|marketplace|dashboard|site|landing|prototype)\b/i.test(t) &&
    t.length >= 36 &&
    t.length <= 2000 &&
    !/\b(this file|this component|this bug|the code|refactor)\b/i.test(t);

  return looksLikeGreenfieldBrief;
}
