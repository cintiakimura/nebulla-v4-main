/**
 * Detect ultra-short coding replies that used to say "Press Go" / START_CODING.
 * Product no longer shows a Go button — these become an auto coding-pass trigger instead.
 *
 * Also: user "go" / "start coding" and assistant "Starting Foundation…" prose
 * must force the Go pipeline even when the model omits the START_CODING tag.
 */

const GO_NUDGE_RE =
  /\b(press\s+go|click\s+go|hit\s+go|use\s+go|tap\s+go|run\s+go|start_coding|go\s+code)\b/i;

/** User explicitly asked to code / Go — product must run Foundation or next slice, not only chat. */
export function isUserExplicitCodingRequest(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  if (t.length > 400) return false;
  if (/^(go|go\.|go!)$/i.test(t)) return true;
  // Soft-gate copy: "Reply continue" / "build next"
  if (/^(continue|continue\.|continue!|build\s+next|next\s+slice)$/i.test(t)) return true;
  if (/\bSTART_CODING\b/i.test(t)) return true;
  if (/\b(start|begin|continue|keep)\s+coding\b/i.test(t)) return true;
  // "continue building" / "keep building the app" — common after Foundation stops
  if (/\b(continue|keep)\s+(building|implementing)\b/i.test(t)) return true;
  if (/\b(build|implement)\s+(next|the\s+next)\b/i.test(t)) return true;
  if (/\bnext\s+slice\b/i.test(t)) return true;
  if (/\b(write|generate|apply)\s+(the\s+)?(code|files?|foundation)\b/i.test(t)) return true;
  if (/\b(foundation|coding)\s+slice\b/i.test(t) && /\b(start|run|do|please|now)\b/i.test(t)) {
    return true;
  }
  if (/\bskip\s+(the\s+)?security\b/i.test(t) && /\b(cod|build|go|implement)/i.test(t)) {
    return true;
  }
  if (t.length <= 48 && /\bgo\b/i.test(t) && !/```/.test(t) && !/\?/.test(t)) {
    return true;
  }
  return false;
}

/** Assistant claimed coding started without emitting START_CODING — still launch Go. */
export function isAssistantCodingPromise(text: string): boolean {
  const t = String(text || '').trim();
  if (!t || t.length > 500) return false;
  if (/\bSTART_CODING\b/i.test(t)) return true;
  return (
    /\b(starting|launching|running|proceeding with|beginning)\b.{0,40}\b(coding|foundation|go\s*code|file apply)\b/i.test(
      t,
    ) ||
    /\b(foundation\s+coding\s+slice|coding\s+slice\s+now)\b/i.test(t) ||
    // Prose-only next-slice claims (no START_CODING tag) must still force Go
    /\bnext\s+slice\b.{0,60}\b(landing|implement|building|writing|coding)\b/i.test(t) ||
    /\b(landing|implementing|building)\b.{0,40}\b(next\s+slice|reading\s+exercise)\b/i.test(t)
  );
}

export function isShortCodingGoNudge(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return true;
  if (t.length > 140) return false;
  if (GO_NUDGE_RE.test(t)) return true;
  if (isAssistantCodingPromise(t)) return true;
  // Very short replies that only mention Go
  if (t.length <= 48 && /\bgo\b/i.test(t) && !/```/.test(t)) return true;
  return false;
}

export const SHORT_CODING_GO_SUMMARY =
  "I'll write the next slice in your workspace now — carefully, with null-safety where it matters.";
