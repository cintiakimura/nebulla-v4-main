/**
 * Detect a new product brief vs leftover Master Plan / routes.
 * Client-safe — no fs.
 */

import {
  detectProductDomain,
  extractNamedBrand,
  extractStatedProductName,
  inferProductName,
  isNameOnlyProductSeed,
  isWorkspaceLabelStub,
} from "./productIdentity";
import { extractGoalFromUserNote, isCodingCommandNote } from "./spineSequenceClient";

/** Recap / “what did I say” — never mint a project or wipe the thread. */
export function isChatContinuityTurn(text: string): boolean {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return false;
  return /\b(summarize|summarise|recap|what did i (just )?say|everything i said|all i('ve| have) said|to be sure|repeat what i|catch me up)\b/i.test(
    t,
  );
}

/** Same-app refine after Live — never a new product seed. */
export function isSameProductRefineTurn(text: string): boolean {
  const t = String(text || "").trim();
  if (!t) return false;
  if (
    /\b(keep\s+mock|make\s+it\s+dark|dark\s+theme|dark\s+palette|light\s+theme|fix the nav|fix\s+the\s+menu|add a filter|layout\s+draft|edit existing|restyle)\b/i.test(
      t,
    )
  ) {
    return true;
  }
  if (
    t.length < 280 &&
    /\b(nav|menu|theme|palette|color|filter|cta)\b/i.test(t) &&
    !/\b(bridgen|taskwise|quill|new app|new product)\b/i.test(t)
  ) {
    return true;
  }
  return false;
}

export const EDUCATION_LEFTOVER_SLUGS = new Set([
  "session",
  "practice",
  "helper",
  "lessons",
  "lesson",
  "streak",
  "quiz",
  "progress",
  "teacher",
  "parent",
  "homework",
  "tutor",
]);

export const BIKE_SHOP_SLUGS = new Set(["book", "mechanic", "catalog", "cart"]);
export const BAKERY_LEFTOVER_SLUGS = new Set(["order", "baker", "confirmation", "wallet", "catalog", "cart"]);
export const DOCUMENT_LEFTOVER_SLUGS = new Set(["dossiers", "dossier", "forms", "extract"]);
export const BILLS_SLUGS = new Set(["bills", "month", "receipts", "totals"]);

export function isBillsWorkflowGoal(goal: string): boolean {
  const g = String(goal || "").toLowerCase();
  return /\b(bills?|receipts?|running totals?|month(?:ly)?[- ]?(?:list|bills|spend|total))\b/.test(g);
}

/** Texas Hold'em helper — hand / odds / advice. Never a document or bills leftover. */
export function isPokerWorkflowGoal(goal: string): boolean {
  const g = String(goal || "").toLowerCase();
  return /\b(poker|texas hold|hold['’]?e?m|tips['’]?n?\s*hold|tips\s+n\s+hold|pot odds|preflop|hand odds)\b/.test(
    g,
  );
}

/** Twitch / OBS stream overlay — cam + last follower / sub / tip. Not Taskwise or dossiers. */
export function isStreamOverlayGoal(goal: string): boolean {
  const g = String(goal || "").toLowerCase();
  return /\b(twitch|kick\.com|stream overlay|obs overlay|facecam|latest follower|latest subscriber|latest tipper|stream hud|broadcast overlay|streamer overlay)\b/.test(
    g,
  );
}

/** Llama Life–style day planner: water / exercise / positive cue tones — not Taskwise dossiers. */
export function isCuePlannerGoal(goal: string): boolean {
  const g = String(goal || "").toLowerCase();
  if (/\btaskwise\b/.test(g) && !/\b(llama life|nest path|water|exercise|tones?)\b/.test(g)) {
    return false;
  }
  return /\b(llama\s+life|nest\s+path|drink water|water breaks?|positive tones?|daily planner|daily routines?|cue(?:s)? (?:water|exercise)|gentle (?:tones?|sounds?))\b/.test(
    g,
  );
}

export const TASKWISE_CAPTURE_SLUGS = new Set(["input", "summary", "dossier", "dossiers", "tasks"]);
export const PLANNER_CUE_SLUGS = new Set(["water", "exercise", "tones", "today", "cues"]);
export const STREAM_OVERLAY_SLUGS = new Set(["overlay", "alerts", "recent", "hud"]);
export const POKER_LOOP_SLUGS = new Set(["table", "hand", "odds", "advice"]);

/** Chip / STT echo of the leftover name is not a new product brief. */
export function isRepeatedChipAsProductGoal(userText: string, chipName?: string | null): boolean {
  const raw = String(userText || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?]+$/g, "");
  const chip = String(chipName || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw || !chip) return false;
  return raw.toLowerCase() === chip.toLowerCase();
}

function routeSlug(route: string): string {
  const s = String(route || "").trim();
  if (!s || s === "/") return "";
  const withSlash = s.startsWith("/") ? s : `/${s}`;
  return withSlash.replace(/\/+$/, "").replace(/^\//, "").split("/")[0]?.toLowerCase() || "";
}

export function leftoverRoutesConflictWithGoal(goal: string, routes: string[]): boolean {
  const domain = detectProductDomain(goal);
  const slugs = (routes || []).map(routeSlug).filter(Boolean);
  const g = String(goal || "").toLowerCase();
  const delivery = /moto|motodrop|courier|delivery|dropoff|parcel/.test(g);
  const marketplace = domain === "marketplace" || /\b(influencer|bridgen|brands?)\b/i.test(g);
  if (
    (domain === "tasks" || marketplace || /\btaskwise\b/i.test(g)) &&
    slugs.some((s) => EDUCATION_LEFTOVER_SLUGS.has(s))
  ) {
    return true;
  }
  if (domain !== "education" && slugs.some((s) => EDUCATION_LEFTOVER_SLUGS.has(s))) {
    return true;
  }
  if (domain === "education" && slugs.some((s) => BIKE_SHOP_SLUGS.has(s))) {
    return true;
  }
  if (delivery && slugs.some((s) => BAKERY_LEFTOVER_SLUGS.has(s) || BIKE_SHOP_SLUGS.has(s))) {
    return true;
  }
  if (
    (domain === "finance" || isBillsWorkflowGoal(g)) &&
    slugs.some((s) => DOCUMENT_LEFTOVER_SLUGS.has(s))
  ) {
    return true;
  }
  if (
    (domain === "planner" || isCuePlannerGoal(g)) &&
    slugs.some((s) => TASKWISE_CAPTURE_SLUGS.has(s) || DOCUMENT_LEFTOVER_SLUGS.has(s))
  ) {
    return true;
  }
  if (
    isStreamOverlayGoal(g) &&
    slugs.some((s) => TASKWISE_CAPTURE_SLUGS.has(s) || DOCUMENT_LEFTOVER_SLUGS.has(s) || EDUCATION_LEFTOVER_SLUGS.has(s))
  ) {
    return true;
  }
  if (
    isPokerWorkflowGoal(g) &&
    slugs.some(
      (s) =>
        DOCUMENT_LEFTOVER_SLUGS.has(s) ||
        TASKWISE_CAPTURE_SLUGS.has(s) ||
        EDUCATION_LEFTOVER_SLUGS.has(s) ||
        BILLS_SLUGS.has(s),
    )
  ) {
    return true;
  }
  return false;
}

/** Apply must not write leftover kit pages for this lock (poker ≠ dossiers/forms). */
export function shouldSkipLeftoverProductFile(relativePath: string, goal: string): boolean {
  const rel = String(relativePath || "").replace(/\\/g, "/").replace(/^\.\//, "");
  const slug = rel.match(/(?:^|\/)(?:src\/)?app\/([^/]+)\/page\.(tsx|jsx|js)$/i)?.[1]?.toLowerCase() || "";
  if (!slug) return false;
  const g = String(goal || "");
  const documentLock = /\b(mydossier|dossiers?|documents?|ocr|tesseract|scans?|client[- ]?side extract)\b/i.test(g);
  if (!documentLock && DOCUMENT_LEFTOVER_SLUGS.has(slug)) return true;
  if (isPokerWorkflowGoal(g) && DOCUMENT_LEFTOVER_SLUGS.has(slug)) return true;
  return false;
}

/** Empty Go / stale last-result must not apply a previous product’s files. */
export function lastGoCodeFitsGoal(codeText: string, goal: string): boolean {
  const body = String(codeText || "");
  const g = String(goal || "");
  if (!body.trim()) return false;
  if (shouldSkipLeftoverProductFile("app/dossiers/page.tsx", g) && /app\/dossiers\/page/i.test(body)) {
    return false;
  }
  if (shouldSkipLeftoverProductFile("app/forms/page.tsx", g) && /app\/forms\/page/i.test(body)) {
    return false;
  }
  return true;
}

/** New Fast Prototype / New Project brief — not Continue / next slice. */
export function looksLikeStandaloneProductBrief(text: string): boolean {
  const raw = String(text || "").trim();
  if (!raw) return false;
  if (isChatContinuityTurn(raw) || isNameOnlyProductSeed(raw)) return false;
  if (/^(continue|continue\.|continue!|build\s+next|next\s+slice)\b/i.test(raw)) return false;
  if (/^(hello|hi|hey|hellos|yes|yeah|ok|go)[\s.!?]*$/i.test(raw)) return false;
  if (extractStatedProductName(raw) || extractNamedBrand(raw)) return true;
  const goal = extractGoalFromUserNote(raw);
  if (!goal || goal.length < 20) return false;
  if (isCodingCommandNote(raw) && !goal) return false;
  if (extractNamedBrand(goal)) return true;
  return /\b(build|shop|marketplace|companion|bike|bakery|mechanic|moto|courier|delivery|parcel|uber|dropoff|influencer|influencers|brands?|bridgen|creator|app that|bills?|receipts?|running totals?|llama life|daily planner|drink water|nest path|poker|holdem|hold.?em|odds|for (kids|parents|customers|readers|riders|senders))\b/i.test(
    goal,
  );
}

/** True when the incoming brief is a different product than leftover §1 (or leftover tabs). */
export function isReplacementProductBrief(incoming: string, existing: string): boolean {
  const next = String(incoming || "").replace(/\s+/g, " ").trim();
  const prev = String(existing || "").replace(/\s+/g, " ").trim();
  if (!next || !prev) return false;
  const nextBrand = extractNamedBrand(next);
  const prevBrand = extractNamedBrand(prev);
  if (nextBrand && prevBrand && nextBrand.toLowerCase() !== prevBrand.toLowerCase()) {
    return true;
  }
  const nextStated = extractStatedProductName(next) || nextBrand;
  const prevStated = extractStatedProductName(prev) || prevBrand;
  if (nextStated && prevStated && nextStated.toLowerCase() !== prevStated.toLowerCase()) {
    return true;
  }
  const nextDomain = detectProductDomain(next);
  const prevDomain = detectProductDomain(prev);
  if (nextDomain !== "general" && prevDomain !== "general" && nextDomain !== prevDomain) {
    return true;
  }
  if (nextDomain === "finance" && prevDomain !== "finance") return true;
  if (prevDomain === "finance" && nextDomain !== "finance") return true;
  if (isBillsWorkflowGoal(next) && !isBillsWorkflowGoal(prev)) return true;
  if (isCuePlannerGoal(next) && !isCuePlannerGoal(prev)) return true;
  if (isStreamOverlayGoal(next) && !isStreamOverlayGoal(prev)) return true;
  if (isPokerWorkflowGoal(next) && !isPokerWorkflowGoal(prev)) return true;
  if (nextDomain === "planner" && prevDomain !== "planner") return true;
  if (nextBrand && prevBrand) return false;
  if (leftoverRoutesConflictWithGoal(next, extractRouteTokens(prev))) return true;
  return false;
}

function extractRouteTokens(text: string): string[] {
  const out: string[] = [];
  const re = /`(\/[^`\s]+)`|href=["'](\/[^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(text || "")))) {
    out.push(m[1] || m[2] || "");
  }
  return out;
}

export function leftoverPlanConflictsWithGoal(plan: Record<string, unknown> | null | undefined): boolean {
  const rec = plan && typeof plan === "object" ? plan : {};
  const goal = String(rec["1. Goal of the app"] || rec.goal || "").trim();
  if (!goal) return false;
  const rest = [
    String(rec["2. Tech and Research"] || rec["2. Text & Search"] || ""),
    String(rec["3. Features and KPIs"] || ""),
    String(rec["4. Pages and navigation"] || ""),
    String(rec["5. UI/UX design"] || ""),
  ]
    .join("\n")
    .trim();
  if (!rest) return false;
  if (isReplacementProductBrief(goal, rest)) return true;
  const routes = extractRouteTokens(String(rec["4. Pages and navigation"] || ""));
  return leftoverRoutesConflictWithGoal(goal, routes);
}

/** Chip is Quill Path / City Courier and the user named Taskwise (or another product). */
export function isNewProductSeedAgainstCurrent(opts: {
  userText: string;
  chipName?: string | null;
  diskGoal?: string | null;
}): boolean {
  const raw = String(opts.userText || "").trim();
  if (!raw) return false;
  if (isChatContinuityTurn(raw) || isNameOnlyProductSeed(raw)) return false;
  if (isRepeatedChipAsProductGoal(raw, opts.chipName)) return false;
  if (isSameProductRefineTurn(raw)) return false;
  if (/^(continue|continue\.|continue!|build\s+next|next\s+slice|hello|hi|hey|hellos|yes|yeah|ok|go)[\s.!?]*$/i.test(raw)) {
    return false;
  }
  const incoming =
    extractStatedProductName(raw) ||
    extractNamedBrand(raw) ||
    extractNamedBrand(extractGoalFromUserNote(raw) || "");
  const chip = String(opts.chipName || "").replace(/\s+/g, " ").trim();
  const diskBrand =
    extractNamedBrand(String(opts.diskGoal || "")) ||
    extractStatedProductName(String(opts.diskGoal || ""));
  const current = diskBrand || (!isWorkspaceLabelStub(chip) ? chip : "");
  if (incoming && current && incoming.toLowerCase() !== current.toLowerCase()) {
    return true;
  }
  const inferred = inferProductName(raw);
  if (
    current &&
    inferred &&
    inferred.toLowerCase() !== current.toLowerCase() &&
    looksLikeStandaloneProductBrief(raw)
  ) {
    return true;
  }
  const diskGoal = String(opts.diskGoal || "").trim();
  const incomingGoal = extractGoalFromUserNote(raw) || raw;
  if (current && looksLikeStandaloneProductBrief(raw) && isReplacementProductBrief(incomingGoal, current)) {
    return true;
  }
  if (diskGoal && looksLikeStandaloneProductBrief(raw)) {
    if (isReplacementProductBrief(incomingGoal, diskGoal)) return true;
  }
  return false;
}
