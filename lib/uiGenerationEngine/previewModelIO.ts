/**
 * Authoritative UI Studio Beta preview model written by the generation engine.
 * Prefer this over Cosmic Night / Nebulla Workspace placeholder shells.
 */

import fs from "fs";
import path from "path";
import { visualEditorPreviewAbs } from "../visualUiEditorWorkspace";

export const ENGINE_PREVIEW_MODEL_REL = path.join(
  "nebulla-project",
  "ui-generation-preview-model.json",
);

export function enginePreviewModelAbs(workspaceRoot: string): string {
  return path.join(workspaceRoot, ENGINE_PREVIEW_MODEL_REL);
}

export type EnginePreviewPages = {
  pages: Record<string, unknown>;
};

/** True if model is the old Nebulla IDE Cosmic Night demo shell — never treat as app UI. */
export function isNebullaIdePlaceholderShell(model: unknown): boolean {
  if (!model || typeof model !== "object") return false;
  const text = JSON.stringify(model);
  if (/Nebulla Workspace|Cosmic Night|0vgenerated-v2|inspired by 0vgenerated|Open Explorer/i.test(text)) {
    return true;
  }
  if (/#080A14/i.test(text) && /#00D4D4/i.test(text)) return true;
  return false;
}

function readJsonModel(abs: string): EnginePreviewPages | null {
  try {
    if (!fs.existsSync(abs)) return null;
    const parsed = JSON.parse(fs.readFileSync(abs, "utf8")) as EnginePreviewPages;
    if (!parsed || typeof parsed !== "object" || !parsed.pages || typeof parsed.pages !== "object") {
      return null;
    }
    if (Object.keys(parsed.pages).length === 0) return null;
    if (isNebullaIdePlaceholderShell(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeEnginePreviewModel(workspaceRoot: string, model: EnginePreviewPages): void {
  const abs = enginePreviewModelAbs(workspaceRoot);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(model, null, 2), "utf8");
}

/**
 * Load Beta preview in priority order:
 * 1) nebulla-project/ui-generation-preview-model.json (engine)
 * 2) generated-ui/visual-editor/preview-model.json (if not placeholder)
 */
export function readEnginePreviewModel(workspaceRoot: string): {
  model: EnginePreviewPages | null;
  source: "engine" | "visual-editor" | "none";
} {
  const fromEngine = readJsonModel(enginePreviewModelAbs(workspaceRoot));
  if (fromEngine) return { model: fromEngine, source: "engine" };

  const fromVisual = readJsonModel(visualEditorPreviewAbs(workspaceRoot));
  if (fromVisual) return { model: fromVisual, source: "visual-editor" };

  return { model: null, source: "none" };
}
