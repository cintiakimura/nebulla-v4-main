/**
 * Fast Prototype / inference-first autopilot: after Foundation lands, auto-run
 * the next slices (Primary → Secondary → Polish) without a user chat message.
 * Capped — no infinite Go loops.
 */

export type AutopilotSliceLabel =
  | 'Foundation'
  | 'Auth'
  | 'Data+API'
  | 'Primary'
  | 'Secondary'
  | 'Polish';

const primaryAutoDoneKeys = new Set<string>();
const autoSliceCountByProject = new Map<string, number>();

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

export type AutopilotAdvanceDecision = {
  advance: boolean;
  nextLabel: AutopilotSliceLabel | null;
  stopReason: 'next' | 'done' | 'failed' | 'cap' | 'not_kickoff';
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
}): AutopilotAdvanceDecision {
  const maxAuto = opts.maxAuto ?? MAX_AUTOPILOT_SLICES;
  if (!opts.codingOk) {
    return {
      advance: false,
      nextLabel: null,
      stopReason: 'failed',
      message: 'Slice apply failed — autopilot paused. Fix the failing slice, then resume.',
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
      message: 'Autopilot finished (Polish slice). Review Preview — Stop or send a new goal.',
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
  const nextLabel = nextAutopilotSliceLabel(opts.lastSlice);
  if (nextLabel === 'Polish' && looksLikePolishSlice(opts.lastSlice)) {
    return {
      advance: false,
      nextLabel: null,
      stopReason: 'done',
      message: 'Autopilot finished. Review Preview — Stop or send a new goal.',
    };
  }
  return {
    advance: true,
    nextLabel,
    stopReason: 'next',
    message: `Starting ${nextLabel} slice automatically…`,
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
  if (!opts.fastPrototypeTurn || !opts.codingOk) return false;
  if (!opts.force && hasFastPrototypePrimaryAutoRun(opts.projectKey)) return false;
  return looksLikePrePrimaryShellSlice(opts.sliceLabel);
}

export const FAST_PROTOTYPE_PRIMARY_SLICE_INSTRUCTION =
  'START_CODING — SLICE: Primary — implement the NEXT incomplete primary feature slice only (Build → Debug → Next). If Foundation shell already exists, do NOT rewrite it. Prefer the core user job from Master Plan (e.g. reading exercise / kid practice screen). Prefer app/, src/, components/, pages/ — not master-plan/ui-brief only. File blocks for this slice only — not the full §4 app.';

export function buildAutopilotSliceInstruction(slice: AutopilotSliceLabel): string {
  if (slice === 'Primary') return FAST_PROTOTYPE_PRIMARY_SLICE_INSTRUCTION;
  return (
    `START_CODING — SLICE: ${slice} — implement the NEXT incomplete ${slice} slice only (Build → Debug → Next). ` +
    `If Foundation shell already exists, do NOT rewrite it. Prefer Master Plan pages not yet on disk ` +
    `(teacher dashboard, parent progress, child hub, rewards). Prefer app/, src/, components/, pages/. ` +
    `File blocks for this slice only — not the full §4 app.`
  );
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

export function looksLikePostApplyCodingStall(lastLogMessage?: string | null): boolean {
  return /Runnable skeleton filled/i.test(String(lastLogMessage || ''));
}

/** Apply POST still in flight — do not start the next Go slice yet. */
export function looksLikeApplyInFlightStall(lastLogMessage?: string | null): boolean {
  const s = String(lastLogMessage || '');
  return /Writing files to cloud workspace/i.test(s) || /Applying \d+ file\(s\) to workspace/i.test(s);
}
