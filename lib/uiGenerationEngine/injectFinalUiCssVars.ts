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

export type TokenInjectExtras = {
  headingFont?: string;
  jobHint?: string;
};

function tokenBlock(tokens: DesignTokens, extras?: TokenInjectExtras): string {
  const heading = extras?.headingFont || "Inter, system-ui, sans-serif";
  const jobLine = extras?.jobHint ? `\n/* screen-job: ${extras.jobHint} */` : "";
  return `${FINAL_UI_CSS_START}${jobLine}
:root {
  --bg: ${tokens.bg};
  --surface: ${tokens.surface};
  --primary: ${tokens.primary};
  --text: ${tokens.text};
  --muted: ${tokens.mutedText};
  --nebulla-bg: ${tokens.bg};
  --nebulla-surface: ${tokens.surface};
  --nebulla-primary: ${tokens.primary};
  --nebulla-accent: ${tokens.accent};
  --nebulla-text: ${tokens.text};
  --nebulla-muted: ${tokens.mutedText};
  --nebulla-border: ${tokens.border};
  --nebulla-radius: ${Math.max(4, tokens.radius)}px;
  --nebulla-font-heading: ${heading};
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

function ensureGlobalsFile(workspaceRoot: string): string | null {
  const appDir = path.join(workspaceRoot, "app");
  const srcAppDir = path.join(workspaceRoot, "src", "app");
  const rel = fs.existsSync(appDir)
    ? "app/globals.css"
    : fs.existsSync(srcAppDir)
      ? "src/app/globals.css"
      : null;
  if (!rel) return null;
  const abs = path.join(workspaceRoot, rel);
  if (!fs.existsSync(abs)) {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n", "utf8");
  }
  const layoutRel = rel.startsWith("src/") ? "src/app/layout.tsx" : "app/layout.tsx";
  const layoutAbs = path.join(workspaceRoot, layoutRel);
  if (fs.existsSync(layoutAbs)) {
    try {
      let layout = fs.readFileSync(layoutAbs, "utf8");
      if (!/globals\.css/.test(layout)) {
        layout = `import "./globals.css";\n${layout}`;
        fs.writeFileSync(layoutAbs, layout, "utf8");
        scheduleWorkspaceAbsR2Sync(workspaceRoot, layoutAbs);
      }
    } catch {
      /* ignore */
    }
  }
  return rel;
}

/** Returns relative path written, or null if no safe globals file. */
export function injectFinalUiCssVars(
  workspaceRoot: string,
  tokens: DesignTokens,
  extras?: TokenInjectExtras,
): string | null {
  ensureGlobalsFile(workspaceRoot);
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
    const block = tokenBlock(tokens, extras);
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
