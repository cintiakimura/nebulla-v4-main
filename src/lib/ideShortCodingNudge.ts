/**
 * Detect ultra-short coding replies that used to say "Press Go" / START_CODING.
 * Product no longer shows a Go button — these become an auto coding-pass trigger instead.
 */

const GO_NUDGE_RE =
  /\b(press\s+go|click\s+go|hit\s+go|use\s+go|tap\s+go|run\s+go|start_coding|go\s+code)\b/i;

export function isShortCodingGoNudge(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return true;
  if (t.length > 140) return false;
  if (GO_NUDGE_RE.test(t)) return true;
  // Very short replies that only mention Go
  if (t.length <= 48 && /\bgo\b/i.test(t) && !/```/.test(t)) return true;
  return false;
}

export const SHORT_CODING_GO_SUMMARY =
  "I'll write the next slice in your workspace now — carefully, with null-safety where it matters.";