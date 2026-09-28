/**
 * Project start path: Full Build (default) vs Fast Prototype thin draft vs Guided interview.
 * Orthogonal to Chat vs Agent.
 */

import { getBrowserProjectKey } from './nebulaProjectApi';

export type IdeStartMode = 'guided' | 'fast_prototype' | 'full_build';

/** One-shot across My Projects → reload → AIChat bootstrap. */
export const NEBULA_PENDING_START_MODE_KEY = 'nebula_pending_start_mode_v1';

const STORED_PREFIX = 'nebula_start_mode_v1:';

export function isIdeStartMode(v: unknown): v is IdeStartMode {
  return v === 'guided' || v === 'fast_prototype' || v === 'full_build';
}

/** Missing / unknown → Full Build. Guided and explicit Fast Prototype stay. */
export function normalizeStartMode(v: unknown): IdeStartMode {
  if (v === 'guided') return 'guided';
  if (v === 'fast_prototype') return 'fast_prototype';
  return 'full_build';
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

/** Read and clear pending start mode (once per bootstrap). Default = Full Build. */
export function consumePendingStartMode(): IdeStartMode {
  const v = peekPendingStartMode() ?? 'full_build';
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
    const raw = localStorage.getItem(storedKey(projectKey));
    if (raw == null) return 'full_build';
    return normalizeStartMode(raw);
  } catch {
    return 'full_build';
  }
}

export function clearStoredStartMode(projectKey?: string): void {
  try {
    localStorage.removeItem(storedKey(projectKey));
  } catch {
    /* ignore */
  }
}

export function isFullBuildMode(projectKey?: string): boolean {
  return getStoredStartMode(projectKey) === 'full_build';
}

/** True when the explicit thin-draft path is active. */
export function isFastPrototypeMode(projectKey?: string): boolean {
  return getStoredStartMode(projectKey) === 'fast_prototype';
}

export function isInferenceFirstMode(projectKey?: string): boolean {
  const mode = getStoredStartMode(projectKey);
  return mode === 'full_build' || mode === 'fast_prototype';
}

export function detectQuickDraftIntent(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return /\b(fast\s*prototype|quick\s+(draft|prototype)|thin\s+draft|mvp\s+slice|first\s+draft\s+only|quick\s+mvp)\b/i.test(
    t,
  );
}

/**
 * Explicit opt-in to Guided interview (exception path). Brainstorm is shape mode, not Guided.
 */
export function detectGuidedInterviewIntent(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return /\b(interview me|full architecture interview|guided (discovery|interview)|ask me (the )?questions|one question at a time|walk me through (discovery|planning)|i want to (be )?interviewed)\b/i.test(
    t,
  );
}

/**
 * Clear goal / build brief → inference-first (default path).
 * Must NOT steal coding fixes, debug, file-open, or App Status turns.
 */
export function detectInferenceFirstIntent(
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
  if (detectGuidedInterviewIntent(t)) return false;

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
  if (/\b(quick prototype|first (version|draft)|mvp draft|inference[- ]first)\b/i.test(t)) {
    return true;
  }

  // "Build/create … app …"
  if (
    /^(build|create|make|design|scaffold)\b/i.test(t) &&
    /\b(app|application|platform|marketplace|dashboard|site|landing|prototype)\b/i.test(t) &&
    t.length >= 24 &&
    t.length <= 2000 &&
    !/\b(this file|this component|this bug|the code|refactor)\b/i.test(t)
  ) {
    return true;
  }

  // Clear product brief without a leading "Build" (e.g. education app for kids…)
  if (
    t.length >= 28 &&
    t.length <= 2000 &&
    /\b(app|application|platform|marketplace|dashboard|prototype)\b/i.test(t) &&
    /\b(for|kids|students|teachers|users|customers|patients|parents|schools|freelancers)\b/i.test(
      t,
    ) &&
    !/\b(this file|this component|this bug|the code|refactor|what do you think)\b/i.test(t)
  ) {
    return true;
  }

  return false;
}

/** @deprecated Use detectInferenceFirstIntent — kept for existing imports. */
export function detectFastPrototypeIntent(
  text: string,
  options?: {
    masterPlanComplete?: boolean;
    hasAppStatusPayload?: boolean;
  },
): boolean {
  return detectInferenceFirstIntent(text, options);
}
