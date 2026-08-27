/**
 * Smallest coded-app restyle: inject §5 / Final UI tokens as CSS variables.
 * Never rewrites page logic. Only touches Nebulla-generated globals.css-style files.
 */
import fs from "fs";
import path from "path";
import type { DesignTokens } from "./v2/types";

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
    return rel;
  }
  return null;
}
