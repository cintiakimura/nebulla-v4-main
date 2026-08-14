/**
 * Client-safe spine helpers — no fs/path. Browser may import this file.
 * Server-only uiBriefUsable lives in spineSequenceGates.ts (needs nebulaUiBrief).
 * Authority: nebula-project/recovery-orchestration.md §11.
 */

/** Phase 6 — exact wait copy. Never “all files in one pass.” */
export const GO_SLICE_WAIT_LABEL = "Grok Code: Foundation slice (up to ~3 min, no stream)";
export const GO_PREPARING_LABEL = "Preparing plan before Grok Code…";
export const GO_JOIN_LABEL = "Joining in-flight Foundation job…";

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
    return mins >= 1
      ? `${GO_SLICE_WAIT_LABEL} (~${mins} min)`
      : GO_SLICE_WAIT_LABEL;
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
