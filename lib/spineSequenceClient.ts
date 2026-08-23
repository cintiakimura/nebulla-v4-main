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

const CODING_COMMAND_GOAL_RE =
  /^(please\s+)?(continue|go|go\.|go!|build\s+next|next\s+slice|keep going|go ahead)([\s.!]*)$/i;

/** Chat / Go notes that must never become Master Plan §1. */
export function isCodingCommandNote(note?: string | null): boolean {
  const t = String(note || "").trim();
  if (!t) return true;
  if (CODING_COMMAND_GOAL_RE.test(t)) return true;
  if (/^START_CODING\b/i.test(t)) return true;
  if (/^FAST PROTOTYPE (MODE|CONTINUE)\./i.test(t) && !/User goal \/ brief:/i.test(t)) {
    return true;
  }
  if (
    /\bSLICE:\s*(Foundation|Auth|Data\+API|Primary|Secondary|Polish)\b/i.test(t) &&
    t.length < 900 &&
    !/User goal \/ brief:/i.test(t)
  ) {
    return true;
  }
  return false;
}

function unwrapUserBrief(raw: string): string {
  const tagged = raw.match(/User goal \/ brief:\s*"""([\s\S]*?)"""/i);
  if (tagged?.[1]?.trim()) return tagged[1].trim();
  if (/FAST PROTOTYPE|User goal/i.test(raw)) {
    const quoted = raw.match(/"""([\s\S]*?)"""/);
    if (quoted?.[1]?.trim()) return quoted[1].trim();
  }
  return raw.trim();
}

function clipAtWord(text: string, maxChars: number): string {
  const s = String(text || "").trim();
  if (s.length <= maxChars) return s;
  const cut = s.slice(0, maxChars);
  const at = Math.max(
    cut.lastIndexOf(". "),
    cut.lastIndexOf("—"),
    cut.lastIndexOf(" – "),
    cut.lastIndexOf("; "),
    cut.lastIndexOf(", "),
  );
  return (at >= 80 ? cut.slice(0, at) : cut).replace(/[,;:\s—–-]+$/, "").trim();
}

/** Opening purpose only — never the whole landing essay. */
export function firstPurposeSentences(text: string, maxChars = 400): string {
  const firstPara = String(text || "").split(/\n\s*\n/)[0] || String(text || "");
  let t = firstPara
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/described in the study below\s*[—–\-:,]?\s*/gi, " ")
    .replace(/\bFAST PROTOTYPE (MODE|CONTINUE)\.\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const parts = t.match(/[^.!?]+[.!?]+(?:\s+|$)/g);
  if (parts && parts.length > 0) {
    t = parts.slice(0, 2).join(" ").trim();
  }
  return clipAtWord(t, maxChars);
}

function labeledLine(raw: string, re: RegExp): string {
  const m = String(raw || "").match(re);
  return (m?.[1] || "").replace(/\s+/g, " ").trim();
}

function inferProjectTypeFromBrief(text: string): string {
  const t = String(text || "");
  if (/\bmobile app\b/i.test(t) || (/\bmobile\b/i.test(t) && !/\bweb app\b/i.test(t))) {
    return "Mobile App";
  }
  if (/\blanding page\b/i.test(t)) return "Landing Page";
  return "Web App";
}

function normalizeGoalCompare(s: string): string {
  return String(s || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/project type:\s*[^\n]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True when §1 is the user's raw prompt (or an essay dump), not a Goal tab.
 */
export function looksLikeRawUserPrompt(section?: string | null, rawBrief?: string | null): boolean {
  const t = String(section || "").trim();
  if (!t) return false;
  if (/User goal \/ brief:|FAST PROTOTYPE (MODE|CONTINUE)\./i.test(t)) return true;
  if (/described in the study below/i.test(t)) return true;
  if (/https?:\/\//i.test(t) && t.length > 400) return true;
  const paragraphs = t.split(/\n\s*\n/).filter((p) => p.trim());
  if (t.length > 900 && paragraphs.length >= 3 && /^build a\b/i.test(t)) return true;
  if (t.length > 1600) return true;
  const brief = unwrapUserBrief(String(rawBrief || ""));
  if (brief.length >= 80) {
    const a = normalizeGoalCompare(t).slice(0, 280);
    const b = normalizeGoalCompare(brief).slice(0, 280);
    const structured =
      /^Project Type:/im.test(t) && t.length <= 900 && !/https?:\/\//.test(t) && !/study below/i.test(t);
    if (!structured && a && b && (a === b || a.includes(b.slice(0, 140)) || b.includes(a.slice(0, 140)))) {
      if (t.length > 400 || brief.length > 400) return true;
    }
  }
  return false;
}

const GOAL_DISTILL_MAX = 900;

/**
 * Turn a landing / chat prompt into a Goal tab: purpose, users, in/out of scope.
 * Never keeps study URLs or the raw multi-paragraph prompt.
 */
export function distillBriefToGoalSection(brief?: string | null, extraHint?: string | null): string {
  const raw = unwrapUserBrief(String(brief || "").trim());
  if (!raw) return "";
  const purpose = firstPurposeSentences(raw);
  if (!purpose || !isUsableProjectGoal(purpose)) return "";
  const users = labeledLine(
    raw,
    /(?:primary users?|users?(?:\s*\/\s*roles?)?|who(?:'s| is) it for)\s*[:—–-]\s*([^\n]+)/i,
  );
  const inScope = labeledLine(raw, /in scope[^\n:]*:\s*([^\n]+)/i);
  const outScope = labeledLine(raw, /out of scope[^\n:]*:\s*([^\n]+)/i);
  const type = inferProjectTypeFromBrief(`${raw}\n${extraHint || ""}`);
  const lines = [`Project Type: ${type}`, "", purpose];
  if (users) lines.push("", `Primary users: ${clipAtWord(users, 180)}`);
  if (inScope) lines.push(`In scope (v1): ${clipAtWord(inScope, 220)}`);
  if (outScope) lines.push(`Out of scope: ${clipAtWord(outScope, 180)}`);
  if (!users && !inScope && !outScope) {
    lines.push("", "Users, problem, and MVP scope for this workspace.");
  }
  return lines.join("\n").trim().slice(0, GOAL_DISTILL_MAX);
}

/**
 * Pull the real product brief out of a Fast Prototype bootstrap or user note.
 * "continue" / START_CODING slice instructions return empty.
 * Long essays are reduced to the opening purpose — not stored as §1 verbatim.
 */
export function extractGoalFromUserNote(note?: string | null): string {
  const raw = String(note || "").trim();
  if (!raw) return "";
  const inner = unwrapUserBrief(raw);
  if (inner && inner !== raw) {
    const purpose = firstPurposeSentences(inner);
    if (isUsableProjectGoal(purpose)) return purpose.slice(0, 400);
  }
  if (isCodingCommandNote(raw)) return "";
  const purpose = firstPurposeSentences(raw);
  if (isUsableProjectGoal(purpose)) return purpose.slice(0, 400);
  const slice = raw.replace(/\s+/g, " ").trim();
  if (isUsableProjectGoal(slice)) return slice.slice(0, 400);
  return "";
}

/** Goal heading in nebula-project/fast-prototype-memory.md (inference-first Step 3.1). */
export function extractGoalFromMemoryMarkdown(md?: string | null): string {
  const t = String(md || "").trim();
  if (!t) return "";
  const heading = t.match(
    /(?:^|\n)\s*(?:#{1,3}\s*)?(?:\*\*)?(?:user\s+)?goal(?:\s*\/\s*brief)?(?:\*\*)?\s*[:\-]\s*([\s\S]+?)(?=\n\s*(?:#{1,3}\s|\*\*[A-Za-z]|stage\s*=)|$)/i,
  );
  const body = (heading?.[1] || "").replace(/\s+/g, " ").trim();
  if (isUsableProjectGoal(body)) return body.slice(0, 2000);
  return "";
}

/**
 * Keep purpose/users/scope when Grok dumped §4 page fields into §1.
 */
export function extractProductGoalFromSection(raw?: string | null): string {
  let t = String(raw || "").trim();
  if (!t) return "";
  t = t.replace(/\bSTART_CODING\b/gi, " ").replace(/\bPLAN_READY\b/gi, " ");
  const cut = t.search(
    /\b(Authz|Empty state|Error state|Primary actions|Data entities|Nav links)\s*:/i,
  );
  if (cut >= 24) t = t.slice(0, cut);
  t = t.replace(/\s+/g, " ").trim();
  if (isUsableProjectGoal(t)) return t.slice(0, 2000);
  return "";
}

/**
 * Phase 1: empty/junk goals must not open Go or UI Gen.
 * “tutor kids with ADHD” is usable; “hi” / “test” / “continue” / punctuation-only is not.
 */
export function isUsableProjectGoal(goal: string): boolean {
  const original = String(goal || "").trim();
  const t = original.replace(/\s+/g, " ");
  if (t.length < 8) return false;
  if (!/[a-zA-Z]{3,}/.test(t)) return false;
  if (/\bSTART_CODING\b/i.test(t)) return false;
  if (/\bPLAN_READY\b/i.test(t)) return false;
  if (/^FAST PROTOTYPE (MODE|CONTINUE)\./i.test(t)) return false;
  if (CODING_COMMAND_GOAL_RE.test(t)) return false;
  const firstContentLine = original
    .split(/\n/)
    .map((l) => l.trim())
    .find((l) => l && !/^project type:/i.test(l)) || "";
  if (CODING_COMMAND_GOAL_RE.test(firstContentLine)) return false;
  if (/users, problem, and mvp scope for this workspace/i.test(t)) {
    const extra = t
      .replace(/project type:\s*(web app|mobile app|landing page|other)?/gi, " ")
      .replace(/users, problem, and mvp scope for this workspace\.?/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!extra || extra.length < 8 || CODING_COMMAND_GOAL_RE.test(extra)) return false;
  }
  if (/\b(Authz|Empty state|Error state|Primary actions|Data entities|Nav links)\s*:/i.test(t)) {
    return false;
  }
  if (/\bPurpose:\s*Primary landing\b/i.test(t)) return false;
  if (/^Home\s+'?\/'?/i.test(t) || /\bHome\s+'\/'\s*-/i.test(t)) return false;
  const lower = t.toLowerCase().replace(/[.!?]+$/g, "").trim();
  if (/\bnot specified\b/i.test(t)) return false;
  if (/build untitled/i.test(t)) return false;
  if (/UI generation running from the Master Plan/i.test(t)) return false;
  if (/^Architecture draft is ready/i.test(t)) return false;
  if (/^(tbd|todo|n\/a|none|placeholder)(\s|$)/i.test(lower)) return false;
  if (
    /^(untitled(\s+project)?|new project|test(ing)?|hello|hi|hey|asdf+|xxx+|foo|bar|ok|okay|go|start|continue|build next|next slice)$/i.test(
      lower,
    )
  ) {
    return false;
  }
  return true;
}

/** Empty, too short, orchestration stub, or raw prompt dump — rewrite §1. */
export function goalSectionNeedsReseed(goal: string, rawBrief?: string | null): boolean {
  const t = String(goal || "").trim();
  if (!t || t.length < MIN_SEEDED_GOAL_CHARS) return true;
  if (looksLikeRawUserPrompt(t, rawBrief)) return true;
  return !isUsableProjectGoal(t);
}

export const ASK_FOR_SHORT_GOAL =
  "Write a short usable goal for this app (who it is for and what it helps them do). I will not start research, the UI mockup, or Foundation until §1 is filled.";

/** Empty Master Plan / missing §1 must not skip Grok chat or start research/Go. */
export function planRecordHasUsableGoal(plan: Record<string, unknown> | null | undefined): boolean {
  return isUsableProjectGoal(pickPlanText(plan?.["1. Goal of the app"]));
}

const pickPlanText = (raw: unknown): string => String(raw || "").trim();

/**
 * Goal for research / Go when §1 is blank. Prefer project name / user note over page contracts.
 */
export function inferGoalFromPlanRecord(
  plan: Record<string, unknown> | null | undefined,
  extraFallbacks: string[] = [],
): string {
  const fromSection = extractProductGoalFromSection(pickPlanText(plan?.["1. Goal of the app"]));
  const candidates = [
    fromSection,
    extractProductGoalFromSection(pickPlanText(plan?.["Goal of the app"])),
    extractGoalFromUserNote(pickPlanText(plan?.goal)),
    ...extraFallbacks.map((x) => extractGoalFromUserNote(x) || extractProductGoalFromSection(x)),
    extractProductGoalFromSection(pickPlanText(plan?.["3. Features and KPIs"])),
  ];
  for (const c of candidates) {
    if (!c) continue;
    const slice = c.replace(/\s+/g, " ").trim();
    if (isUsableProjectGoal(slice.slice(0, 400))) return c.slice(0, 2000);
  }
  return "";
}

const MIN_SEEDED_GOAL_CHARS = 48;

/** Persistable §1 when Grok skipped the Goal tab but the rest of the plan (or project name) exists. */
export function seedGoalOfTheAppSection(
  plan: Record<string, unknown> | null | undefined,
  extraFallbacks: string[] = [],
): string {
  const existing = pickPlanText(plan?.["1. Goal of the app"]);
  const briefHint = extraFallbacks.filter(Boolean).join("\n");
  if (
    existing.length >= MIN_SEEDED_GOAL_CHARS &&
    isUsableProjectGoal(existing) &&
    !looksLikeRawUserPrompt(existing, briefHint)
  ) {
    return existing;
  }
  const rescued = extractProductGoalFromSection(existing);
  const inferred = inferGoalFromPlanRecord(plan, extraFallbacks);
  const coreRaw =
    rescued && isUsableProjectGoal(rescued) && !looksLikeRawUserPrompt(rescued, briefHint)
      ? rescued
      : existing.length >= 8 && isUsableProjectGoal(existing) && !looksLikeRawUserPrompt(existing, briefHint)
        ? existing
        : inferred || existing || briefHint;
  if (!coreRaw) return "";
  const distilled = distillBriefToGoalSection(coreRaw, briefHint);
  if (distilled && isUsableProjectGoal(distilled) && !looksLikeRawUserPrompt(distilled)) {
    return distilled;
  }
  const who = firstPurposeSentences(coreRaw, 280);
  if (!who || !isUsableProjectGoal(who)) return "";
  const projectType = inferProjectTypeFromBrief(`${who}\n${briefHint}`);
  return [
    `Project Type: ${projectType}`,
    "",
    who,
    "",
    "Users, problem, and MVP scope for this workspace.",
  ]
    .join("\n")
    .trim()
    .slice(0, 900);
}
