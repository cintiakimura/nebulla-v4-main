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

const HEX6 = /^#[0-9a-fA-F]{6}$/;

function sanitizeColorValue(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const s = raw.trim();
  if (!s || /^transparent$/i.test(s) || /^none$/i.test(s)) return fallback;
  if (HEX6.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toLowerCase();
  }
  if (/^#[0-9a-fA-F]{8}$/.test(s)) return `#${s.slice(1, 7)}`.toLowerCase();
  const m = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) {
    const h = (n: string) => Number(n).toString(16).padStart(2, "0");
    return `#${h(m[1])}${h(m[2])}${h(m[3])}`;
  }
  return fallback;
}

/**
 * Ensure style colors are valid `#rrggbb` — never `"transparent"` (breaks `<input type="color">`).
 * Transparent backgrounds become solid `#FFFFFF` (CSS opacity remains available on the node).
 */
export function sanitizeEditorModelColors<T>(model: T): T {
  if (!model || typeof model !== "object") return model;
  try {
    const cloned = JSON.parse(JSON.stringify(model)) as {
      pages?: Record<string, { nodes?: Record<string, { style?: Record<string, unknown> }> }>;
    };
    if (!cloned.pages) return model;
    for (const page of Object.values(cloned.pages)) {
      if (!page?.nodes) continue;
      for (const node of Object.values(page.nodes)) {
        if (!node?.style || typeof node.style !== "object") continue;
        const st = node.style;
        if ("backgroundColor" in st) {
          st.backgroundColor = sanitizeColorValue(st.backgroundColor, "#FFFFFF");
        }
        if ("color" in st) {
          st.color = sanitizeColorValue(st.color, "#171717");
        }
        if ("borderColor" in st) {
          st.borderColor = sanitizeColorValue(st.borderColor, "#E5E5E5");
        }
      }
    }
    return cloned as T;
  } catch {
    return model;
  }
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
    return sanitizeEditorModelColors(parsed);
  } catch {
    return null;
  }
}

export function writeEnginePreviewModel(workspaceRoot: string, model: EnginePreviewPages): void {
  const abs = enginePreviewModelAbs(workspaceRoot);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const clean = sanitizeEditorModelColors(model);
  fs.writeFileSync(abs, JSON.stringify(clean, null, 2), "utf8");
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
