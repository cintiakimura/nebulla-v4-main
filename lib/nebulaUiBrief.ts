/**
 * Primary UI brief from Master Plan (§4 page contracts + §5 tokens).
 * Authority: nebula-project/project-execution-rules.md Rule UI-1.
 * Unlike v0-prompt.md, this is NOT truncated to 8 routes / 1500 chars.
 */
import fs from "fs";
import path from "path";
import { summarizeDesignReferencesForPrompt } from "./nebulaDesignReferences";
import { readWorkspaceContentLocale } from "./contentLocaleWorkspace";
import {
  buildConcreteUiuxSection,
  buildStitchChromeBriefSection,
  inferUiDevice,
  isGenericUiuxBoilerplate,
} from "./uiuxSectionBuilder";

export const UI_BRIEF_REL = "nebula-ui-studio/ui-brief.md";

/** Soft ceiling only — prevent runaway files; never used to drop page contracts. */
export const UI_BRIEF_SOFT_MAX_CHARS = 80_000;

function planField(plan: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = String(plan[k] ?? "").trim();
    if (v) return v;
  }
  return "";
}

function extractProjectType(goal: string): string {
  const m = goal.match(/project\s*type\s*:\s*(web\s*app|mobile\s*app|landing\s*page)/i);
  if (m) {
    const t = m[1].toLowerCase();
    if (t.includes("mobile")) return "Mobile App";
    if (t.includes("landing")) return "Landing Page";
    return "Web App";
  }
  if (/\bmobile\s*app\b/i.test(goal)) return "Mobile App";
  if (/\blanding\s*page\b/i.test(goal)) return "Landing Page";
  if (/\bweb\s*app\b/i.test(goal)) return "Web App";
  return "";
}

function oneLinerFromGoal(goal: string): string {
  const line =
    goal
      .split(/\n/)
      .map((l) => l.trim())
      .find((l) => l && !/project\s*type/i.test(l)) || goal;
  return line.replace(/\s+/g, " ").trim().slice(0, 280) || "App from Master Plan discovery.";
}

/** Pull security-relevant lines from §2 for UI authz / gated nav. */
export function extractSecurityNotesForUi(techResearch: string): string {
  const lines = techResearch.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const keep: string[] = [];
  const hit =
    /\b(security baseline|auth|rls|workspace_id|tenant|deny by default|pii|role|public|private|secret)\b/i;
  for (const l of lines) {
    if (hit.test(l) && !/^no\s+(auth model|rls|pii)\b/i.test(l)) {
      keep.push(l.startsWith("-") ? l : `- ${l}`);
    }
    if (keep.length >= 24) break;
  }
  return keep.join("\n");
}

/**
 * Build a detailed UI brief. Includes full §4 and §5 — no 8-route distill.
 */
export function buildUiBriefMarkdown(
  plan: Record<string, string>,
  workspaceRoot?: string,
  contentLocale?: string,
): string {
  const goal = planField(plan, "1. Goal of the app");
  const tech = planField(
    plan,
    "2. Tech and Research",
    "2. Tech Research",
    "2. Tech & Research",
  );
  const features = planField(plan, "3. Features and KPIs");
  const pages = planField(plan, "4. Pages and navigation");
  const uiux = planField(plan, "5. UI/UX design");
  const projectType = extractProjectType(goal);
  const oneLiner = oneLinerFromGoal(goal);
  const security = extractSecurityNotesForUi(tech);
  const brandRefs =
    workspaceRoot?.trim() ? summarizeDesignReferencesForPrompt(workspaceRoot, 1200) : "";
  const localeFromDisk =
    workspaceRoot?.trim() ? readWorkspaceContentLocale(workspaceRoot) : undefined;
  const copyLocale = (contentLocale || localeFromDisk || "en").trim().toLowerCase() || "en";

  const deviceLine =
    projectType === "Mobile App"
      ? "Target device: **mobile app** (phone-first, touch targets ~44px, tab/bottom nav when appropriate)."
      : projectType === "Landing Page"
        ? "Target device: **marketing landing page** (hero-first, single scroll, strong CTA)."
        : "Target device: **web app** (desktop + responsive; app shell / sidebar or top nav per §5).";

  const device = inferUiDevice(goal, pages, tech);
  const concreteTokens =
    !uiux || isGenericUiuxBoilerplate(uiux)
      ? buildConcreteUiuxSection({
          goal,
          pages,
          tech,
          projectName: oneLiner.slice(0, 48),
        })
      : uiux;

  const parts = [
    "# Nebula UI Brief (primary)",
    "",
    "> Generated from Master Plan §4 (full page contracts) + §5 (visual tokens).",
    "> This file is the **primary** input for UI Gen Beta / Studio. `v0-prompt.md` is optional legacy only.",
    "",
    "## App",
    "",
    `- **One-liner:** ${oneLiner}`,
    ...(projectType ? [`- **Project type:** ${projectType}`] : []),
    `- **CONTENT_LOCALE:** ${copyLocale}`,
    "",
    deviceLine,
    "",
    "## Goal (§1)",
    "",
    goal || "(missing — complete Master Plan §1)",
    "",
    "## Features to surface in UI (§3)",
    "",
    features || "(missing — complete Master Plan §3)",
    "",
    "## Design tokens (§5)",
    "",
    concreteTokens,
    "",
    buildStitchChromeBriefSection(device),
    "## Pages and navigation (§4 — full contracts)",
    "",
    "For **every** page below, implement: purpose, primary_actions, data_entities, authz, empty_state, error_state, nav_links.",
    "",
    pages ||
      "(missing — complete Master Plan §4 with routes and page fields)",
    "",
  ];

  if (security) {
    parts.push(
      "## Security & authz (affects UI)",
      "",
      "Honor these in nav visibility, gated actions, and empty/forbidden states:",
      "",
      security,
      "",
    );
  }

  if (brandRefs) {
    parts.push("## Brand / design references", "", brandRefs, "");
  }

  if (tech) {
    parts.push(
      "## Research patterns (§2 — UI-relevant)",
      "",
      tech.length > 4000 ? `${tech.slice(0, 4000).trim()}\n… (truncated; see Master Plan §2)` : tech,
      "",
    );
  }

  parts.push(
    "## Output requirements",
    "",
    "- Implement **all** §4 routes in the brief (not a truncated 8-route subset).",
    "- Match §5 tokens exactly when present (palette, type, density, radius, motion, components).",
    "- Working navigation between listed routes; real labels from page purposes/actions — no lorem-only shells.",
    "- Respect authz: hide or disable actions the role cannot perform; clear empty and error states.",
    "- Stack default: React + Tailwind + shadcn/ui + Lucide unless Master Plan specifies otherwise.",
    "- **Never** copy Nebulla IDE chrome (#080A14 / #00D4D4 / builder sidebar).",
    "",
  );

  let text = parts.join("\n").trim() + "\n";
  if (text.length > UI_BRIEF_SOFT_MAX_CHARS) {
    text =
      text.slice(0, UI_BRIEF_SOFT_MAX_CHARS - 80).trim() +
      "\n\n… (ui-brief soft-capped; see master-plan.json for full text)\n";
  }
  return text;
}

export function readUiBriefMarkdown(workspaceRoot: string): string {
  const abs = path.join(workspaceRoot, UI_BRIEF_REL);
  if (!fs.existsSync(abs)) return "";
  try {
    return fs.readFileSync(abs, "utf8").trim();
  } catch {
    return "";
  }
}

export function writeUiBriefMarkdown(
  workspaceRoot: string,
  plan: Record<string, string>,
  contentLocale?: string,
): { written: boolean; content: string; path: string } {
  const content = buildUiBriefMarkdown(plan, workspaceRoot, contentLocale);
  const abs = path.join(workspaceRoot, UI_BRIEF_REL);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, "utf8");
  return { written: true, content, path: UI_BRIEF_REL };
}

/** Parse page blocks from a ui-brief (### Name `/route` or ## under Pages section). */
export function parsePagesFromUiBrief(brief: string): { name: string; route: string; body: string }[] {
  if (!brief.trim()) return [];
  const pagesIdx = brief.search(/##\s*Pages and navigation/i);
  const slice = pagesIdx >= 0 ? brief.slice(pagesIdx) : brief;
  const endIdx = slice.search(/\n##\s+(?!Pages)[A-Z]/);
  const pagesBlock = endIdx > 0 ? slice.slice(0, endIdx) : slice;

  const pages: { name: string; route: string; body: string }[] = [];
  const headingRe =
    /^###\s+(.+?)(?:\s+`(\/[^`]+)`|\s+\((`?\/[^)`]+)`?\))?\s*$/gm;
  const matches = [...pagesBlock.matchAll(headingRe)];
  if (matches.length === 0) {
    // Fallback: bullet lines with routes
    for (const line of pagesBlock.split("\n")) {
      const m = line.match(/^[-*•]\s+\*?\*?(.+?)\*?\*?\s*(?:\(|`)?(\/[\w\-./:{}\*]*)/);
      if (m) {
        pages.push({
          name: m[1].replace(/\*\*/g, "").trim(),
          route: m[2],
          body: line.trim(),
        });
      }
    }
    return pages;
  }

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]!;
    const start = m.index ?? 0;
    const end = i + 1 < matches.length ? (matches[i + 1]!.index ?? pagesBlock.length) : pagesBlock.length;
    const chunk = pagesBlock.slice(start, end).trim();
    const name = (m[1] || "").replace(/\*\*/g, "").trim();
    let route = (m[2] || m[3] || "").replace(/`/g, "").trim();
    // Heading without `/route` — recover from body, else skip (empty routes break merge/UI Gen).
    if (!route.startsWith("/")) {
      const fromBody =
        chunk.match(/`(\/[^`\s]+)`/) ||
        chunk.match(/(?:^|[\s(])(\/[A-Za-z0-9_][\w\-./:{}\*]*)/);
      route = (fromBody?.[1] || "").trim();
    }
    if (!name || !route.startsWith("/")) continue;
    pages.push({ name, route, body: chunk });
  }
  return pages;
}

/** Extract ## Design tokens section body from ui-brief. */
export function extractDesignTokensFromUiBrief(brief: string): string {
  const m = brief.match(/##\s*Design tokens[\s\S]*?(?=\n##\s+[A-Z]|$)/i);
  if (!m) return "";
  return m[0]
    .replace(/^##\s*Design tokens[^\n]*\n+/i, "")
    .trim();
}
