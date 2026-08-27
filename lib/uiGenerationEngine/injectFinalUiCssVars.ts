/**
 * Smallest coded-app restyle: inject §5 / Final UI tokens as CSS variables.
 * Never rewrites page logic. Only touches Nebulla-generated globals.css-style files.
 */
import fs from "fs";
import path from "path";
import type { DesignTokens } from "./v2/types";
import { scheduleWorkspaceAbsR2Sync } from "../nebulaWorkspaceStorage";

export const FINAL_UI_CSS_START = "/* nebulla-final-ui-tokens */";
export const FINAL_UI_CSS_END = "/* /nebulla-final-ui-tokens */";

const CANDIDATES = [
  "app/globals.css",
  "src/app/globals.css",
  "src/index.css",
  "app/global.css",
  "styles/globals.css",
];

function looksLikeNebullaGlobals(text: string): boolean {
  if (text.includes(FINAL_UI_CSS_START)) return true;
  return /@tailwind|tailwindcss|:root\s*\{/.test(text);
}

function tokenBlock(tokens: DesignTokens): string {
  return `${FINAL_UI_CSS_START}
:root {
  --nebulla-bg: ${tokens.bg};
  --nebulla-surface: ${tokens.surface};
  --nebulla-primary: ${tokens.primary};
  --nebulla-accent: ${tokens.accent};
  --nebulla-text: ${tokens.text};
  --nebulla-muted: ${tokens.mutedText};
  --nebulla-border: ${tokens.border};
  --nebulla-radius: ${Math.max(4, tokens.radius)}px;
}
body {
  background: var(--nebulla-bg, inherit);
  color: var(--nebulla-text, inherit);
}
${FINAL_UI_CSS_END}
`;
}

const PRODUCT_PREVIEW_REL = "public/product-preview/index.html";

/** Restyle the clickable iframe preview (not Next). Catalog tokens → CSS vars. */
export function injectFinalUiIntoProductPreview(
  workspaceRoot: string,
  tokens: DesignTokens,
): boolean {
  const abs = path.join(workspaceRoot, PRODUCT_PREVIEW_REL);
  if (!fs.existsSync(abs)) return false;
  let html = "";
  try {
    html = fs.readFileSync(abs, "utf8");
  } catch {
    return false;
  }
  if (!/interactive-product-preview/i.test(html)) return false;
  const nextVars = `:root { --bg:${tokens.bg}; --card:${tokens.surface}; --ink:${tokens.text}; --muted:${tokens.mutedText}; --line:${tokens.border}; --accent:${tokens.primary}; --accent-soft:${tokens.accent}; --warn:#B45309; --radius:${Math.max(4, tokens.radius)}px; }`;
  const patched = html.includes(":root {")
    ? html.replace(/:root\s*\{[^}]*\}/, nextVars)
    : html.replace("</style>", `${nextVars}\n</style>`);
  if (patched === html) return false;
  fs.writeFileSync(abs, patched, "utf8");
  scheduleWorkspaceAbsR2Sync(workspaceRoot, abs);
  return true;
}

/** Returns relative path written, or null if no safe globals file. */
export function injectFinalUiCssVars(
  workspaceRoot: string,
  tokens: DesignTokens,
): string | null {
  for (const rel of CANDIDATES) {
    const abs = path.join(workspaceRoot, rel);
    if (!fs.existsSync(abs)) continue;
    let text = "";
    try {
      text = fs.readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    if (!looksLikeNebullaGlobals(text)) continue;
    const block = tokenBlock(tokens);
    const next = text.includes(FINAL_UI_CSS_START)
      ? text.replace(
          /\/\* nebulla-final-ui-tokens \*\/[\s\S]*?\/\* \/nebulla-final-ui-tokens \*\//,
          block.trim(),
        )
      : `${text.replace(/\s*$/, "")}\n\n${block}`;
    fs.writeFileSync(abs, next.endsWith("\n") ? next : `${next}\n`, "utf8");
    scheduleWorkspaceAbsR2Sync(workspaceRoot, abs);
    return rel;
  }
  return null;
}
