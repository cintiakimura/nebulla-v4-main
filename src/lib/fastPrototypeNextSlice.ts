/**
 * Fast Prototype next-slice helpers (Mode A).
 * One prompt → research → mockup → Foundation → stop.
 * User Continue advances only after Foundation product routes are on disk.
 */

import { RESEARCH_STOPPED } from '../../lib/researchStages';

export type AutopilotSliceLabel =
  | 'Foundation'
  | 'Auth'
  | 'Data+API'
  | 'Primary'
  | 'Secondary'
  | 'Polish';

const primaryAutoDoneKeys = new Set<string>();
const autoSliceCountByProject = new Map<string, number>();
const lastSliceByProject = new Map<string, string>();

function lastSliceStorageKey(projectKey: string): string {
  return `nebula:fast-proto-last-slice:${projectKey || 'default'}`;
}

export function persistLastAppliedSlice(projectKey: string, slice?: string | null): void {
  const key = projectKey || 'default';
  const label = String(slice || '').trim();
  if (!label) return;
  lastSliceByProject.set(key, label);
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(lastSliceStorageKey(key), label);
    }
  } catch {
    /* ignore */
  }
}

export function readLastAppliedSlice(projectKey: string): string | null {
  const key = projectKey || 'default';
  const mem = lastSliceByProject.get(key);
  if (mem) return mem;
  try {
    if (typeof sessionStorage !== 'undefined') {
      const v = sessionStorage.getItem(lastSliceStorageKey(key));
      if (v?.trim()) {
        lastSliceByProject.set(key, v.trim());
        return v.trim();
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function hasFastPrototypePrimaryAutoRun(projectKey: string): boolean {
  return primaryAutoDoneKeys.has(projectKey || 'default');
}

export function markFastPrototypePrimaryAutoRun(projectKey: string): void {
  primaryAutoDoneKeys.add(projectKey || 'default');
}

export function getAutopilotSliceCount(projectKey: string): number {
  return autoSliceCountByProject.get(projectKey || 'default') || 0;
}

export function incrementAutopilotSliceCount(projectKey: string): number {
  const key = projectKey || 'default';
  const next = getAutopilotSliceCount(key) + 1;
  autoSliceCountByProject.set(key, next);
  return next;
}

export function resetAutopilotSliceCount(projectKey: string): void {
  autoSliceCountByProject.delete(projectKey || 'default');
  primaryAutoDoneKeys.delete(projectKey || 'default');
}

/** Test helper */
export function resetFastPrototypePrimaryAutoRunForTests(): void {
  primaryAutoDoneKeys.clear();
  autoSliceCountByProject.clear();
  lastSliceByProject.clear();
}

export function looksLikeFoundationSlice(sliceLabel?: string | null): boolean {
  const label = String(sliceLabel || 'Foundation').trim();
  if (!label) return true;
  return /^foundation$/i.test(label) || /\bfoundation\b/i.test(label);
}

/**
 * First Go often labels Foundation+Auth as "Auth". Still auto Primary once —
 * do not stop Fast Prototype after shell/auth-only slices.
 */
export function looksLikePrePrimaryShellSlice(sliceLabel?: string | null): boolean {
  const label = String(sliceLabel || '').trim();
  if (!label) return true;
  if (/\bprimary\b/i.test(label)) return false;
  if (/\bsecondary\b/i.test(label)) return false;
  if (/\bpolish\b/i.test(label)) return false;
  return (
    looksLikeFoundationSlice(label) ||
    /\bauth\b/i.test(label) ||
    /\bdata\+?api\b/i.test(label) ||
    /\bshell\b/i.test(label)
  );
}

export function looksLikePolishSlice(sliceLabel?: string | null): boolean {
  return /\bpolish\b/i.test(String(sliceLabel || '').trim());
}

/** After Foundation/Auth/Data, jump to Primary pages (mock auth is not a hard gate). */
export function nextAutopilotSliceLabel(current?: string | null): AutopilotSliceLabel {
  const label = String(current || 'Foundation').trim();
  if (/\bpolish\b/i.test(label)) return 'Polish';
  if (/\bsecondary\b/i.test(label)) return 'Polish';
  if (/\bprimary\b/i.test(label)) return 'Secondary';
  return 'Primary';
}

/** Auto Go passes after the kickoff Foundation turn (Primary, Secondary, Polish). */
export const MAX_AUTOPILOT_SLICES = 3;

/**
 * Mode A: one prompt → research → mockup → Foundation → stop.
 * Do not auto-start Primary. User Continue is the only next-slice trigger.
 */
export const FAST_PROTOTYPE_SAME_SESSION_AUTOPILOT = false;

/** Nested app/pages routes (or product screens) required before Foundation is “on disk”. */
export const FOUNDATION_PRODUCT_ROUTE_MIN = 3;

/** Continue with empty explorer — retry Foundation, not Primary. */
export const FOUNDATION_RETRY_ACTIVITY =
  'Foundation did not land. Retry Go for Foundation — not Continue for Primary.';

export const FOUNDATION_SLICE_INSTRUCTION =
  'START_CODING — implement ONE coherent Foundation slice only (Build → Debug → Next). Prefer app/, src/, components/, pages/ — not master-plan/ui-brief only. File blocks for this slice only — not the full §4 app.';

export type AutopilotAdvanceDecision = {
  advance: boolean;
  nextLabel: AutopilotSliceLabel | null;
  stopReason: 'next' | 'done' | 'failed' | 'cap' | 'not_kickoff' | 'session_complete';
  message: string;
};

/**
 * Whether autopilot should kick another Go without a user message.
 */
export function shouldAutopilotAdvance(opts: {
  codingOk: boolean;
  lastSlice?: string | null;
  autoCount: number;
  /** Kickoff turn (Fast Prototype / mockup→Foundation). */
  autopilotKickoff: boolean;
  maxAuto?: number;
  /** Product app/ or pages/ routes from this apply — < 3 means Foundation is not done. */
  productRouteCount?: number;
  /** When Gate R failed, do not tell the user to Send Go. */
  blockedCode?: string;
}): AutopilotAdvanceDecision {
  const maxAuto = opts.maxAuto ?? MAX_AUTOPILOT_SLICES;
  const thinProduct =
    typeof opts.productRouteCount === 'number' && opts.productRouteCount < FOUNDATION_PRODUCT_ROUTE_MIN;
  if (!opts.codingOk || thinProduct) {
    if (opts.blockedCode === 'RESEARCH_INCOMPLETE') {
      return {
        advance: false,
        nextLabel: null,
        stopReason: 'failed',
        message: `${RESEARCH_STOPPED} Retry research — not Go — until Gate R is complete.`,
      };
    }
    return {
      advance: false,
      nextLabel: null,
      stopReason: 'failed',
      message: policyAFailedMessage(thinProduct ? 'Foundation' : opts.lastSlice),
    };
  }
  if (!FAST_PROTOTYPE_SAME_SESSION_AUTOPILOT) {
    return {
      advance: false,
      nextLabel: null,
      stopReason: 'session_complete',
      message: policyAStopMessage(opts.lastSlice),
    };
  }
  if (!opts.autopilotKickoff) {
    return {
      advance: false,
      nextLabel: null,
      stopReason: 'not_kickoff',
      message: 'Autopilot only follows the initial Plan → mockup → Foundation run.',
    };
  }
  if (opts.autoCount >= maxAuto) {
    return {
      advance: false,
      nextLabel: null,
      stopReason: 'cap',
      message: `Autopilot reached ${maxAuto} follow-up slices. Review Preview or send a new goal.`,
    };
  }
  if (looksLikePolishSlice(opts.lastSlice)) {
    return {
      advance: false,
      nextLabel: null,
      stopReason: 'done',
      message: 'MVP ready — review App Preview. Send a new goal or ask for changes.',
    };
  }
  const lastSlice = opts.lastSlice;
  const nextLabel = nextAutopilotSliceLabel(lastSlice);
  if (nextLabel === 'Polish' && looksLikePolishSlice(lastSlice)) {
    return {
      advance: false,
      nextLabel: null,
      stopReason: 'done',
      message: 'MVP ready — review App Preview. Send a new goal or ask for changes.',
    };
  }
  return {
    advance: true,
    nextLabel,
    stopReason: 'next',
    message: opts.codingOk
      ? `Starting ${nextLabel} slice automatically…`
      : `Slice had issues — bypassing and starting ${nextLabel} anyway…`,
  };
}

/**
 * True when Fast Prototype should kick Step 9.2 (primary feature) once after shell/auth.
 * Kept for existing tests; autopilot chain uses shouldAutopilotAdvance.
 */
export function shouldAutoRunPrimarySliceAfterFoundation(opts: {
  fastPrototypeTurn: boolean;
  codingOk: boolean;
  projectKey: string;
  sliceLabel?: string | null;
  force?: boolean;
}): boolean {
  if (!FAST_PROTOTYPE_SAME_SESSION_AUTOPILOT) return false;
  if (!opts.fastPrototypeTurn || !opts.codingOk) return false;
  if (!opts.force && hasFastPrototypePrimaryAutoRun(opts.projectKey)) return false;
  return looksLikePrePrimaryShellSlice(opts.sliceLabel);
}

const DO_NOT_REWRITE_FOUNDATION =
  'If Foundation/product routes already exist, do NOT rewrite them — do not re-emit package.json, layout, login, or existing pages unless this slice must change them.';

export const FAST_PROTOTYPE_PRIMARY_SLICE_INSTRUCTION =
  'START_CODING — SLICE: Primary — implement the NEXT incomplete primary feature slice only (Build → Debug → Next). ' +
  `${DO_NOT_REWRITE_FOUNDATION} ` +
  'Core user job from Master Plan: kid Home with one next-lesson CTA + a working practice/session (steps or timer, then complete) — not a Who-are-you role picker as the whole home. Prefer app/, src/, components/, pages/ — not master-plan/ui-brief only. File blocks for this slice only — not the full §4 app.';

export function buildAutopilotSliceInstruction(slice: AutopilotSliceLabel): string {
  if (slice === 'Foundation') return FOUNDATION_SLICE_INSTRUCTION;
  if (slice === 'Primary') return FAST_PROTOTYPE_PRIMARY_SLICE_INSTRUCTION;
  return (
    `START_CODING — SLICE: ${slice} — implement the NEXT incomplete ${slice} slice only (Build → Debug → Next). ` +
    `${DO_NOT_REWRITE_FOUNDATION} Prefer Master Plan pages/features not yet complete ` +
    `(teacher dashboard, parent progress, child hub, rewards). Prefer app/, src/, components/, pages/. ` +
    `File blocks for this slice only — not the full §4 app.`
  );
}

/** Policy A copy after a slice lands — Continue must name the next slice, not always Foundation. */
export function policyAStopMessage(lastSlice?: string | null): string {
  const label = String(lastSlice || 'Foundation').trim() || 'Foundation';
  if (looksLikePolishSlice(label)) {
    return 'Polish applied. Review Preview — or send a new goal.';
  }
  if (/\bsecondary\b/i.test(label)) {
    return 'Secondary applied — send Continue for Polish.';
  }
  if (/\bprimary\b/i.test(label)) {
    return 'Primary applied — send Continue for Secondary.';
  }
  return 'Foundation applied — send Continue for the next slice.';
}

export function policyAFailedMessage(lastSlice?: string | null): string {
  if (!lastSlice || looksLikePrePrimaryShellSlice(lastSlice)) {
    return FOUNDATION_RETRY_ACTIVITY;
  }
  return `${String(lastSlice).trim()} did not land. Retry Go for this slice — not Continue for the next.`;
}

/**
 * Continue after Foundation/Primary/… — never Foundation again when product routes exist.
 * Returns null when Polish already landed (nothing left to Continue).
 */
export function resolveNextContinueSlice(opts: {
  lastSlice?: string | null;
  projectKey?: string;
  productRoutesOnDisk?: boolean;
}): AutopilotSliceLabel | null {
  if (!opts.productRoutesOnDisk) return 'Foundation';
  const last =
    String(opts.lastSlice || '').trim() ||
    readLastAppliedSlice(opts.projectKey || '') ||
    'Foundation';
  if (looksLikePolishSlice(last)) return null;
  return nextAutopilotSliceLabel(last);
}

function normalizeWorkspacePath(raw: string): string {
  return String(raw || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function isNestedProductRouteFile(p: string): boolean {
  if (!/\.(tsx|jsx)$/i.test(p)) return false;
  if (!/(^|\/)((src\/)?app|(src\/)?pages)\//.test(p)) return false;
  if (/(^|\/)(layout|template|loading|error|not-found|globals)\./i.test(p)) return false;
  if (/(^|\/)app\/page\.(tsx|jsx)$/i.test(p)) return false;
  if (/(^|\/)src\/app\/page\.(tsx|jsx)$/i.test(p)) return false;
  if (/(^|\/)pages\/index\.(tsx|jsx)$/i.test(p)) return false;
  return true;
}

function isProductScreenFile(p: string): boolean {
  return (
    /(^|\/)[A-Za-z][A-Za-z0-9]+Screen\.(tsx|jsx)$/i.test(p) &&
    !/ErrorBoundary/i.test(p) &&
    !/(^|\/)(Login|Register|SignIn|SignUp|Auth)Screen\.(tsx|jsx)$/i.test(p)
  );
}

/** Nested app/pages routes or product screens (layout / root page do not count). */
export function countWorkspaceProductRoutes(paths: string[]): number {
  const list = (paths || []).map(normalizeWorkspacePath);
  const nested = list.filter(isNestedProductRouteFile);
  if (nested.length) return nested.length;
  return list.filter(isProductScreenFile).length;
}

/**
 * Client-safe: Foundation product routes on disk (not Vite App.tsx / layout-only).
 * Continue/finish must not jump to Primary while this is false.
 */
export function workspaceHasProductAppRoutes(paths: string[]): boolean {
  return countWorkspaceProductRoutes(paths) >= 1;
}

/** Mode A: Foundation has landed only when enough product routes exist. */
export function workspaceFoundationLanded(paths: string[]): boolean {
  return countWorkspaceProductRoutes(paths) >= FOUNDATION_PRODUCT_ROUTE_MIN;
}

/**
 * User/product asked for the next slice (not first Foundation).
 * Bare "go" / "start coding" stay Foundation on a greenfield turn.
 */
export function userNoteRequestsNextSlice(note?: string | null): boolean {
  const t = String(note || '').trim();
  if (!t) return false;
  if (/SLICE:\s*Primary/i.test(t)) return true;
  if (/SLICE:\s*(Secondary|Polish|Auth|Data\+API)/i.test(t)) return true;
  if (/\bdo NOT rewrite Foundation\b/i.test(t)) return true;
  if (/\bNEXT incomplete (primary )?feature slice\b/i.test(t)) return true;
  if (/\b(continue|keep)\s+(building|implementing)\b/i.test(t)) return true;
  if (/\bnext\s+slice\b/i.test(t)) return true;
  if (/^(continue|continue\.|continue!|build\s+next)$/i.test(t)) return true;
  return false;
}

/** Last activity line after apply — coding turn often froze here. */
export const FOUNDATION_APPLY_STALL_MS = 4000;
/** Apply POST stuck on "Applying N files" — unlock without starting Primary. */
export const APPLY_IN_FLIGHT_STALL_MS = 15_000;

export function looksLikePostApplyCodingStall(lastLogMessage?: string | null): boolean {
  return /Runnable skeleton filled/i.test(String(lastLogMessage || ''));
}

/** Apply POST still in flight — do not start the next Go slice yet. */
export function looksLikeApplyInFlightStall(lastLogMessage?: string | null): boolean {
  const s = String(lastLogMessage || '');
  return /Writing files to cloud workspace/i.test(s) || /Applying \d+ file\(s\) to workspace/i.test(s);
}
