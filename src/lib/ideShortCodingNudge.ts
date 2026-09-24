/**
 * Detect ultra-short coding replies that used to say "Press Go" / START_CODING.
 * Product no longer shows a Go button — these become an auto coding-pass trigger instead.
 *
 * Also: user "go" / "start coding" and assistant "Starting Foundation…" prose
 * must force the Go pipeline even when the model omits the START_CODING tag.
 */

const GO_NUDGE_RE =
  /\b(press\s+go|click\s+go|hit\s+go|use\s+go|tap\s+go|run\s+go|start_coding|go\s+code)\b/i;

/** Strong signals — valid in a long START_CODING paste, not only a 400-char nudge. */
function hasStrongExplicitCodingSignal(t: string): boolean {
  if (/\bSTART_CODING\b/i.test(t)) return true;
  if (/\b(start|begin|continue|keep)\s+coding\b/i.test(t)) return true;
  if (/\b(continue|keep)\s+(building|implementing)\b/i.test(t)) return true;
  if (/\b(write|generate|apply)\s+(the\s+)?(code|files?|foundation)\b/i.test(t)) return true;
  if (/\b(finish|complete)\s+(the\s+)?(app|project|development|coding|build|prototype)\b/i.test(t)) {
    return true;
  }
  return false;
}

const POST_CODE_REFINE_PHRASE_RE =
  /\b(dark\s+theme|light\s+theme|restyle|layout\s+draft|generate\s+ui|make\s+it\s+dark|keep\s+mock|edit\s+existing\s+files\s+only)\b/i;

const POST_CODE_REFINE_VERB_RE =
  /\b(fix|change|update|edit|restyle|rewrite)\b[\s\S]{0,48}\b(home|screen|page|css|theme|color|ui|layout)\b/i;

/** After Live exists: theme / layout / edit-existing asks must start a new Go, even when long. */
export function isPostCodeRefineRequest(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  if (POST_CODE_REFINE_PHRASE_RE.test(t)) return true;
  if (POST_CODE_REFINE_VERB_RE.test(t)) return true;
  if (/\btheme\b/i.test(t)) return true;
  return false;
}

const ASSISTANT_REFINE_CLAIM_RE =
  /\b(applying|fixing|restyling|updating)\b[\s\S]{0,80}\b(theme|dark|layout|home|files|css)\b/i;

/** Assistant claimed a theme/layout/file edit — must start Go even past the short-promise cap. */
export function isAssistantRefineClaim(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  return ASSISTANT_REFINE_CLAIM_RE.test(t);
}

export type CodingRequestContext = {
  /** First user turn on an empty project — lone hello is a greeting. */
  firstUserMessage?: boolean;
  /** North star already confirmed, close offered, or they said that's enough. */
  closerReady?: boolean;
};

const HELLO_GREETING_RE = /^(hello|hi|hey|hellos|hola|ciao|salut)[\s.!?]*$/i;

const LOCK_AND_BUILD_RE =
  /\b(already have (the )?(full )?idea|full idea in mind|no need to brainstorm|just build(?:\s+it)?|skip (the )?(talk|chat|workshop)|don'?t brainstorm|that'?s enough|enough for now)\b/i;

const ALWAYS_GO_RE =
  /^(go|go\.|go!|go\s+ahead|let'?s\s+go|build\s+it|you\s+can\s+start)[\s.!?]*$/i;

const SPOKEN_CLOSER_RE =
  /^(hello|hellos|go(?:\s+ahead)?|let'?s\s+go|build\s+it|you\s+can\s+start|yes|yeah|yep|ok|okay|do\s+it)[\s.!?]*$/i;

export function isFirstMessageGreeting(text: string): boolean {
  return HELLO_GREETING_RE.test(String(text || '').trim());
}

export function isLockAndBuildRequest(text: string): boolean {
  return LOCK_AND_BUILD_RE.test(String(text || '').trim());
}

/** Assistant spoken closer after confirm — product must start Foundation. */
export function isAssistantBuildNowCloser(text: string): boolean {
  return /\bhello\b[\s,;:—–-]*\bi can build this now\b/i.test(String(text || '').trim());
}

export function historyHasConfirmedNorthStar(
  prior?: Array<{ role?: string; content?: string }>,
): boolean {
  if (!prior?.length) return false;
  let asked = false;
  for (const m of prior) {
    const role = String(m.role || '');
    const content = String(m.content || '');
    if (role === 'assistant' && /is that right/i.test(content)) asked = true;
    if (
      asked &&
      role === 'user' &&
      /^(yes|yeah|yep|yup|that'?s\s+right|that\s+is\s+right|correct|exactly|right)[\s.!?]*$/i.test(
        content.trim(),
      )
    ) {
      return true;
    }
    if (role === 'assistant' && /I think we(?:'ve| have) got (?:what we need|it)|here'?s what I heard/i.test(content)) {
      return true;
    }
  }
  return false;
}

/** First seed reply: compliment + reflect + fork. */
export function isGuidedFirstReplyShape(text: string): boolean {
  const t = String(text || '');
  const compliment = /that'?s a great idea|love (this|that)|great idea/i.test(t);
  const reflect = /if i understood correctly[\s\S]{0,240}is that right/i.test(t);
  const fork = /full idea in mind|brainstorm and shape/i.test(t);
  return compliment && reflect && fork;
}

/** User explicitly asked to code / Go — product must run Foundation or next slice, not only chat. */
export function isUserExplicitCodingRequest(text: string, ctx?: CodingRequestContext): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  if (ctx?.firstUserMessage && isFirstMessageGreeting(t)) return false;
  if (/\binterview\b/i.test(t) && !/\bSTART_CODING\b/i.test(t) && !hasStrongExplicitCodingSignal(t)) {
    return false;
  }
  if (/\bmaster\s*plan\b/i.test(t) && !/\b(code|coding|files?|slice|START_CODING)\b/i.test(t)) {
    return false;
  }
  if (hasStrongExplicitCodingSignal(t)) return true;
  if (isPostCodeRefineRequest(t)) return true;
  if (isLockAndBuildRequest(t)) return true;
  // Short nudges only — a long paste without the signals above is discussion, not Go.
  if (t.length > 400) return false;
  if (ALWAYS_GO_RE.test(t)) return true;
  if (ctx?.closerReady && SPOKEN_CLOSER_RE.test(t)) return true;
  // Soft-gate copy: "Reply continue" / "build next" / "continue please"
  if (/^(please\s+)?(continue|build\s+next|next\s+slice)(\s+please)?[\s.!]*$/i.test(t)) return true;
  if (/^(keep going|go ahead)[\s.!]*$/i.test(t)) return true;
  if (/\b(build|implement)\s+(next|the\s+next)\b/i.test(t)) return true;
  if (/\bnext\s+slice\b/i.test(t)) return true;
  if (/\b(can you|please)\s+(finish|complete|keep\s+building|keep\s+coding|continue)\b/i.test(t)) {
    return true;
  }
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
  if (!t) return false;
  if (isAssistantRefineClaim(t)) return true;
  if (isAssistantBuildNowCloser(t)) return true;
  if (t.length > 500) return false;
  if (/\bSTART_CODING\b/i.test(t)) return true;
  return (
    /\b(starting|launching|running|proceeding with|beginning)\b.{0,40}\b(coding|foundation|go\s*code|file apply)\b/i.test(
      t,
    ) ||
    /\bstarting\s+the\s+next\s+slice\b/i.test(t) ||
    /\bmoving ahead\b.{0,80}\b(slice|slices|coding|foundation|flows?)\b/i.test(t) ||
    /\bremaining slices\b/i.test(t) ||
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
