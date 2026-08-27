/**
 * Fast Prototype next-slice helpers (Mode B).
 * One prompt → research → mockup → Foundation → Primary → Secondary → Polish.
 * Do not ask the user to type Continue between slices.
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

function sliceProgressRank(slice?: string | null): number {
  const t = String(slice || '').trim();
  if (/\bpolish\b/i.test(t)) return 5;
  if (/\bsecondary\b/i.test(t)) return 4;
  if (/\bprimary\b/i.test(t)) return 3;
  if (/\bdata\+?api\b/i.test(t)) return 2;
  if (/\bauth\b/i.test(t)) return 1;
  if (/\bfoundation\b/i.test(t)) return 0;
  return -1;
}

/** Keep the later of two slice labels (Secondary beats a stale Foundation persist). */
export function preferLaterSlice(a?: string | null, b?: string | null): string | null {
  const left = String(a || '').trim() || null;
  const right = String(b || '').trim() || null;
  if (sliceProgressRank(left) >= sliceProgressRank(right)) return left || right;
  return right || left;
}

/** SLICE: line from Master Plan pre-coding summary (or any tagged note). */
export function parsePersistedSliceLabel(text?: string | null): AutopilotSliceLabel | null {
  const tagged = String(text || '').match(
    /\bSLICE\s*:\s*(Foundation|Auth|Data\+API|Primary|Secondary|Polish)\b/i,
  );
  if (!tagged?.[1]) return null;
  const key = tagged[1].toLowerCase();
  if (key === 'polish') return 'Polish';
  if (key === 'secondary') return 'Secondary';
  if (key === 'primary') return 'Primary';
  if (key === 'data+api') return 'Data+API';
  if (key === 'auth') return 'Auth';
  return 'Foundation';
}

/**
 * Poisoned "Foundation" persist after kid Home already exists must not
 * send Continue back to Primary forever.
 */
export function healLastAppliedSlice(
  lastSlice?: string | null,
  workspacePaths?: string[],
): string | null {
  const last = String(lastSlice || '').trim() || null;
  if (last && sliceProgressRank(last) >= 3) return last;
  const hasPrimaryHint = (workspacePaths || []).some((raw) => {
    const p = normalizeWorkspacePath(raw);
    return (
      /(^|\/)app\/kid\/home\/page\.(tsx|jsx|js)$/i.test(p) ||
      /(^|\/)src\/app\/kid\/home\/page\.(tsx|jsx|js)$/i.test(p) ||
      /(^|\/)app\/home\/page\.(tsx|jsx|js)$/i.test(p) ||
      /(^|\/)app\/practice\/page\.(tsx|jsx|js)$/i.test(p) ||
      /KidHomeScreen\.(tsx|jsx)$/i.test(p)
    );
  });
  if (hasPrimaryHint) return 'Primary';
  return last;
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
 * Mode B: one prompt → research → mockup → Foundation → auto Primary → Secondary → Polish.
 * User Continue is not required between slices.
 * Keep true this turn. Flip to false only after a golden Foundation is proven on prod.
 */
export const FAST_PROTOTYPE_SAME_SESSION_AUTOPILOT = true;

/** Nested app/pages routes (or product screens) required before Foundation is “on disk”. */
export const FOUNDATION_PRODUCT_ROUTE_MIN = 3;

/** Continue with empty explorer — retry Foundation, not Primary. */
export const FOUNDATION_RETRY_ACTIVITY =
  'Foundation did not land. Retry Go for Foundation — not Continue for Primary.';

export const FOUNDATION_SLICE_INSTRUCTION =
  'START_CODING — implement ONE coherent Foundation slice only (Build → Debug → Next). Prefer app/, src/, components/, pages/ — not master-plan/ui-brief only. File blocks for this slice only — not the full §4 app.';

/** After a 3-minute timeout — smaller shell so Grok Code can finish. */
export const NARROW_FOUNDATION_SLICE_INSTRUCTION =
  'START_CODING — SLICE: Foundation — smallest runnable shell only (4–8 files): package.json, app/layout.tsx, app/globals.css, app/page.tsx, one nested app/<route>/page.tsx from the Master Plan. No extra dashboards. File blocks now.';

export function buildNarrowSliceInstruction(slice?: string | null): string {
  const label = String(slice || 'Foundation').trim() || 'Foundation';
  if (looksLikeFoundationSlice(label) || looksLikePrePrimaryShellSlice(label)) {
    return NARROW_FOUNDATION_SLICE_INSTRUCTION;
  }
  return (
    `START_CODING — SLICE: ${label} — 3–6 files only (Build → Debug → Next). ` +
    `Do NOT rewrite Foundation. Prefer app/, src/, components/, pages/. File blocks now.`
  );
}

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
  /** Product app/ or pages/ routes from this apply — < 3 means this turn did not land a shell. */
  productRouteCount?: number;
  /** Workspace already has ≥ FOUNDATION_PRODUCT_ROUTE_MIN product routes. Last-slice label is not proof. */
  productRoutesOnDisk?: boolean;
  /** Apply actually wrote files this turn. */
  wroteFiles?: boolean;
  /** When Gate R failed, do not tell the user to Send Go. */
  blockedCode?: string;
}): AutopilotAdvanceDecision {
  const maxAuto = opts.maxAuto ?? MAX_AUTOPILOT_SLICES;
  const thisTurnCount = typeof opts.productRouteCount === 'number' ? opts.productRouteCount : 0;
  const thisTurnOk = thisTurnCount >= FOUNDATION_PRODUCT_ROUTE_MIN;
  const foundationOnDisk = opts.productRoutesOnDisk === true;
  const realFoundation = thisTurnOk || foundationOnDisk;
  const wroteFiles = opts.wroteFiles !== false;
  const foundationMissing = !realFoundation;
  if (!opts.codingOk || !wroteFiles || !realFoundation) {
    if (opts.blockedCode === 'RESEARCH_INCOMPLETE') {
      return {
        advance: false,
        nextLabel: null,
        stopReason: 'failed',
        message: `${RESEARCH_STOPPED} Retry research — not Go — until Gate R is complete.`,
      };
    }
    if (opts.blockedCode === 'GO_TIMEOUT') {
      return {
        advance: false,
        nextLabel: null,
        stopReason: 'failed',
        message: policyATimeoutMessage(opts.lastSlice, foundationOnDisk),
      };
    }
    return {
      advance: false,
      nextLabel: null,
      stopReason: 'failed',
      message: policyAFailedMessage(foundationMissing ? 'Foundation' : opts.lastSlice),
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
  if (looksLikePolishSlice(opts.lastSlice)) {
    return {
      advance: false,
      nextLabel: null,
      stopReason: 'done',
      message: 'Slices complete — running Final UI restyle. No Continue needed.',
    };
  }
  if (opts.autoCount >= maxAuto) {
    return {
      advance: false,
      nextLabel: null,
      stopReason: 'cap',
      message: `Autopilot reached ${maxAuto} follow-up slices — running Final UI restyle. No Continue needed.`,
    };
  }
  const lastSlice = opts.lastSlice;
  const nextLabel = nextAutopilotSliceLabel(lastSlice);
  return {
    advance: true,
    nextLabel,
    stopReason: 'next',
    message: opts.codingOk
      ? `Starting ${nextLabel} slice automatically…`
      : `Slice had issues — bypassing and starting ${nextLabel} anyway…`,
  };
}

/** After coding autopilot stops, always restyle — do not wait for a user message. */
export function autopilotStopRunsFinalUi(
  reason: AutopilotAdvanceDecision['stopReason'],
): boolean {
  return reason === 'done' || reason === 'cap';
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

/** Timed-out next slice must not tell the user Foundation never landed. */
export function policyATimeoutMessage(lastSlice?: string | null, foundationOnDisk?: boolean): string {
  if (FAST_PROTOTYPE_SAME_SESSION_AUTOPILOT) {
    if (!foundationOnDisk) {
      return 'Grok Code timed out [GO_TIMEOUT]. Foundation files did not land. You do not need to type Continue.';
    }
    const label =
      !lastSlice || looksLikePrePrimaryShellSlice(lastSlice)
        ? 'Primary'
        : String(lastSlice).trim();
    return `Grok Code timed out [GO_TIMEOUT]. ${label} did not land. You do not need to type Continue.`;
  }
  if (!foundationOnDisk) {
    return `Grok Code timed out [GO_TIMEOUT]. ${FOUNDATION_RETRY_ACTIVITY}`;
  }
  const label =
    !lastSlice || looksLikePrePrimaryShellSlice(lastSlice)
      ? 'Primary'
      : String(lastSlice).trim();
  return `Grok Code timed out [GO_TIMEOUT]. ${label} did not land. Send Go to retry ${label} — Foundation is already on disk.`;
}

/**
 * Continue after Foundation/Primary/… — never Foundation again when product routes exist.
 * Returns null when Polish already landed (nothing left to Continue).
 */
export function resolveNextContinueSlice(opts: {
  lastSlice?: string | null;
  projectKey?: string;
  productRoutesOnDisk?: boolean;
  workspacePaths?: string[];
  planSlice?: string | null;
}): AutopilotSliceLabel | null {
  if (!opts.productRoutesOnDisk) return 'Foundation';
  const combined = preferLaterSlice(
    opts.lastSlice,
    preferLaterSlice(readLastAppliedSlice(opts.projectKey || ''), opts.planSlice),
  );
  const last = healLastAppliedSlice(combined, opts.workspacePaths) || 'Foundation';
  if (looksLikePolishSlice(last)) return null;
  return nextAutopilotSliceLabel(last);
}

function normalizeWorkspacePath(raw: string): string {
  return String(raw || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function isNestedProductRouteFile(p: string): boolean {
  if (!/\.(tsx|jsx|js)$/i.test(p)) return false;
  if (!/(^|\/)((src\/)?app|(src\/)?pages)\//.test(p)) return false;
  if (/(^|\/)(layout|template|loading|error|not-found|globals)\./i.test(p)) return false;
  if (/(^|\/)app\/page\.(tsx|jsx|js)$/i.test(p)) return false;
  if (/(^|\/)src\/app\/page\.(tsx|jsx|js)$/i.test(p)) return false;
  if (/(^|\/)pages\/index\.(tsx|jsx|js)$/i.test(p)) return false;
  return true;
}

function isProductScreenFile(p: string): boolean {
  return (
    /(^|\/)[A-Za-z][A-Za-z0-9]+Screen\.(tsx|jsx)$/i.test(p) &&
    !/ErrorBoundary/i.test(p) &&
    !/(^|\/)(Login|Register|SignIn|SignUp|Auth)Screen\.(tsx|jsx)$/i.test(p)
  );
}

/**
 * Unique product routes — same rules as assessApplyRouteDepth / inferRoutesFromProductFiles.
 * `app/page.tsx` counts as `/` so Continue matches “Product routes: /, /parent/…, /teacher/…”.
 */
export function countWorkspaceProductRoutes(paths: string[]): number {
  const routes = new Set<string>();
  for (const raw of paths || []) {
    const p = normalizeWorkspacePath(raw);
    if (/^(?:src\/)?app\/page\.(tsx|jsx|js)$/i.test(p)) {
      routes.add('/');
      continue;
    }
    const appPage = p.match(/^(?:src\/)?app\/(.+)\/page\.(tsx|jsx|js)$/i);
    if (appPage) {
      routes.add(`/${appPage[1].replace(/\/index$/i, '')}`);
      continue;
    }
    const pages = p.match(/^(?:src\/)?pages\/(.+)\.(tsx|jsx|js)$/i);
    if (pages) {
      const slug = pages[1].replace(/\/index$/i, '').replace(/^index$/i, '');
      routes.add(`/${slug.replace(/\[(.+?)\]/g, ':$1')}`);
      continue;
    }
    if (isProductScreenFile(p)) {
      const screen = p.match(/(^|\/)([A-Za-z][A-Za-z0-9]+)Screen\.(tsx|jsx)$/);
      if (screen) {
        const slug = screen[2].replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
        if (slug) routes.add(`/${slug}`);
      }
    }
  }
  return routes.size;
}

/**
 * Client-safe: at least one nested app/pages route (not Vite App.tsx / layout-only / root page).
 */
export function workspaceHasProductAppRoutes(paths: string[]): boolean {
  const list = (paths || []).map(normalizeWorkspacePath);
  return list.some(isNestedProductRouteFile) || list.filter(isProductScreenFile).length >= 1;
}

/** Mode A: Foundation has landed — same threshold as apply, or we already persisted a slice. */
export function workspaceFoundationLanded(
  paths: string[],
  _opts?: { lastSlice?: string | null; projectKey?: string },
): boolean {
  // Last-slice persist is not disk proof — Primary/Secondary labels must not fake Foundation.
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
