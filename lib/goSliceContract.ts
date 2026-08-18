/**
 * Go slice contract — one coherent slice per Go.
 * Authority: nebulla-project/incremental-development.md
 */

import fs from "fs";
import path from "path";
import { assessApplyRouteDepth, isStaticHtmlProductApply, listProductUiFiles } from "./workspaceCodedAppUi";
import { goBlocked, type GoBlockedReason } from "./goBlockedReason";

export const GO_SLICE_LABELS = [
  "Foundation",
  "Auth",
  "Data+API",
  "Primary",
  "Secondary",
  "Polish",
] as const;

export type GoSliceLabel = (typeof GO_SLICE_LABELS)[number];

const ALIASES: Record<string, GoSliceLabel> = {
  foundation: "Foundation",
  setup: "Foundation",
  shell: "Foundation",
  auth: "Auth",
  authentication: "Auth",
  access: "Auth",
  "data+api": "Data+API",
  data: "Data+API",
  api: "Data+API",
  "core data": "Data+API",
  primary: "Primary",
  "primary feature": "Primary",
  secondary: "Secondary",
  polish: "Polish",
  ui: "Polish",
};

/** Parse slice label from PRE_CODING_SUMMARY or user note. */
export function parseGoSliceLabel(text: string | undefined | null): GoSliceLabel | null {
  if (!text?.trim()) return null;
  const t = text.trim();
  const tagged = t.match(
    /\bSLICE\s*:\s*(Foundation|Auth|Data\+API|Primary|Secondary|Polish)\b/i,
  );
  if (tagged?.[1]) {
    const key = tagged[1].toLowerCase().replace(/\s+/g, " ");
    return ALIASES[key] || (GO_SLICE_LABELS.find((l) => l.toLowerCase() === key) ?? null);
  }
  for (const label of GO_SLICE_LABELS) {
    if (new RegExp(`\\b${label.replace("+", "\\+")}\\b`, "i").test(t)) return label;
  }
  for (const [alias, label] of Object.entries(ALIASES)) {
    if (alias.length < 3) continue;
    if (new RegExp(`\\b${alias.replace("+", "\\+")}\\b`, "i").test(t)) return label;
  }
  return null;
}

export function formatSlicePromptLine(slice: GoSliceLabel): string {
  return `SLICE: ${slice}`;
}

/** Soft warn when apply looks like a full-app dump for a non-Foundation slice. */
export function assessOversizedGoApply(opts: {
  sliceLabel?: GoSliceLabel | null;
  writtenPaths: string[];
}): { oversized: boolean; message: string | null } {
  const appFiles = (opts.writtenPaths || []).filter((p) =>
    /^(app|components|src|pages)\//.test(p),
  );
  const threshold = opts.sliceLabel === "Foundation" ? 24 : 14;
  if (appFiles.length <= threshold) return { oversized: false, message: null };
  return {
    oversized: true,
    message: `This Go wrote ${appFiles.length} app files — consider narrowing to one slice (${opts.sliceLabel || "Foundation"}) and validating before the next Go.`,
  };
}

/** Bare "go" / START_CODING with no focused note — skip Phase-A LLM. */
export function isBareGoNote(note: string | undefined | null): boolean {
  const t = String(note || "")
    .trim()
    .replace(/^START_CODING\s*[—\-:]?\s*/i, "")
    .trim();
  if (!t) return true;
  return /^(go|continue|continue building|next|next slice|keep going|proceed)[\s!.]*$/i.test(t);
}

function workspaceExists(...parts: string[]): boolean {
  return fs.existsSync(path.join(...parts));
}

const SLICE_RANK: Record<GoSliceLabel, number> = {
  Foundation: 0,
  Auth: 1,
  "Data+API": 2,
  Primary: 3,
  Secondary: 4,
  Polish: 5,
};

/** Heuristic next slice from on-disk app shell (no LLM). Never skip to Secondary on 1–2 stub routes. */
export function inferGoSliceFromWorkspace(workspaceRoot: string): GoSliceLabel {
  const root = workspaceRoot.trim();
  if (!root) return "Foundation";
  const productFiles = listProductUiFiles(root, 40);
  const depth = assessApplyRouteDepth(productFiles);
  const routes = depth.productRoutes;
  // Vite App/main or mockup index.html is not a Foundation — need app/ or pages/ routes.
  if (routes.length === 0 || depth.thinCodeShell) return "Foundation";

  const AUTH_ROUTE = /^\/(login|auth|signin|sign-in|signup|register|sign-up)$/i;
  const screens = routes.filter((r) => !AUTH_ROUTE.test(r));
  const hasAuth =
    workspaceExists(root, "lib", "auth.ts") ||
    workspaceExists(root, "src", "lib", "auth.ts") ||
    workspaceExists(root, "src", "pages", "Login.tsx") ||
    workspaceExists(root, "app", "login", "page.tsx") ||
    workspaceExists(root, "app", "auth", "page.tsx");
  if (!hasAuth) return screens.length <= 1 ? "Foundation" : "Auth";
  // Home + one extra (login does not count) is still Primary, not Secondary.
  if (screens.length < 3) return "Primary";
  return "Secondary";
}

/** LLM/summary must not skip ahead of what disk actually supports. */
export function clampClaimedSliceToWorkspace(
  claimed: string | null | undefined,
  workspaceRoot: string,
): GoSliceLabel {
  const inferred = inferGoSliceFromWorkspace(workspaceRoot);
  const parsed = parseGoSliceLabel(claimed) || inferred;
  return SLICE_RANK[parsed] > SLICE_RANK[inferred] ? inferred : parsed;
}

/** Rewrite PRE_CODING_SUMMARY so SLICE: cannot skip ahead of disk. */
export function applyClampedSliceToSummary(summary: string, workspaceRoot: string): string {
  const clamped = clampClaimedSliceToWorkspace(summary, workspaceRoot);
  const rest = String(summary || "").replace(/^\s*SLICE\s*:[^\n]*\n?/i, "").trim();
  return rest ? `SLICE: ${clamped}\n${rest}` : `SLICE: ${clamped}`;
}

/**
 * Local PRE_CODING_SUMMARY — avoids blocking Go on Grok-4 Phase A when plan is ready.
 */
export function buildLocalPreCodingSummary(opts: {
  workspaceRoot: string;
  userNote?: string;
  existingSummary?: string;
  projectName?: string;
}): string {
  const fromNote = parseGoSliceLabel(opts.userNote);
  const fromExisting = parseGoSliceLabel(opts.existingSummary);
  const rawSlice =
    fromNote ||
    (!opts.userNote?.trim() || isBareGoNote(opts.userNote) ? fromExisting : null) ||
    inferGoSliceFromWorkspace(opts.workspaceRoot);
  const slice = clampClaimedSliceToWorkspace(rawSlice, opts.workspaceRoot);
  const name = (opts.projectName || "App").trim().slice(0, 64);
  const focus = String(opts.userNote || "").trim().slice(0, 180);
  const lines = [
    formatSlicePromptLine(slice),
    `- Project: ${name}`,
    `- Project Type: infer from Master Plan §1 (prefer Mobile App when kids/tutor/ADHD)`,
    `- This Go: ${slice} slice only — Build → Debug → Next; do not dump every §4 route`,
    focus && !isBareGoNote(focus) ? `- Session focus: ${focus}` : `- Session focus: next incomplete ${slice} work from Master Plan`,
    "- Files: app/, src/, components/, lib/ for this slice — prefer real screens over master-plan.json-only",
    "- Validate: routes render, no Nebulla IDE chrome (#080A14 / #00D4D4), auth fields only on Login",
    "- Risks: hosted BaaS clients; oversized multi-route dump",
  ];
  return lines.join("\n").slice(0, 1200);
}

/** True when Master Plan already has a usable PRE_CODING_SUMMARY / SLICE line. */
export function isUsablePreCodingSummary(summary?: string | null): boolean {
  const t = String(summary || "").trim();
  if (t.length < 24) return false;
  if (/^SLICE\s*:/im.test(t)) return true;
  return Boolean(parseGoSliceLabel(t));
}

/**
 * Skip expensive Grok-4 Phase A when a SLICE summary already exists.
 * Bare "go"/"continue" still skip (local summary) when none exists yet.
 */
export function shouldSkipPhaseALlm(opts: {
  userNote?: string;
  existingSummary?: string;
}): boolean {
  if (isUsablePreCodingSummary(opts.existingSummary)) return true;
  return isBareGoNote(opts.userNote);
}

/**
 * Pass 2 only when apply was empty, plan-only, or zero product routes.
 * ≥1 real app/|pages/ route → no second Code job.
 */
export function shouldRunGoCodeSecondPass(opts: {
  totalWritten: number;
  writtenPaths: string[];
  partialPlanOnly?: boolean;
}): boolean {
  if (opts.totalWritten <= 0 || !opts.writtenPaths?.length) return true;
  if (opts.partialPlanOnly) return true;
  if (isStaticHtmlProductApply(opts.writtenPaths)) return false;
  return assessApplyRouteDepth(opts.writtenPaths).zeroProductRoutes;
}

/** Compact Go Code user payload — SLICE + §1/§4 + constraints + ui-brief pages. No chat history. */
export function buildCompactGoCodeUserPrompt(opts: {
  sliceLine: string;
  goal: string;
  pagesSection: string;
  constraints: string;
  uiBriefPageList: string;
  sessionFocus: string;
  continuation?: boolean;
}): string {
  const slice = String(opts.sliceLine || "SLICE: Foundation").trim().slice(0, 80);
  const goal = String(opts.goal || "").replace(/\s+/g, " ").trim().slice(0, 800);
  const pages = String(opts.pagesSection || "").trim().slice(0, 1600);
  const constraints = String(opts.constraints || "").trim().slice(0, 800);
  const briefPages = String(opts.uiBriefPageList || "").trim().slice(0, 800);
  const focus = String(opts.sessionFocus || "").trim().slice(0, 400);
  const task = opts.continuation
    ? "CONTINUATION — emit the current slice file blocks now. Do NOT implement every §4 route."
    : "Run the coding pass now. Output ONE coherent slice only (Build → Debug → Next) — not the full app.";
  return [
    slice,
    `Session focus: ${focus || "(next incomplete slice)"}`,
    "",
    "§1 Goal:",
    goal || "(from Master Plan)",
    "",
    "§4 Pages excerpt:",
    pages || "(from Master Plan §4)",
    constraints ? `\n${constraints}` : "",
    "",
    "ui-brief pages:",
    briefPages || "(none parsed)",
    "",
    task,
    "File blocks only: ```file:relative/path``` — no chat prose.",
  ]
    .filter((line) => line !== "")
    .join("\n")
    .slice(0, 4500);
}

const PRODUCT_PREFIX = /^(app|src|pages|components)\//i;

function isDocsOrPublicOnly(paths: string[]): boolean {
  const list = (paths || []).map((p) => p.replace(/\\/g, "/").replace(/^\.\//, ""));
  if (list.length === 0) return false;
  const product = list.filter((p) => PRODUCT_PREFIX.test(p));
  if (product.length > 0) return false;
  return list.every(
    (p) =>
      /^public\//i.test(p) ||
      /\.html$/i.test(p) ||
      /(^|\/)(master-plan|ui-brief|v0-prompt|competitor-research)\.(md|json)$/i.test(p) ||
      /^(nebula-project|nebulla-project|nebula-ui-studio)\//i.test(p),
  );
}

export type FoundationGoExit = {
  ok: boolean;
  warnRunnable: boolean;
  blockedReason: GoBlockedReason | null;
};

/**
 * One Foundation success: files applied, not plan/public-html-only, not zero product routes.
 * Missing runnable skeleton is a warn when routes exist — not “done” for docs-only.
 */
export function assessFoundationGoExit(opts: {
  totalWritten: number;
  writtenPaths: string[];
  sliceLabel?: GoSliceLabel | null;
  runnableRoot?: boolean;
  partialPlanOnly?: boolean;
}): FoundationGoExit {
  const paths = opts.writtenPaths || [];
  const foundationLike = !opts.sliceLabel || /foundation/i.test(String(opts.sliceLabel));
  const depth = assessApplyRouteDepth(paths);

  if (opts.totalWritten <= 0 || paths.length === 0) {
    return {
      ok: false,
      warnRunnable: false,
      blockedReason: goBlocked("GO_EMPTY_OUTPUT"),
    };
  }
  if (opts.partialPlanOnly || isDocsOrPublicOnly(paths)) {
    return {
      ok: false,
      warnRunnable: false,
      blockedReason: goBlocked("APPLY_EMPTY_PRODUCT"),
    };
  }
  if (isStaticHtmlProductApply(paths)) {
    const warnRunnable = foundationLike && opts.runnableRoot === false;
    return { ok: true, warnRunnable, blockedReason: null };
  }
  if (foundationLike && depth.zeroProductRoutes) {
    return {
      ok: false,
      warnRunnable: false,
      blockedReason: goBlocked(
        "APPLY_EMPTY_PRODUCT",
        `Stopped: Foundation wrote ${opts.totalWritten} file(s) but zero app/ or pages/ routes. Not a product shell — retry Go.`,
      ),
    };
  }

  const warnRunnable = foundationLike && opts.runnableRoot === false;
  return { ok: true, warnRunnable, blockedReason: null };
}

/** Short locked constraints from Master Plan for the Go code prompt (not a new doc). */
export function lockedUserConstraintsFromPlan(plan: Record<string, string>): string {
  const goal = String(plan["1. Goal of the app"] || "").replace(/\s+/g, " ").trim();
  const tech = String(plan["2. Tech and Research"] || "").replace(/\s+/g, " ").trim();
  const blob = `${goal}\n${tech}`;
  const lines: string[] = [];
  const roles: string[] = [];
  if (/\b(student|learner|child|kid)/i.test(blob)) roles.push("student/child");
  if (/\bteacher/i.test(blob)) roles.push("teacher");
  if (/\bparent|caregiver/i.test(blob)) roles.push("parent");
  if (roles.length) lines.push(`Roles (do not drop): ${roles.join(", ")}`);
  if (/\b(privacy|coppa|consent|pii|no public profile)/i.test(blob)) {
    lines.push("Privacy: honor brief/plan constraints; no public learner profiles; adult consent when stated.");
  }
  if (/\b(calm|shame|tone|coach|adhd|low visual noise)/i.test(blob)) {
    lines.push("Tone: calm coach, short sessions, low visual noise — do not override with generic gamification.");
  }
  if (/\bhttps?:\/\/\S+/i.test(blob)) {
    lines.push("User-cited research URLs in the plan outrank competitor defaults for privacy/tone/roles.");
  }
  if (lines.length === 0 && goal) {
    lines.push(`Goal lock: ${goal.slice(0, 180)}`);
  }
  if (lines.length === 0) return "";
  return ["USER CONSTRAINTS (rank-1 — do not let competitors override):", ...lines.map((l) => `- ${l}`)].join("\n");
}
