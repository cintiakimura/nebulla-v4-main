import fs from "fs";
import path from "path";
import { clearGoCodeLastResult, clearGoCodePending } from "./nebulaGoCodePending";
import { clearV0Pending } from "./nebulaV0Pending";
import { clearDesignReferences } from "./nebulaDesignReferences";
import { readEditorState, writeEditorState } from "./visualUiEditorWorkspace";
import { V0_PROMPT_REL } from "./nebulaUiStudioPipeline";

const SCRATCH_REMOVE_DIRS = [
  "app",
  "src",
  "pages",
  "components",
  "public",
  "generated-ui",
  "nebula-ui-studio/v0-original",
  "nebulla-sysh-ui-sysh-studio",
  ".next",
  "node_modules",
  "dist",
];

const SCRATCH_REMOVE_FILES = [
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "tsconfig.json",
  "next.config.js",
  "next.config.mjs",
  "next.config.ts",
  "vite.config.ts",
  "index.html",
];

function copyIfMissing(src: string, dest: string) {
  if (fs.existsSync(dest)) return;
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

/** Stop stale v0 / Go poll loops from resurrecting old sessions. */
export function cancelProjectBackgroundAttempts(workspaceRoot: string): string[] {
  const cleared: string[] = [];
  clearV0Pending(workspaceRoot);
  cleared.push("nebulla-ide/v0-pending.json");
  clearGoCodePending(workspaceRoot);
  cleared.push("nebulla-ide/go-code-pending.json");
  clearGoCodeLastResult(workspaceRoot);
  cleared.push("nebulla-ide/go-code-last-result.json");

  try {
    const st = readEditorState(workspaceRoot);
    writeEditorState(workspaceRoot, {
      ...st,
      v0DemoUrl: undefined,
      v0ChatId: undefined,
      workspaceCodingDetected: false,
      updatedAt: new Date().toISOString(),
    });
    cleared.push("generated-ui/editor-state.json (v0 session cleared)");
  } catch {
    /* ignore */
  }
  return cleared;
}

/** Wipe user-generated app output and pending jobs; re-seed project templates. */
export function resetProjectWorkspaceScratch(opts: {
  workspaceRoot: string;
  templateRoot: string;
  projectDisplayName?: string;
}): { removed: string[]; cleared: string[] } {
  const { workspaceRoot, templateRoot } = opts;
  const cleared = cancelProjectBackgroundAttempts(workspaceRoot);
  clearDesignReferences(workspaceRoot);
  cleared.push("nebulla-ide/design-references.json");

  const removed: string[] = [];
  for (const rel of SCRATCH_REMOVE_DIRS) {
    const full = path.join(workspaceRoot, rel);
    if (fs.existsSync(full)) {
      fs.rmSync(full, { recursive: true, force: true });
      removed.push(rel);
    }
  }
  for (const rel of SCRATCH_REMOVE_FILES) {
    const full = path.join(workspaceRoot, rel);
    if (fs.existsSync(full)) {
      fs.unlinkSync(full);
      removed.push(rel);
    }
  }

  const v0PromptAbs = path.join(workspaceRoot, V0_PROMPT_REL);
  if (fs.existsSync(v0PromptAbs)) {
    fs.unlinkSync(v0PromptAbs);
    removed.push(V0_PROMPT_REL);
  }

  const templateMp = path.join(templateRoot, "master-plan.json");
  const mpDest = path.join(workspaceRoot, "master-plan.json");
  if (fs.existsSync(templateMp)) {
    fs.copyFileSync(templateMp, mpDest);
    removed.push("master-plan.json (reset from template)");
  } else {
    fs.writeFileSync(mpDest, "{}", "utf8");
    removed.push("master-plan.json (cleared)");
  }

  const templateStudio = path.join(templateRoot, "nebula-ui-studio.md");
  const studioDest = path.join(workspaceRoot, "nebula-ui-studio.md");
  if (fs.existsSync(templateStudio)) {
    fs.copyFileSync(templateStudio, studioDest);
    removed.push("nebula-ui-studio.md (reset from template)");
  }

  copyIfMissing(path.join(templateRoot, "project-workflow.md"), path.join(workspaceRoot, "project-workflow.md"));
  copyIfMissing(
    path.join(templateRoot, "project-execution-rules.md"),
    path.join(workspaceRoot, "project-execution-rules.md"),
  );

  const mindMapPath = path.join(workspaceRoot, "nebulla-ide", "mind-map.json");
  fs.mkdirSync(path.dirname(mindMapPath), { recursive: true });
  fs.writeFileSync(mindMapPath, JSON.stringify({ pages: [], edges: [] }, null, 2), "utf8");
  removed.push("nebulla-ide/mind-map.json (reset)");

  return { removed, cleared };
}
