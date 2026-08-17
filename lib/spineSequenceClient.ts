/**
 * Client-safe spine helpers — no fs/path. Browser may import this file.
 * Server-only uiBriefUsable lives in spineSequenceGates.ts (needs nebulaUiBrief).
 * Authority: nebula-project/recovery-orchestration.md §11.
 */

/** Phase 6 — exact wait copy. Never “all files in one pass.” */
export const GO_SLICE_WAIT_LABEL = "Grok Code: Foundation slice (up to ~3 min, no stream)";
export const GO_PREPARING_LABEL = "Preparing plan before Grok Code…";
export const GO_JOIN_LABEL = "Joining in-flight Foundation job…";
export const GO_CODE_PASS1_LABEL = "Code pass 1";
export const GO_CODE_PASS2_LABEL = "Code pass 2";

/** First poll immediately, then 2s, then 5s. */
export const GO_POLL_FIRST_MS = 0;
export const GO_POLL_SECOND_MS = 2000;
export const GO_POLL_LATER_MS = 5000;

export function goPollBackoffMs(pollIndex: number): number {
  if (pollIndex <= 0) return GO_POLL_FIRST_MS;
  if (pollIndex === 1) return GO_POLL_SECOND_MS;
  return GO_POLL_LATER_MS;
}

export function goCodePassWaitLabel(pass: number, sliceLabel?: string | null): string {
  const n = pass <= 1 ? 1 : 2;
  const slice = String(sliceLabel || "").trim();
  if (slice && !/^foundation$/i.test(slice)) return `Code pass ${n} (${slice})`;
  return n === 2 ? GO_CODE_PASS2_LABEL : GO_CODE_PASS1_LABEL;
}

export type GoPollPhase = "idle" | "preparing" | "coding" | "done" | "error";

export function classifyGoPoll(poll: {
  idle?: boolean;
  pending?: boolean;
  coding?: boolean;
  preparing?: boolean;
  error?: string;
  codeError?: string;
  choices?: { message?: { content?: string } }[];
}): GoPollPhase {
  if (poll.codeError && !poll.choices?.[0]?.message?.content?.trim()) return "error";
  if (poll.error && !poll.choices?.length) return "error";
  if (poll.preparing && !poll.coding) return "preparing";
  if (poll.pending && poll.coding) return "coding";
  if (poll.idle) return "idle";
  if (poll.choices?.[0]?.message?.content?.trim()) return "done";
  return "idle";
}

/** Phase 6 activity line from poll. */
export function goPollActivityMessage(phase: GoPollPhase, elapsedMs?: number): string {
  if (phase === "preparing") return GO_PREPARING_LABEL;
  if (phase === "coding") {
    const mins = elapsedMs ? Math.round(elapsedMs / 60_000) : 0;
    return mins >= 1 ? `${GO_CODE_PASS1_LABEL} (~${mins} min)` : GO_CODE_PASS1_LABEL;
  }
  return GO_PREPARING_LABEL;
}

/** Phase 4 — brief too short to start UI Gen / Go. */
export const UI_BRIEF_MIN_CHARS = 80;

export function uiBriefTooShort(length: number): boolean {
  return (length || 0) < UI_BRIEF_MIN_CHARS;
}

/**
 * Phase 1: empty/junk goals must not open Go or UI Gen.
 * “tutor kids with ADHD” is usable; “hi” / “test” / punctuation-only is not.
 */
export function isUsableProjectGoal(goal: string): boolean {
  const t = String(goal || "").trim().replace(/\s+/g, " ");
  if (t.length < 8) return false;
  if (!/[a-zA-Z]{3,}/.test(t)) return false;
  const lower = t.toLowerCase().replace(/[.!?]+$/g, "").trim();
  if (
    /^(untitled(\s+project)?|new project|test(ing)?|hello|hi|hey|asdf+|xxx+|foo|bar|ok|okay|go|start)$/i.test(
      lower,
    )
  ) {
    return false;
  }
  return true;
}

export const ASK_FOR_SHORT_GOAL =
  "Write a short goal for this app (who it is for and what it helps them do). I will not start the UI mockup or Foundation until that exists.";

/** Empty Master Plan / missing §1 must not skip Grok chat or start research/Go. */
export function planRecordHasUsableGoal(plan: Record<string, unknown> | null | undefined): boolean {
  if (!plan || typeof plan !== "object") return false;
  const goal = String(
    plan["1. Goal of the app"] || plan["Goal of the app"] || plan.goal || "",
  ).trim();
  return isUsableProjectGoal(goal);
}
