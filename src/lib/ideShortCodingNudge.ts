/**
 * Detect ultra-short coding replies ("Press Go", "START_CODING", etc.)
 * so the IDE can surface a prominent Go CTA instead of a nearly empty bubble.
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
  "I'll write the code in your workspace when you press Go — carefully, with null-safety where it matters.";
