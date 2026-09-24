/**
 * Conversation-to-plan gate: offer summary → user confirm → existing Master Plan spine.
 * First seed / brainstorm turns never pass this gate.
 */

import { getBrowserProjectKey } from './nebulaProjectApi';

export const BRAINSTORM_CLOSE_CONFIRMED_PREFIX = 'BRAINSTORM CLOSE CONFIRMED.';

export type BrainstormCloseKind =
  | 'loop'
  | 'skip-lock'
  | 'correct'
  | 'add-more'
  | 'confirmed';

export type BrainstormCloseState = {
  offeredSummary: string | null;
  skipInsists: number;
  confirmedSummary: string | null;
};

const STORAGE_PREFIX = 'nebula_brainstorm_close_v1:';
const memoryStore = new Map<string, string>();

function storeGet(key: string): string | null {
  try {
    if (typeof sessionStorage !== 'undefined') return sessionStorage.getItem(key);
  } catch {
    /* fall through */
  }
  return memoryStore.get(key) ?? null;
}

function storeSet(key: string, value: string): void {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(key, value);
      return;
    }
  } catch {
    /* fall through */
  }
  memoryStore.set(key, value);
}

function storeRemove(key: string): void {
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
  memoryStore.delete(key);
}

const CLOSE_OFFER_RE =
  /I think we(?:'ve| have) got (?:what we need|it)|here'?s what I heard|this is what I(?:'ll| will) lock|If this is right[\s\S]{0,80}lock it and build/i;

const CONFIRM_RE =
  /^(?:yes|yeah|yep|yup|ok|okay|sure|go(?:\s+ahead)?|looks?\s+good|that'?s\s+it|that\s+is\s+it|lock\s+it|faz\s+isso|perfect|sounds?\s+good|let'?s\s+go|build\s+it|do\s+it|that'?s\s+right|isso)(?:[.!]|\s|$)/i;

const CORRECT_RE =
  /\b(?:no,?\s+(?:the\s+)?(?:goal|it'?s)|not\s+quite|actually\b|wrong\b|drop\s+|instead\b|riders\s+are|same-day|correction|change\s+the\s+goal)\b/i;

const ADD_MORE_RE =
  /\b(?:wait,?\s+also|also\s+add|one\s+more\s+thing|and\s+also|can\s+we\s+(?:also\s+)?add|add\s+(?:tracking|tips|chat))\b/i;

const SKIP_RE =
  /\b(?:just\s+build|skip(?:\s+the)?\s+(?:summary|talk|chat|this)|don'?t\s+(?:summarize|ask)|go\s+build\s+it)\b/i;

function storageKey(projectKey?: string): string {
  const key = (projectKey || getBrowserProjectKey() || 'default').trim() || 'default';
  return `${STORAGE_PREFIX}${key}`;
}

export function emptyBrainstormCloseState(): BrainstormCloseState {
  return { offeredSummary: null, skipInsists: 0, confirmedSummary: null };
}

export function readBrainstormCloseState(projectKey?: string): BrainstormCloseState {
  try {
    const raw = storeGet(storageKey(projectKey));
    if (!raw) return emptyBrainstormCloseState();
    const parsed = JSON.parse(raw) as Partial<BrainstormCloseState>;
    return {
      offeredSummary: typeof parsed.offeredSummary === 'string' ? parsed.offeredSummary : null,
      skipInsists: Number(parsed.skipInsists) || 0,
      confirmedSummary: typeof parsed.confirmedSummary === 'string' ? parsed.confirmedSummary : null,
    };
  } catch {
    return emptyBrainstormCloseState();
  }
}

export function writeBrainstormCloseState(
  next: BrainstormCloseState,
  projectKey?: string,
): void {
  try {
    storeSet(storageKey(projectKey), JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function clearBrainstormCloseState(projectKey?: string): void {
  try {
    storeRemove(storageKey(projectKey));
  } catch {
    /* ignore */
  }
}

export function looksLikeCloseOffer(assistantText: string): boolean {
  const t = String(assistantText || '').trim();
  if (!t || t.length < 60) return false;
  if (/<START_MASTERPLAN>/i.test(t)) return false;
  if (/```file:/i.test(t)) return false;
  return CLOSE_OFFER_RE.test(t);
}

/** SnapFill-style close must name where files live, how extract runs, and who it is for. */
export function closeSummaryNamesDocumentWorkflow(text: string): boolean {
  const t = String(text || '');
  const storage =
    /\b(files? live|on.?device|local(?:ly)?|dossier|history|saved (?:on|to)|storage|where (?:the )?files)\b/i.test(
      t,
    );
  const extract = /\b(extract|ocr|tesseract|read (?:the )?(?:doc|image|file|scan))\b/i.test(t);
  const who = /\b(who|for |clinician|patient|client|sender|rider)\b/i.test(t);
  return storage && extract && who;
}

/** Empty UI at close → one §5 question (vibe / web vs mobile / density). */
export function closeSummaryAsksUiIfEmpty(text: string): boolean {
  return /\b(web or mobile|web vs mobile|vibe|density|how should it (?:feel|look)|look and feel)\b/i.test(
    String(text || ''),
  );
}

export function isCloseConfirmReply(text: string): boolean {
  const t = String(text || '').trim();
  if (!t || t.length > 220) return false;
  if (isCloseCorrectReply(t) || isCloseAddMoreReply(t)) return false;
  return CONFIRM_RE.test(t);
}

export function isCloseCorrectReply(text: string): boolean {
  return CORRECT_RE.test(String(text || ''));
}

export function isCloseAddMoreReply(text: string): boolean {
  return ADD_MORE_RE.test(String(text || ''));
}

export function isSkipSummaryReply(text: string): boolean {
  return SKIP_RE.test(String(text || ''));
}

export function lastAssistantCloseSummary(
  priorMessages: readonly { role: string; content: string }[],
): string | null {
  for (const m of [...priorMessages].reverse()) {
    if (m.role !== 'assistant') continue;
    const body = String(m.content || '').trim();
    if (looksLikeCloseOffer(body)) return body;
  }
  return null;
}

export function rememberCloseOffer(assistantText: string, projectKey?: string): void {
  if (!looksLikeCloseOffer(assistantText)) return;
  const cur = readBrainstormCloseState(projectKey);
  writeBrainstormCloseState(
    { ...cur, offeredSummary: assistantText.trim(), confirmedSummary: null },
    projectKey,
  );
}

export function resolveBrainstormCloseTurn(
  userText: string,
  priorMessages: readonly { role: string; content: string }[],
  projectKey?: string,
): { kind: BrainstormCloseKind; summary: string | null; skipInsists: number } {
  const cur = readBrainstormCloseState(projectKey);
  const liveSummary = lastAssistantCloseSummary(priorMessages) || cur.offeredSummary;
  const skip = isSkipSummaryReply(userText);
  const skipInsists = skip ? cur.skipInsists + 1 : cur.skipInsists;

  if (isCloseCorrectReply(userText)) {
    writeBrainstormCloseState(
      { offeredSummary: liveSummary, skipInsists: 0, confirmedSummary: null },
      projectKey,
    );
    return { kind: 'correct', summary: liveSummary, skipInsists: 0 };
  }

  if (isCloseAddMoreReply(userText)) {
    writeBrainstormCloseState(
      { offeredSummary: liveSummary, skipInsists: 0, confirmedSummary: null },
      projectKey,
    );
    return { kind: 'add-more', summary: liveSummary, skipInsists: 0 };
  }

  if (skip) {
    writeBrainstormCloseState(
      { offeredSummary: liveSummary, skipInsists, confirmedSummary: null },
      projectKey,
    );
    if (skipInsists >= 2 && liveSummary) {
      writeBrainstormCloseState(
        { offeredSummary: liveSummary, skipInsists, confirmedSummary: liveSummary },
        projectKey,
      );
      return { kind: 'confirmed', summary: liveSummary, skipInsists };
    }
    return { kind: 'skip-lock', summary: liveSummary, skipInsists };
  }

  if (liveSummary && isCloseConfirmReply(userText)) {
    writeBrainstormCloseState(
      { offeredSummary: liveSummary, skipInsists, confirmedSummary: liveSummary },
      projectKey,
    );
    return { kind: 'confirmed', summary: liveSummary, skipInsists };
  }

  writeBrainstormCloseState(
    { offeredSummary: liveSummary, skipInsists, confirmedSummary: cur.confirmedSummary },
    projectKey,
  );
  return { kind: 'loop', summary: liveSummary, skipInsists };
}

/** Hidden user turn after confirm — plan writer must use this summary, not the raw seed. */
export function buildBrainstormCloseConfirmedBootstrap(summary: string): string {
  const clipped = String(summary || '').trim().slice(0, 6000);
  return (
    `${BRAINSTORM_CLOSE_CONFIRMED_PREFIX} The user confirmed the spoken summary. ` +
    `That summary is the source of truth. Do not re-infer from the original seed or invent a new goal.\n\n` +
    `CONFIRMED_SUMMARY:\n"""\n${clipped}\n"""\n\n` +
    `THIS TURN = PLAN ONLY from CONFIRMED_SUMMARY.\n` +
    `1) Write \`\`\`file:nebula-project/job-brief.md\`\`\` distilled from the summary. ` +
    `Goal / thesis = the north star sentence (A→B why), never a category label, never the raw chat dump.\n` +
    `2) Emit <START_MASTERPLAN>…</END_MASTERPLAN> with all five sections generated FROM that brief. ` +
    `§1 Goal of the app = the north star sentence + who + in/out of scope.\n` +
    `Features must match the confirmed set. Do not restore cut/merged features. ` +
    `Dependencies: label defaults as assumptions; user choices stay open only if still open. ` +
    `Competitors = none unless the user asked to research during the talk.\n` +
    `Do NOT emit START_CODING, <START_CODING>, or app \`\`\`file:\` blocks (app/, src/, pages/). ` +
    `nebula-project/job-brief.md is allowed. Chat: one short line that the plan is locked.`
  );
}

export function isBrainstormCloseConfirmedMessage(text: string): boolean {
  return String(text || '').trim().startsWith(BRAINSTORM_CLOSE_CONFIRMED_PREFIX);
}
