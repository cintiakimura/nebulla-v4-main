import fs from "fs";
import path from "path";
import {
  relPosix,
  resolveOriginalV0FolderRel,
  versionTimestampFolder,
  type V0BaseManifest,
} from "./visualUiEditorWorkspace";
import { summarizeDesignReferencesForPrompt } from "./nebulaDesignReferences";

export const V0_PROMPT_REL = "nebula-ui-studio/v0-prompt.md";
export const V0_ORIGINAL_CANONICAL_ROOT = "nebula-ui-studio/v0-original";

const META_SKIP = new Set([
  "manifest.json",
  "README.txt",
  "snapshot-manifest.json",
  "version-manifest.json",
]);

/** Hard cap sent to v0-pro (long prompts timeout on Render and cost more). */
export const V0_PROMPT_MAX_CHARS = 1500;
const V0_PAGES_MAX_CHARS = 650;
const V0_UIUX_MAX_CHARS = 450;

function truncateForV0(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 48)).trim()}… (see Master Plan for full detail)`;
}

/** Prefer route lines from §4; cap at 8 entries for first v0 pass. */
function summarizePagesForV0(pagesNav: string): string {
  const raw = pagesNav.trim();
  if (!raw) return "(Home `/` + Dashboard `/dashboard` — infer from project name.)";

  const routeLines: string[] = [];
  for (const line of raw.split(/\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/`\/[^`]+`/.test(trimmed) || /(?:^|\s)\/[a-z0-9][\w-]*/i.test(trimmed)) {
      routeLines.push(trimmed.replace(/^[-*•]\s*/, "").slice(0, 140));
    }
  }

  if (routeLines.length === 0) {
    return truncateForV0(raw, V0_PAGES_MAX_CHARS);
  }

  const limited = routeLines.slice(0, 8);
  if (routeLines.length > 8) {
    limited.push(`(+ ${routeLines.length - 8} more routes in Master Plan §4)`);
  }
  return limited.map((l) => `- ${l}`).join("\n");
}

/** Keep palette, typography, layout bullets — not full §5 essays. */
function summarizeUiUxForV0(uiUx: string): string {
  const raw = uiUx.trim();
  if (!raw) {
    return "- shadcn/ui + Tailwind; accessible contrast; clear hierarchy; responsive nav";
  }

  const bullets: string[] = [];
  for (const line of raw.split(/\n/)) {
    const trimmed = line.trim().replace(/^[-*•#]+\s*/, "");
    if (!trimmed || trimmed.length > 200) continue;
    bullets.push(trimmed.slice(0, 120));
    if (bullets.join("\n").length >= V0_UIUX_MAX_CHARS - 40) break;
  }

  const body =
    bullets.length > 0
      ? bullets.slice(0, 12).map((b) => `- ${b}`).join("\n")
      : truncateForV0(raw, V0_UIUX_MAX_CHARS);
  return truncateForV0(body, V0_UIUX_MAX_CHARS);
}

function extractProjectTypeForV0(goal: string): string {
  const labeled = goal.match(/project\s*type\s*[:\-–—]\s*(web\s*app|mobile\s*app|landing\s*page)/i);
  if (labeled?.[1]) {
    const n = labeled[1].toLowerCase().replace(/\s+/g, " ").trim();
    if (n === "web app") return "Web App";
    if (n === "mobile app") return "Mobile App";
    if (n === "landing page") return "Landing Page";
  }
  if (/\bmobile\s*app\b/i.test(goal)) return "Mobile App";
  if (/\blanding\s*page\b/i.test(goal)) return "Landing Page";
  if (/\bweb\s*app\b/i.test(goal)) return "Web App";
  return "";
}

/** Competitor / pattern one-liners from §2 for v0 (not full research dump). */
function summarizeResearchForV0(research: string): string {
  const raw = research.trim();
  if (!raw) return "";
  const lines = raw
    .split(/\n/)
    .map((l) => l.trim().replace(/^[-*•#]+\s*/, ""))
    .filter((l) => l.length > 8 && l.length < 160)
    .filter((l) => /competitor|pattern|nav|ui|ux|inspired|similar|like\b/i.test(l));
  const picked = (lines.length > 0 ? lines : raw.split(/\n/).map((l) => l.trim()).filter(Boolean)).slice(0, 4);
  return truncateForV0(picked.map((l) => `- ${l.slice(0, 120)}`).join("\n"), 220);
}

/** Build a concise v0 brief from Master Plan §4 + §5 (never paste full sections). */
export function buildV0PromptMarkdown(
  plan: Record<string, string>,
  workspaceRoot?: string,
): string {
  const pagesNav = String(plan["4. Pages and navigation"] ?? "").trim();
  const uiUx = String(plan["5. UI/UX design"] ?? "").trim();
  const research = String(
    plan["2. Tech and Research"] ?? plan["2. Text & Search"] ?? plan["2. Tech Research"] ?? "",
  ).trim();
  const goal = String(plan["1. Goal of the app"] ?? "").trim();
  const projectType = extractProjectTypeForV0(goal);
  const oneLiner = goal
    ? truncateForV0(goal.split(/\n/).find((l) => l.trim() && !/project\s*type/i.test(l)) ?? goal, 160)
    : "App from Master Plan discovery.";

  const brandRefs =
    workspaceRoot?.trim() ? summarizeDesignReferencesForPrompt(workspaceRoot, 380) : "";

  const deviceLine =
    projectType === "Mobile App"
      ? "- Target: **mobile app** UI (phone-first layouts, touch targets, bottom/tab nav where appropriate)"
      : projectType === "Landing Page"
        ? "- Target: **marketing landing page** (hero-first, single scroll story, strong CTA)"
        : "- Target: **web app** (desktop + responsive; app shell / sidebar or top nav as §5 specifies)";

  const researchLines = summarizeResearchForV0(research);

  let text = [
    "# v0 UI pass (concise)",
    "",
    `App: ${oneLiner}`,
    ...(projectType ? [`Project type: ${projectType}`] : []),
    "",
    "## Pages (first pass — max 8 routes)",
    summarizePagesForV0(pagesNav),
    "",
    "## Visual system",
    summarizeUiUxForV0(uiUx),
    ...(brandRefs
      ? ["", "## Brand / design references (match logo & palette when provided)", brandRefs]
      : []),
    ...(researchLines
      ? ["", "## Research-grounded patterns (§2)", researchLines]
      : []),
    "",
    "## Output",
    deviceLine,
    "- React + Tailwind + shadcn/ui under `app/` or `src/`",
    "- Working nav between routes above; production spacing/typography",
    "- Match §5 palette and competitor UI patterns — **never** Nebulla IDE chrome (#080A14 / #00D4D4)",
    "- No lorem-only shells; real labels from §4 page purposes",
  ].join("\n");

  if (text.length > V0_PROMPT_MAX_CHARS) {
    text = truncateForV0(text, V0_PROMPT_MAX_CHARS);
  }
  return text;
}

/** Clamp any on-disk v0 prompt before sending to the v0 API. */
export function clampV0PromptForApi(text: string): string {
  const t = text.trim();
  if (!t) return t;
  if (t.length <= V0_PROMPT_MAX_CHARS) return t;
  return truncateForV0(t, V0_PROMPT_MAX_CHARS);
}

export function readV0PromptMarkdown(workspaceRoot: string): string {
  const abs = path.join(workspaceRoot, V0_PROMPT_REL);
  if (!fs.existsSync(abs)) return "";
  try {
    return fs.readFileSync(abs, "utf8").trim();
  } catch {
    return "";
  }
}

export function writeV0PromptMarkdown(
  workspaceRoot: string,
  plan: Record<string, string>
): { written: boolean; content: string } {
  const content = buildV0PromptMarkdown(plan, workspaceRoot);
  const abs = path.join(workspaceRoot, V0_PROMPT_REL);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, "utf8");
  return { written: true, content };
}

function countBundleFiles(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith(".")) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      n += countBundleFiles(full);
      continue;
    }
    if (META_SKIP.has(ent.name)) continue;
    n += 1;
  }
  return n;
}

/** True when a real v0 API pass completed (not Grok-coding placeholder unlock). */
export function hasRealV0ApiGeneration(workspaceRoot: string): boolean {
  const orig = resolveOriginalV0FolderRel(workspaceRoot);
  if (!orig) return false;
  const absRoot = path.join(workspaceRoot, orig);
  const manifestPath = path.join(absRoot, "manifest.json");
  if (fs.existsSync(manifestPath)) {
    try {
      const j = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as V0BaseManifest & {
        source?: string;
      };
      if (j.v0FirstGenerationComplete && j.source === "v0-api") return true;
      if (j.source === "grok-coding") return false;
    } catch {
      /* */
    }
  }
  return countBundleFiles(absRoot) >= 2;
}

/** Docs path: `nebula-ui-studio/v0-original/<timestamp>/` (immutable copy). */
export function saveCanonicalV0OriginalCopy(
  workspaceRoot: string,
  files: Record<string, string>
): string {
  const ts = versionTimestampFolder();
  const relDir = relPosix(path.join(V0_ORIGINAL_CANONICAL_ROOT, ts));
  const absDir = path.join(workspaceRoot, relDir);
  fs.mkdirSync(absDir, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const safeRel = rel.replace(/^(\.\/)+/, "").replace(/\.\./g, "");
    if (!safeRel || META_SKIP.has(path.basename(safeRel))) continue;
    const dest = path.join(absDir, safeRel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content, "utf8");
  }
  fs.writeFileSync(
    path.join(absDir, "manifest.json"),
    JSON.stringify(
      {
        v0FirstGenerationComplete: true,
        completedAt: new Date().toISOString(),
        source: "v0-api",
        notes: "Canonical copy under nebula-ui-studio/v0-original/",
      },
      null,
      2
    ),
    "utf8"
  );
  return relDir;
}
