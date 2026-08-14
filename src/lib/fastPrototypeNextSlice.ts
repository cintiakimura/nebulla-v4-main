/**
 * Fast Prototype / inference-first: after Foundation lands, auto-run ONE primary feature slice.
 * Max one auto continue per project session — no infinite Go loops.
 */

const primaryAutoDoneKeys = new Set<string>();

export function hasFastPrototypePrimaryAutoRun(projectKey: string): boolean {
  return primaryAutoDoneKeys.has(projectKey || 'default');
}

export function markFastPrototypePrimaryAutoRun(projectKey: string): void {
  primaryAutoDoneKeys.add(projectKey || 'default');
}

/** Test helper */
export function resetFastPrototypePrimaryAutoRunForTests(): void {
  primaryAutoDoneKeys.clear();
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

/**
 * True when Fast Prototype should kick Step 9.2 (primary feature) once after shell/auth.
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

/**
 * User/product asked for the next slice (not first Foundation).
 * Bare "go" / "start coding" stay Foundation on a greenfield turn.
 */
export function userNoteRequestsNextSlice(note?: string | null): boolean {
  const t = String(note || '').trim();
  if (!t) return false;
  if (/SLICE:\s*Primary/i.test(t)) return true;
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
