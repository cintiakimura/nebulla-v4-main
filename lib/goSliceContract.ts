/**
 * Go slice contract — one coherent slice per Go.
 * Authority: nebulla-project/incremental-development.md
 */

import fs from "fs";
import path from "path";

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

function countSrcPages(workspaceRoot: string): number {
  const dir = path.join(workspaceRoot, "src", "pages");
  if (!fs.existsSync(dir)) return 0;
  try {
    return fs.readdirSync(dir).filter((f) => /\.(tsx|jsx|ts|js)$/i.test(f)).length;
  } catch {
    return 0;
  }
}

/** Heuristic next slice from on-disk app shell (no LLM). */
export function inferGoSliceFromWorkspace(workspaceRoot: string): GoSliceLabel {
  const root = workspaceRoot.trim();
  if (!root) return "Foundation";
  const hasShell =
    workspaceExists(root, "app", "layout.tsx") ||
    workspaceExists(root, "app", "page.tsx") ||
    workspaceExists(root, "src", "App.tsx") ||
    workspaceExists(root, "src", "main.tsx") ||
    workspaceExists(root, "index.html");
  if (!hasShell) return "Foundation";

  const hasAuth =
    workspaceExists(root, "lib", "auth.ts") ||
    workspaceExists(root, "src", "lib", "auth.ts") ||
    workspaceExists(root, "src", "pages", "Login.tsx");
  if (!hasAuth) return "Auth";

  const pageCount = countSrcPages(root);
  const hasPrimary =
    pageCount >= 2 ||
    workspaceExists(root, "src", "pages", "ChildSession.tsx") ||
    workspaceExists(root, "src", "pages", "ParentDashboard.tsx") ||
    workspaceExists(root, "app", "dashboard", "page.tsx");
  if (!hasPrimary) return "Primary";

  return "Secondary";
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
  const slice =
    fromNote ||
    (!opts.userNote?.trim() || isBareGoNote(opts.userNote) ? fromExisting : null) ||
    inferGoSliceFromWorkspace(opts.workspaceRoot);
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
    "- Risks: inventing Supabase/Firebase unless §2 names the vendor; oversized multi-route dump",
  ];
  return lines.join("\n").slice(0, 1200);
}

/** Prefer local summary for bare Go (or reuse existing SLICE when note is bare). */
export function shouldSkipPhaseALlm(opts: {
  userNote?: string;
  existingSummary?: string;
}): boolean {
  if (!isBareGoNote(opts.userNote)) return false;
  return true;
}
