import fs from "fs";
import path from "path";
import {
  relPosix,
  resolveOriginalV0FolderRel,
  versionTimestampFolder,
  type V0BaseManifest,
} from "./visualUiEditorWorkspace";

export const V0_PROMPT_REL = "nebula-ui-studio/v0-prompt.md";
export const V0_ORIGINAL_CANONICAL_ROOT = "nebula-ui-studio/v0-original";

const META_SKIP = new Set([
  "manifest.json",
  "README.txt",
  "snapshot-manifest.json",
  "version-manifest.json",
]);

/** Build the canonical v0 brief from Master Plan §4 + §5. */
export function buildV0PromptMarkdown(plan: Record<string, string>): string {
  const pagesNav = String(plan["4. Pages and navigation"] ?? "").trim();
  const uiUx = String(plan["5. UI/UX design"] ?? "").trim();
  return [
    "# Nebula v0 generation prompt",
    "",
    "Generated from Master Plan §4 (Pages and navigation) + §5 (UI/UX design).",
    "",
    "## Pages and navigation",
    pagesNav || "(Infer a minimal home + dashboard from the project name and routes.)",
    "",
    "## UI/UX design",
    uiUx ||
      "(Use a calm, professional default: shadcn/ui, Tailwind CSS, accessible contrast, clear hierarchy.)",
    "",
    "## Output requirements",
    "- React + Tailwind CSS + shadcn/ui",
    "- Cover every page listed above",
    "- Output under `app/` or `src/` with working navigation between routes",
    "- Production-ready layout, spacing, and typography — no placeholder lorem-only shells",
  ].join("\n");
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
  const content = buildV0PromptMarkdown(plan);
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
