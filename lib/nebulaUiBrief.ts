/**
 * Primary UI brief from Master Plan (§4 page contracts + §5 tokens).
 * Authority: nebula-project/project-execution-rules.md Rule UI-1.
 * Unlike v0-prompt.md, this is NOT truncated to 8 routes / 1500 chars.
 */
import fs from "fs";
import path from "path";
import { summarizeDesignReferencesForPrompt } from "./nebulaDesignReferences";
import { readWorkspaceContentLocale } from "./contentLocaleWorkspace";
import { readResearchArtifact } from "./researchArtifact";
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
  const researchNotes =
    workspaceRoot?.trim() ? readResearchArtifact(workspaceRoot).trim() : "";
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
    "> Generated from Master Plan §4 (full page contracts) + §5 (visual tokens) + Gate R research.",
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
    resolvePagesMarkdown(pages, goal),
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

  if (researchNotes) {
    const clipped =
      researchNotes.length > 5000
        ? `${researchNotes.slice(0, 5000).trim()}\n… (see nebula-project/competitor-research.md)`
        : researchNotes;
    parts.push(
      "## Research-backed UI (Gate R)",
      "",
      "Use competitor-informed labels, ranked features, and observed UI/UX patterns — do not invent a generic empty feature set.",
      "",
      clipped,
      "",
    );
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

export function extractNamedRoutesFromPagesText(text: string): { name: string; route: string }[] {
  const out: { name: string; route: string }[] = [];
  const seen = new Set<string>();
  const add = (name: string, route: string) => {
    const r = route.replace(/`/g, "").trim();
    if (!r.startsWith("/")) return;
    const key = r.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const n =
      name.replace(/\*\*/g, "").replace(/[()]/g, "").replace(/`/g, "").trim() ||
      (r === "/" ? "Home" : r.replace(/^\//, "").replace(/[-_]/g, " "));
    if (!n) return;
    out.push({ name: n.split(/\s+/).slice(0, 6).join(" "), route: r });
  };
  for (const line of String(text || "").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) {
      const heading = t.match(/^#{2,4}\s+(.+?)(?:\s+`(\/[^`]*)`|\s+\((`?\/[^)`]*)`?\))?\s*$/);
      if (heading) {
        const route = (heading[2] || heading[3] || "").replace(/`/g, "").trim();
        add(heading[1], route);
      }
      continue;
    }
    const bt = t.match(/`(\/[^`]*)`/) || t.match(/\((\/[^)]*)\)/);
    if (!bt?.[1]?.startsWith("/")) continue;
    const name = t
      .replace(/^[-*•]\s+/, "")
      .replace(/^\d+[.)]\s+/, "")
      .replace(/`\/[^`]+`/g, "")
      .replace(/[()]/g, "")
      .replace(/\*\*/g, "")
      .replace(/\s+/g, " ")
      .trim();
    add(name, bt[1]);
  }
  return out;
}

/** Safe defaults so Gate A can auto-build a brief when §4 has no routes yet. */
export function seedPagesFromGoal(goal: string): { name: string; route: string }[] {
  const g = String(goal || "");
  if (/\b(adhd|kids?|child|student|teacher|tutor|classroom|school|parent)\b/i.test(g)) {
    return [
      { name: "Home", route: "/" },
      { name: "Practice", route: "/practice" },
      { name: "Teacher", route: "/teacher" },
      { name: "Progress", route: "/progress" },
    ];
  }
  if (/\b(shop|store|cart|checkout|ecommerce)\b/i.test(g)) {
    return [
      { name: "Home", route: "/" },
      { name: "Catalog", route: "/catalog" },
      { name: "Cart", route: "/cart" },
      { name: "Account", route: "/account" },
    ];
  }
  return [
    { name: "Home", route: "/" },
    { name: "Dashboard", route: "/dashboard" },
    { name: "Settings", route: "/settings" },
  ];
}

export function formatPageContractsMarkdown(
  pages: { name: string; route: string }[],
  goal?: string,
): string {
  const purposeHint = String(goal || "").replace(/\s+/g, " ").trim().slice(0, 120);
  return pages
    .map((p) => {
      const purpose =
        p.route === "/"
          ? purposeHint || "Primary landing — one clear next action"
          : `Screen for ${p.name.toLowerCase()}`;
      return [
        `### ${p.name} \`${p.route}\``,
        "",
        `- Purpose: ${purpose}`,
        `- Primary actions: Continue, back to Home`,
        `- Data entities: session, ${p.name.toLowerCase()}`,
        `- Authz: ${/teacher|parent|account|settings|progress/i.test(p.name) ? "signed-in adult" : "signed-in learner or public"}`,
        `- Empty state: Nothing here yet — start from Home`,
        `- Error state: Could not load — try again`,
        `- Nav links: \`/\`, ${pages
          .filter((x) => x.route !== p.route)
          .slice(0, 3)
          .map((x) => `\`${x.route}\``)
          .join(", ")}`,
      ].join("\n");
    })
    .join("\n\n");
}

export function pagesTextHasParseableRoutes(text: string): boolean {
  return parsePagesFromUiBrief(`## Pages and navigation\n\n${String(text || "")}`).length > 0;
}

/** If §4 has no parseable routes, emit ### contracts so Gate A / UI Gen can proceed. */
export function resolvePagesMarkdown(pagesSection: string, goal: string): string {
  const pages = String(pagesSection || "").trim();
  if (pagesTextHasParseableRoutes(pages)) return pages;
  const extracted = extractNamedRoutesFromPagesText(pages);
  const seeded = extracted.length > 0 ? extracted : seedPagesFromGoal(goal);
  return formatPageContractsMarkdown(seeded, goal);
}

export function parsePagesFromUiBrief(brief: string): { name: string; route: string; body: string }[] {
  if (!brief.trim()) return [];
  const pagesIdx = brief.search(/##\s*Pages and navigation/i);
  const slice = pagesIdx >= 0 ? brief.slice(pagesIdx) : brief;
  const endIdx = slice.search(/\n##\s+(?!Pages)[A-Z]/);
  const pagesBlock = endIdx > 0 ? slice.slice(0, endIdx) : slice;

  const pages: { name: string; route: string; body: string }[] = [];
  const headingRe =
    /^###\s+(.+?)(?:\s+`(\/[^`]*)`|\s+\((`?\/[^)`]*)`?\))?\s*$/gm;
  const matches = [...pagesBlock.matchAll(headingRe)];
  if (matches.length === 0) {
    // Fallback: bullets / lines with `/route` in backticks or parens (incl. (`/`) )
    for (const extracted of extractNamedRoutesFromPagesText(pagesBlock)) {
      pages.push({
        name: extracted.name,
        route: extracted.route,
        body: `${extracted.name} ${extracted.route}`,
      });
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
        chunk.match(/`(\/[^`]*)`/) ||
        chunk.match(/\((\/[^)]*)\)/) ||
        chunk.match(/(?:^|[\s(])(\/(?:[A-Za-z0-9_][\w\-./:{}\*]*)?)/);
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
