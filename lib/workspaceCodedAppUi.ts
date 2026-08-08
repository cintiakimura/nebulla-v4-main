/**
 * Preview authority: detect when the workspace has a real coded product UI
 * vs a static UI Gen mockup shell.
 */

import fs from "fs";
import path from "path";

export const UI_GEN_MOCKUP_META = 'name="nebulla-preview" content="ui-gen-mockup"';
export const UI_GEN_MOCKUP_MARKER = "ui-gen-mockup";
export const UI_GEN_MOCKUP_REL = "public/nebula-ui-gen-preview.html";
export const CODED_APP_BRIDGE_MARKER = "coded-app-bridge";

const SKIP_DIR = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
  "generated-ui",
  "nebulla-ide",
  "nebula-ui-studio",
  "nebulla-project",
  "nebula-project",
  "conversation-logs",
  "nebulla-version-history",
]);

const UI_FILE_RE = /\.(tsx|jsx|vue)$/i;
const IGNORE_FILE_RE = /\.(test|spec|stories|d)\.[tj]sx?$/i;

export type AppPreviewMode =
  | "pre_code_mockup"
  | "post_code_bridge"
  | "live_app_static"
  | "empty";

export type AppPreviewAuthority = {
  mode: AppPreviewMode;
  /** Human label for IDE chrome */
  statusLabel: string;
  codedApp: boolean;
  indexIsMockup: boolean;
  /** Relative path preferred for static file serve, or null when bootstrap should synthesize HTML */
  entryRel: string | null;
  productFiles: string[];
  mockupRel: string | null;
  limitation: string | null;
};

function listProductUiFiles(workspaceRoot: string, max = 40): string[] {
  const root = workspaceRoot.trim();
  if (!root || !fs.existsSync(root)) return [];
  const out: string[] = [];

  const walk = (abs: string, rel: string, depth: number) => {
    if (out.length >= max || depth > 5) return;
    let ents: fs.Dirent[];
    try {
      ents = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of ents) {
      if (out.length >= max) return;
      const name = ent.name;
      if (name.startsWith(".")) continue;
      if (ent.isDirectory()) {
        if (SKIP_DIR.has(name)) continue;
        walk(path.join(abs, name), rel ? `${rel}/${name}` : name, depth + 1);
        continue;
      }
      if (!ent.isFile()) continue;
      if (!UI_FILE_RE.test(name) || IGNORE_FILE_RE.test(name)) continue;
      const fullRel = rel ? `${rel}/${name}` : name;
      const top = fullRel.split("/")[0] || "";
      if (!["app", "src", "pages", "components"].includes(top)) continue;
      // Prefer real UI trees; skip pure type-only noise under src/types etc.
      if (/^src\/(types|mocks|test|tests|__tests__)\//i.test(fullRel)) continue;
      try {
        const st = fs.statSync(path.join(abs, name));
        if (st.size < 40) continue;
      } catch {
        continue;
      }
      out.push(fullRel.replace(/\\/g, "/"));
    }
  };

  for (const top of ["app", "src", "pages", "components"]) {
    const abs = path.join(root, top);
    if (fs.existsSync(abs)) walk(abs, top, 0);
  }
  return out.sort();
}

/** True when meaningful product UI source exists (not only public HTML / mockup meta). */
export function workspaceHasCodedAppUi(workspaceRoot: string): boolean {
  return listProductUiFiles(workspaceRoot, 8).length >= 1;
}

export function isNebulaUiGenMockupHtml(html: string): boolean {
  const t = String(html || "");
  if (!t.trim()) return false;
  if (new RegExp(UI_GEN_MOCKUP_MARKER, "i").test(t)) return true;
  // Legacy shells written before the meta marker
  if (/class="shell--phone"|class="screen-switcher"|nebula-ui-gen-preview/i.test(t) && /data-screen=/i.test(t)) {
    return true;
  }
  return false;
}

export function isCodedAppBridgeHtml(html: string): boolean {
  return new RegExp(CODED_APP_BRIDGE_MARKER, "i").test(String(html || ""));
}

function readIndexHtml(workspaceRoot: string): string | null {
  const idx = path.join(workspaceRoot, "index.html");
  if (!fs.existsSync(idx)) return null;
  try {
    const st = fs.statSync(idx);
    if (st.size < 40) return null;
    return fs.readFileSync(idx, "utf8");
  } catch {
    return null;
  }
}

function findBuiltStaticEntry(workspaceRoot: string): string | null {
  for (const rel of ["dist/index.html", "build/index.html", "out/index.html"]) {
    const abs = path.join(workspaceRoot, rel);
    if (!fs.existsSync(abs)) continue;
    try {
      if (fs.statSync(abs).size >= 40) return rel;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/**
 * Resolve what App Preview bootstrap should serve.
 * Prefers real static build entry; never presents UI Gen mockup as the live product after code exists.
 */
export function resolveAppPreviewAuthority(workspaceRoot: string): AppPreviewAuthority {
  const productFiles = listProductUiFiles(workspaceRoot, 24);
  const codedApp = productFiles.length >= 1;
  const indexHtml = readIndexHtml(workspaceRoot);
  const indexIsMockup = indexHtml ? isNebulaUiGenMockupHtml(indexHtml) : false;
  const mockupAbs = path.join(workspaceRoot, UI_GEN_MOCKUP_REL);
  const mockupRel = fs.existsSync(mockupAbs) ? UI_GEN_MOCKUP_REL : null;
  const built = findBuiltStaticEntry(workspaceRoot);

  if (!codedApp) {
    if (indexHtml && !indexIsMockup && indexHtml.length >= 80) {
      return {
        mode: "live_app_static",
        statusLabel: "Live app preview",
        codedApp: false,
        indexIsMockup: false,
        entryRel: "index.html",
        productFiles,
        mockupRel,
        limitation: null,
      };
    }
    if (indexHtml || mockupRel) {
      return {
        mode: "pre_code_mockup",
        statusLabel: "Pre-code mockup only — not live app",
        codedApp: false,
        indexIsMockup: indexIsMockup || Boolean(mockupRel),
        entryRel: indexHtml ? "index.html" : mockupRel,
        productFiles,
        mockupRel,
        limitation: null,
      };
    }
    return {
      mode: "empty",
      statusLabel: "No preview yet",
      codedApp: false,
      indexIsMockup: false,
      entryRel: null,
      productFiles,
      mockupRel: null,
      limitation: null,
    };
  }

  // Coded product exists
  if (built) {
    return {
      mode: "live_app_static",
      statusLabel: "Live app preview",
      codedApp: true,
      indexIsMockup: false,
      entryRel: built,
      productFiles,
      mockupRel,
      limitation: null,
    };
  }

  if (indexHtml && !indexIsMockup && !isCodedAppBridgeHtml(indexHtml)) {
    // Real index.html that isn't our mockup — serve it, but React/Vite usually needs a bundler.
    const needsBundler = /type=["']module["']|\/src\/main\.|\/src\/App\.|\.tsx/i.test(indexHtml);
    return {
      mode: needsBundler ? "post_code_bridge" : "live_app_static",
      statusLabel: needsBundler
        ? "Post-code — product files (runtime limited)"
        : "Live app preview",
      codedApp: true,
      indexIsMockup: false,
      entryRel: needsBundler ? null : "index.html",
      productFiles,
      mockupRel,
      limitation: needsBundler
        ? "Workspace Vite/Next/Expo runtime is not started inside App Preview iframe yet — showing coded-file bridge instead of the static UI Gen mockup."
        : null,
    };
  }

  return {
    mode: "post_code_bridge",
    statusLabel: "Post-code — product files (not mockup)",
    codedApp: true,
    indexIsMockup,
    entryRel: null,
    productFiles,
    mockupRel,
    limitation:
      "App Preview cannot run the workspace Vite/Next/Expo bundler in the iframe yet. Product UI source was detected — open those files to validate features. Optional static mockup is kept at public/nebula-ui-gen-preview.html only.",
  };
}

function esc(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Honest HTML when coded UI exists but iframe cannot run the app bundler. */
export function buildCodedAppPreviewBridgeHtml(opts: {
  projectName?: string;
  productFiles: string[];
  mockupRel?: string | null;
  limitation?: string | null;
}): string {
  const name = esc((opts.projectName || "App").slice(0, 80));
  const files = (opts.productFiles || []).slice(0, 16);
  const list = files.map((f) => `<li><code>${esc(f)}</code></li>`).join("\n");
  const mockup = opts.mockupRel
    ? `<p class="muted">Optional pre-code mockup (not the live product): <code>${esc(opts.mockupRel)}</code></p>`
    : "";
  const limit = esc(
    opts.limitation ||
      "In-IDE App Preview cannot start the workspace app bundler yet. Use the Explorer to inspect coded screens.",
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta name="nebulla-preview" content="${CODED_APP_BRIDGE_MARKER}"/>
  <title>${name} — Coded app</title>
  <style>
    body { margin:0; font-family: system-ui, -apple-system, Segoe UI, sans-serif; background:#FAFAF9; color:#1C1917; padding:24px; line-height:1.45; }
    .badge { display:inline-block; font-size:11px; font-weight:600; letter-spacing:.04em; text-transform:uppercase; color:#0F766E; background:#CCFBF1; padding:4px 8px; border-radius:6px; }
    h1 { font-size:1.25rem; margin:12px 0 8px; }
    p { margin:8px 0; max-width:36rem; }
    .muted { color:#78716C; font-size:.9rem; }
    ul { padding-left:1.1rem; margin:12px 0; }
    code { font-size:.85em; background:#F5F5F4; padding:1px 4px; border-radius:4px; }
    .card { background:#fff; border:1px solid #E7E5E4; border-radius:12px; padding:16px; max-width:40rem; }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">Post-code — not mockup</span>
    <h1>${name}</h1>
    <p><strong>Product UI source was detected.</strong> App Preview is no longer treating the static UI Gen shell as your live app.</p>
    <p class="muted">${limit}</p>
    <p><strong>Coded UI files</strong> (validate features here):</p>
    <ul>
${list || "<li><code>(none listed)</code></li>"}
    </ul>
    ${mockup}
    <p class="muted">UI Studio Beta remains the visual tree / mockup editor. Coding follows Master Plan — mockup pixels are not the spec.</p>
  </div>
</body>
</html>
`;
}
