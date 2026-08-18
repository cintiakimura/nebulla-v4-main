/**
 * Preview authority: detect when the workspace has a real coded product UI
 * vs a static UI Gen mockup shell.
 */

import fs from "fs";
import path from "path";
import {
  PRODUCT_PREVIEW_MARKER,
  PRODUCT_PREVIEW_REL,
  hasInteractiveProductPreview,
} from "./interactiveProductPreview";

export const UI_GEN_MOCKUP_META = 'name="nebulla-preview" content="ui-gen-mockup"';
export const UI_GEN_MOCKUP_MARKER = "ui-gen-mockup";
export const UI_GEN_MOCKUP_REL = "public/nebula-ui-gen-preview.html";
export const CODED_APP_BRIDGE_MARKER = "coded-app-bridge";
export { PRODUCT_PREVIEW_REL, PRODUCT_PREVIEW_MARKER };

/** Iframe HTML is showable — mockup OR coded/product-preview. Do not require Figma-shaped markup. */
export function htmlLooksLikeShowablePreview(html: string): boolean {
  const t = String(html || "");
  if (t.length < 80) return false;
  if (/No preview|No index\.html/i.test(t)) return false;
  if (/interactive-product-preview|coded-app-bridge/i.test(t)) return true;
  return /ui-gen-mockup|shell--phone|data-screen=/i.test(t);
}

/** Product routes / interactive preview on disk — leave Waiting-for-mockup. */
export function previewMetaHasProductRoutes(meta: {
  previewHonesty?: string | null;
  previewMode?: string | null;
}): boolean {
  const h = String(meta.previewHonesty || "");
  const m = String(meta.previewMode || "");
  return (
    h === "real_routes" ||
    m === "interactive_product_preview" ||
    m === "live_app_static" ||
    m === "post_code_bridge"
  );
}

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
  | "thin_code_shell"
  | "interactive_product_preview"
  | "live_app_static"
  | "empty";

/** Honest preview / App Status — never treat a Vite App/main shell as success. */
export type PreviewHonesty = "mockup_waiting" | "thin_code_shell" | "real_routes" | "empty";

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
  honesty: PreviewHonesty;
};

export function listProductUiFiles(workspaceRoot: string, max = 40): string[] {
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

/** True when any product UI source exists (used so mockup does not reclaim index.html). */
export function workspaceHasCodedAppUi(workspaceRoot: string): boolean {
  return listProductUiFiles(workspaceRoot, 8).length >= 1;
}

function normalizeProductPath(raw: string): string {
  return String(raw || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

/** Next app page files, pages/*, src/app/*, and *Screen.tsx — not Vite src/App.tsx + src/main.tsx. */
export function listProductRouteFiles(paths: string[]): string[] {
  return (paths || []).filter((raw) => {
    const p = normalizeProductPath(raw);
    return (
      /^(?:src\/)?app\/(?:.+\/)?page\.(tsx|jsx|js)$/i.test(p) ||
      /^(?:src\/)?pages\/.+\.(tsx|jsx|js)$/i.test(p) ||
      /(^|\/)(?!ErrorBoundary)[A-Za-z][A-Za-z0-9]+Screen\.(tsx|jsx)$/i.test(p)
    );
  });
}

/**
 * UI files on disk but no app/ or pages/ routes (typical: src/App.tsx + src/main.tsx).
 */
export function isThinCodeShell(paths: string[]): boolean {
  const normalized = (paths || []).map((p) => String(p || "").replace(/\\/g, "/"));
  const ui = normalized.filter((p) => {
    if (!/\.(tsx|jsx)$/i.test(p)) return false;
    const top = p.split("/")[0] || "";
    return ["app", "src", "pages", "components"].includes(top);
  });
  if (ui.length === 0) return false;
  return inferRoutesFromProductFiles(normalized).length === 0;
}

export function isAuthOnlyProductRoutes(paths: string[]): boolean {
  const routes = inferRoutesFromProductFiles(paths);
  if (routes.length === 0) return false;
  return routes.every((r) =>
    /^\/(login|auth|signin|sign-in|signup|register|sign-up)?$/i.test(r),
  );
}

export function assessApplyRouteDepth(writtenPaths: string[]): {
  productRouteFiles: string[];
  productRoutes: string[];
  thinCodeShell: boolean;
  zeroProductRoutes: boolean;
  authOnly: boolean;
} {
  // Phase 6: App+main-only (or no app/pages routes) is not a product shell.
  const productRouteFiles = listProductRouteFiles(writtenPaths);
  const productRoutes = inferRoutesFromProductFiles(writtenPaths);
  return {
    productRouteFiles,
    productRoutes,
    thinCodeShell: isThinCodeShell(writtenPaths),
    zeroProductRoutes: productRoutes.length === 0,
    authOnly: isAuthOnlyProductRoutes(writtenPaths),
  };
}

/** Route-map shell written when no live app exists — not a product preview. */
export function isWorkspaceRoutesScaffoldHtml(html: string): boolean {
  const t = String(html || "");
  return /name=["']nebulla-preview["']\s+content=["']workspace-routes["']/i.test(t) ||
    /Workspace routes on disk/i.test(t);
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

function withHonesty(
  auth: Omit<AppPreviewAuthority, "honesty">,
  honesty: PreviewHonesty,
): AppPreviewAuthority {
  return { ...auth, honesty };
}

/**
 * Resolve what App Preview bootstrap should serve.
 * Prefers real static build entry; never presents UI Gen mockup as the live product after real routes exist.
 * Vite-only src/App.tsx + src/main.tsx is a thin shell — not "Code exists" success.
 */
export function resolveAppPreviewAuthority(workspaceRoot: string): AppPreviewAuthority {
  const productFiles = listProductUiFiles(workspaceRoot, 24);
  const thinShell = isThinCodeShell(productFiles);
  const hasRealRoutes = inferRoutesFromProductFiles(productFiles).length > 0 && !thinShell;
  const indexHtml = readIndexHtml(workspaceRoot);
  const indexIsMockup = indexHtml ? isNebulaUiGenMockupHtml(indexHtml) : false;
  const mockupAbs = path.join(workspaceRoot, UI_GEN_MOCKUP_REL);
  const mockupRel = fs.existsSync(mockupAbs) ? UI_GEN_MOCKUP_REL : null;
  const built = findBuiltStaticEntry(workspaceRoot);

  if (built) {
    return withHonesty(
      {
        mode: "live_app_static",
        statusLabel: "Live app preview",
        codedApp: true,
        indexIsMockup: false,
        entryRel: built,
        productFiles,
        mockupRel,
        limitation: null,
      },
      "real_routes",
    );
  }

  if (hasRealRoutes && hasInteractiveProductPreview(workspaceRoot)) {
    return withHonesty(
      {
        mode: "interactive_product_preview",
        statusLabel: "Interactive preview (mock data)",
        codedApp: true,
        indexIsMockup: false,
        entryRel: PRODUCT_PREVIEW_REL,
        productFiles,
        mockupRel,
        limitation: null,
      },
      "real_routes",
    );
  }

  if (hasRealRoutes) {
    if (
      indexHtml &&
      !indexIsMockup &&
      !isCodedAppBridgeHtml(indexHtml) &&
      !isWorkspaceRoutesScaffoldHtml(indexHtml)
    ) {
      const needsBundler = /type=["']module["']|\/src\/main\.|\/src\/App\.|\.tsx/i.test(indexHtml);
      return withHonesty(
        {
          mode: needsBundler ? "post_code_bridge" : "live_app_static",
          statusLabel: needsBundler ? "Code exists - open Code" : "Live app preview",
          codedApp: true,
          indexIsMockup: false,
          entryRel: needsBundler ? null : "index.html",
          productFiles,
          mockupRel,
          limitation: needsBundler
            ? "This shell cannot run the workspace Vite/Next app in the iframe. Open Code to inspect the coded routes."
            : null,
        },
        "real_routes",
      );
    }
    return withHonesty(
      {
        mode: "post_code_bridge",
        statusLabel: "Code exists - open Code",
        codedApp: true,
        indexIsMockup,
        entryRel: null,
        productFiles,
        mockupRel,
        limitation:
          "This shell cannot run the workspace Vite/Next app in the iframe. Open Code to inspect the coded routes.",
      },
      "real_routes",
    );
  }

  if (thinShell) {
    return withHonesty(
      {
        mode: "thin_code_shell",
        statusLabel: "Code shell — open Code",
        codedApp: false,
        indexIsMockup,
        entryRel: null,
        productFiles,
        mockupRel,
        limitation:
          "src/App.tsx + src/main.tsx (or similar) is not a product. Need app/ or pages/ routes.",
      },
      "thin_code_shell",
    );
  }

  const indexIsScaffold = indexHtml ? isWorkspaceRoutesScaffoldHtml(indexHtml) : false;
  if (mockupRel && (indexIsScaffold || !indexHtml || indexIsMockup)) {
    return withHonesty(
      {
        mode: "pre_code_mockup",
        statusLabel: "Mockup waiting - not live app",
        codedApp: false,
        indexIsMockup: true,
        entryRel: mockupRel,
        productFiles,
        mockupRel,
        limitation: null,
      },
      "mockup_waiting",
    );
  }
  if (indexHtml && !indexIsMockup && !indexIsScaffold && indexHtml.length >= 80) {
    return withHonesty(
      {
        mode: "live_app_static",
        statusLabel: "Live app preview",
        codedApp: false,
        indexIsMockup: false,
        entryRel: "index.html",
        productFiles,
        mockupRel,
        limitation: null,
      },
      "real_routes",
    );
  }
  if (indexHtml || mockupRel) {
    return withHonesty(
      {
        mode: "pre_code_mockup",
        statusLabel: "Mockup waiting - not live app",
        codedApp: false,
        indexIsMockup: indexIsMockup || Boolean(mockupRel),
        entryRel: mockupRel || "index.html",
        productFiles,
        mockupRel,
        limitation: null,
      },
      "mockup_waiting",
    );
  }
  return withHonesty(
    {
      mode: "empty",
      statusLabel: "No preview yet",
      codedApp: false,
      indexIsMockup: false,
      entryRel: null,
      productFiles,
      mockupRel: null,
      limitation: null,
    },
    "empty",
  );
}

/** Routes implied by app/, src/app/, pages/, and *Screen.tsx files (for honest post-code preview). */
export function inferRoutesFromProductFiles(productFiles: string[]): string[] {
  const routes = new Set<string>();
  for (const raw of productFiles || []) {
    const p = normalizeProductPath(raw);
    if (/^(?:src\/)?app\/page\.(tsx|jsx|js)$/i.test(p)) {
      routes.add("/");
      continue;
    }
    const appPage = p.match(/^(?:src\/)?app\/(.+)\/page\.(tsx|jsx|js)$/i);
    if (appPage) {
      routes.add(`/${appPage[1].replace(/\/index$/i, "")}`);
      continue;
    }
    const pages = p.match(/^(?:src\/)?pages\/(.+)\.(tsx|jsx|js)$/i);
    if (pages) {
      const slug = pages[1].replace(/\/index$/i, "").replace(/^index$/i, "");
      routes.add(`/${slug.replace(/\[(.+?)\]/g, ":$1")}`);
      continue;
    }
    const screen = p.match(/(^|\/)([A-Za-z][A-Za-z0-9]+)Screen\.(tsx|jsx)$/);
    if (screen && !/^ErrorBoundary$/i.test(screen[2])) {
      const slug = screen[2].replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
      if (slug) routes.add(`/${slug}`);
    }
  }
  return [...routes].sort();
}

/** ASCII-only header value (Node rejects em-dash etc. in setHeader). */
export function toHttpHeaderSafe(value: string, max = 120): string {
  return String(value || "")
    .replace(/[—–]/g, "-")
    .replace(/[^\x20-\x7E]/g, "")
    .slice(0, max);
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
  honesty?: PreviewHonesty;
}): string {
  const name = esc((opts.projectName || "App").slice(0, 80));
  const files = (opts.productFiles || []).slice(0, 16);
  const list = files.map((f) => `<li><code>${esc(f)}</code></li>`).join("\n");
  const routes = inferRoutesFromProductFiles(opts.productFiles || []);
  const routeList = routes.map((r) => `<li><code>${esc(r)}</code></li>`).join("\n");
  const thin = opts.honesty === "thin_code_shell" || (routes.length === 0 && files.length > 0);
  const mockup = opts.mockupRel
    ? `<p class="muted">A pre-code mockup file may still exist at <code>${esc(opts.mockupRel)}</code> — it is not this product.</p>`
    : "";
  const limit = esc(
    opts.limitation ||
      (thin
        ? "Need real product routes under app/ or pages/. src/App.tsx + src/main.tsx is not enough."
        : "This shell cannot run the workspace Vite/Next app in the iframe. Open Code to inspect the coded routes."),
  );
  const badge = thin ? "Code shell — open Code" : "Code exists — open Code";
  const title = thin ? `${name} — thin shell` : `${name} — Code exists`;
  const lead = thin
    ? "<strong>This is not a finished product.</strong> Apply wrote a Vite shell (or similar) without <code>app/</code> or <code>pages/</code> routes. App Status must not show success."
    : "<strong>Coded workspace routes are on disk.</strong> This is not a live app runtime and not the generic role-picker mock.";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta name="nebulla-preview" content="${CODED_APP_BRIDGE_MARKER}"/>
  <title>${title}</title>
  <style>
    body { margin:0; font-family: system-ui, -apple-system, Segoe UI, sans-serif; background:#FAFAF9; color:#1C1917; padding:24px; line-height:1.45; }
    .badge { display:inline-block; font-size:11px; font-weight:600; letter-spacing:.04em; text-transform:uppercase; color:${thin ? "#9A3412" : "#0F766E"}; background:${thin ? "#FFEDD5" : "#CCFBF1"}; padding:4px 8px; border-radius:6px; }
    h1 { font-size:1.25rem; margin:12px 0 8px; }
    p { margin:8px 0; max-width:36rem; }
    .muted { color:#78716C; font-size:.9rem; }
    ul { padding-left:1.1rem; margin:12px 0; }
    code { font-size:.85em; background:#F5F5F4; padding:1px 4px; border-radius:4px; }
    .card { background:#fff; border:1px solid #E7E5E4; border-radius:12px; padding:16px; max-width:40rem; }
    .actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:14px; }
    .btn { display:inline-block; font-size:12px; font-weight:600; padding:8px 12px; border-radius:8px; text-decoration:none; border:1px solid #D6D3D1; color:#1C1917; background:#fff; cursor:pointer; }
    .btn-primary { background:#0F766E; border-color:#0F766E; color:#fff; }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">${badge}</span>
    <h1>${name}</h1>
    <p>${lead}</p>
    <p class="muted">${limit}</p>
    <p><strong>Routes in this workspace</strong></p>
    <ul>
${routeList || "<li><code>(no app/ or pages/ routes detected)</code></li>"}
    </ul>
    <p><strong>Coded UI files</strong></p>
    <ul>
${list || "<li><code>(none listed)</code></li>"}
    </ul>
    <div class="actions">
      <button type="button" class="btn btn-primary" onclick="try{parent.postMessage({type:'nebula-open-code'},'*')}catch(e){}">Open Code</button>
      <button type="button" class="btn" onclick="try{parent.postMessage({type:'nebula-workspace-deploy'},'*')}catch(e){}">Deploy / Build check</button>
    </div>
    ${mockup}
    <p class="muted">Build preview cannot start Vite/Next inside this iframe. Use the Code tab for the real files.</p>
  </div>
</body>
</html>
`;
}
