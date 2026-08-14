/**
 * Product app runnable root — workspace root of the cloud project.
 *
 * Convention: package.json + framework entry live at the **workspace root**
 * (same folder as app/, components/, pages/), not under nebulla-project/.
 *
 * Coding must leave install + dev + build scripts so the user can run/deploy.
 */
import fs from "fs";
import path from "path";

export const PRODUCT_APP_ROOT_REL = ".";

export type ProductFramework = "next" | "vite" | "expo" | "unknown";

export type RunnableSkeletonStatus = {
  /** Absolute workspace root (= product app root). */
  appRoot: string;
  /** Relative path convention for status lines. */
  appRootRel: string;
  framework: ProductFramework;
  runnable: boolean;
  hasPackageJson: boolean;
  hasDevScript: boolean;
  hasBuildScript: boolean;
  hasStartScript: boolean;
  hasEntry: boolean;
  missing: string[];
  /** Files written by ensure (relative). */
  written?: string[];
};

const PRODUCT_UI_PATH_RE =
  /^(app|src|pages|components)\//i;

export function isProductUiPath(rel: string): boolean {
  const p = String(rel || "").replace(/\\/g, "/").replace(/^\.\//, "");
  if (!p || p.startsWith("nebulla-project/") || p.startsWith("nebula-project/")) return false;
  return PRODUCT_UI_PATH_RE.test(p);
}

export function writtenPathsNeedRunnableSkeleton(writtenPaths: string[]): boolean {
  return writtenPaths.some((p) => isProductUiPath(p));
}

function exists(abs: string): boolean {
  try {
    return fs.existsSync(abs);
  } catch {
    return false;
  }
}

function readJson(abs: string): Record<string, unknown> | null {
  try {
    if (!exists(abs)) return null;
    return JSON.parse(fs.readFileSync(abs, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function detectProductFramework(workspaceRoot: string): ProductFramework {
  const root = workspaceRoot;
  const pkg = readJson(path.join(root, "package.json"));
  const deps = {
    ...(typeof pkg?.dependencies === "object" && pkg.dependencies ? pkg.dependencies : {}),
    ...(typeof pkg?.devDependencies === "object" && pkg.devDependencies ? pkg.devDependencies : {}),
  } as Record<string, string>;

  if (deps.expo || exists(path.join(root, "app.json")) || exists(path.join(root, "app.config.js"))) {
    if (deps.expo || exists(path.join(root, "app.json"))) return "expo";
  }
  if (
    deps.vite ||
    exists(path.join(root, "vite.config.ts")) ||
    exists(path.join(root, "vite.config.js")) ||
    exists(path.join(root, "vite.config.mjs"))
  ) {
    return "vite";
  }
  if (
    deps.next ||
    exists(path.join(root, "next.config.js")) ||
    exists(path.join(root, "next.config.mjs")) ||
    exists(path.join(root, "next.config.ts")) ||
    exists(path.join(root, "app", "page.tsx")) ||
    exists(path.join(root, "app", "layout.tsx")) ||
    exists(path.join(root, "pages", "index.tsx"))
  ) {
    return "next";
  }
  // Product UI under app/ without config → Next App Router default for Nebulla web MVPs.
  if (exists(path.join(root, "app"))) return "next";
  if (exists(path.join(root, "src", "main.tsx")) || exists(path.join(root, "src", "App.tsx"))) {
    return "vite";
  }
  return "unknown";
}

function hasScript(pkg: Record<string, unknown> | null, name: string): boolean {
  const scripts = pkg?.scripts;
  if (!scripts || typeof scripts !== "object") return false;
  const v = (scripts as Record<string, unknown>)[name];
  return typeof v === "string" && v.trim().length > 0;
}

function hasFrameworkEntry(workspaceRoot: string, framework: ProductFramework): boolean {
  if (framework === "next") {
    return (
      exists(path.join(workspaceRoot, "app", "page.tsx")) ||
      exists(path.join(workspaceRoot, "app", "page.jsx")) ||
      exists(path.join(workspaceRoot, "pages", "index.tsx")) ||
      exists(path.join(workspaceRoot, "pages", "index.jsx"))
    );
  }
  if (framework === "vite") {
    return (
      exists(path.join(workspaceRoot, "index.html")) &&
      (exists(path.join(workspaceRoot, "src", "main.tsx")) ||
        exists(path.join(workspaceRoot, "src", "main.jsx")) ||
        exists(path.join(workspaceRoot, "src", "App.tsx")))
    );
  }
  if (framework === "expo") {
    return (
      exists(path.join(workspaceRoot, "App.tsx")) ||
      exists(path.join(workspaceRoot, "app", "_layout.tsx")) ||
      exists(path.join(workspaceRoot, "app", "index.tsx"))
    );
  }
  return false;
}

export function inspectRunnableSkeleton(workspaceRoot: string): RunnableSkeletonStatus {
  const appRoot = path.resolve(workspaceRoot);
  const framework = detectProductFramework(appRoot);
  const pkgPath = path.join(appRoot, "package.json");
  const pkg = readJson(pkgPath);
  const hasPackageJson = Boolean(pkg);
  const hasDevScript = hasScript(pkg, "dev");
  const hasBuildScript = hasScript(pkg, "build");
  const hasStartScript = hasScript(pkg, "start") || hasScript(pkg, "preview");
  const hasEntry = hasFrameworkEntry(appRoot, framework === "unknown" ? "next" : framework);

  const missing: string[] = [];
  if (!hasPackageJson) missing.push("package.json");
  if (!hasDevScript) missing.push("scripts.dev");
  if (!hasBuildScript) missing.push("scripts.build");
  if (!hasStartScript) missing.push("scripts.start|preview");
  if (!hasEntry) missing.push("framework entry (app/page or index.html+main)");

  const runnable =
    hasPackageJson && hasDevScript && hasBuildScript && hasStartScript && hasEntry && framework !== "unknown";

  return {
    appRoot,
    appRootRel: PRODUCT_APP_ROOT_REL,
    framework,
    runnable,
    hasPackageJson,
    hasDevScript,
    hasBuildScript,
    hasStartScript,
    hasEntry,
    missing,
  };
}

function writeIfMissing(abs: string, body: string, written: string[], workspaceRoot: string): void {
  if (exists(abs)) return;
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body, "utf8");
  written.push(path.relative(workspaceRoot, abs).replace(/\\/g, "/"));
}

function nextPackageJson(projectName: string): string {
  const name =
    projectName
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "nebulla-app";
  return `${JSON.stringify(
    {
      name,
      private: true,
      scripts: {
        dev: "next dev",
        build: "next build",
        start: "next start",
      },
      dependencies: {
        next: "^15.1.0",
        react: "^19.0.0",
        "react-dom": "^19.0.0",
      },
      devDependencies: {
        "@types/node": "^22.10.0",
        "@types/react": "^19.0.0",
        "@types/react-dom": "^19.0.0",
        typescript: "^5.7.0",
      },
    },
    null,
    2,
  )}\n`;
}

function vitePackageJson(projectName: string): string {
  const name =
    projectName
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "nebulla-app";
  return `${JSON.stringify(
    {
      name,
      private: true,
      type: "module",
      scripts: {
        dev: "vite",
        build: "vite build",
        preview: "vite preview",
        start: "vite preview",
      },
      dependencies: {
        react: "^19.0.0",
        "react-dom": "^19.0.0",
      },
      devDependencies: {
        "@vitejs/plugin-react": "^4.3.4",
        typescript: "^5.7.0",
        vite: "^6.0.0",
      },
    },
    null,
    2,
  )}\n`;
}

function mergePackageScripts(
  workspaceRoot: string,
  framework: ProductFramework,
  projectName: string,
  written: string[],
): void {
  const pkgPath = path.join(workspaceRoot, "package.json");
  if (!exists(pkgPath)) {
    const body = framework === "vite" ? vitePackageJson(projectName) : nextPackageJson(projectName);
    fs.writeFileSync(pkgPath, body, "utf8");
    written.push("package.json");
    return;
  }
  const pkg = readJson(pkgPath) || {};
  const scripts = {
    ...((typeof pkg.scripts === "object" && pkg.scripts) || {}),
  } as Record<string, string>;
  let changed = false;
  if (framework === "vite") {
    if (!scripts.dev) {
      scripts.dev = "vite";
      changed = true;
    }
    if (!scripts.build) {
      scripts.build = "vite build";
      changed = true;
    }
    if (!scripts.start && !scripts.preview) {
      scripts.start = "vite preview";
      changed = true;
    }
  } else {
    if (!scripts.dev) {
      scripts.dev = "next dev";
      changed = true;
    }
    if (!scripts.build) {
      scripts.build = "next build";
      changed = true;
    }
    if (!scripts.start) {
      scripts.start = "next start";
      changed = true;
    }
  }
  if (!pkg.private) {
    pkg.private = true;
    changed = true;
  }
  if (!pkg.name) {
    pkg.name = "nebulla-app";
    changed = true;
  }
  if (changed) {
    pkg.scripts = scripts;
    fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
    written.push("package.json");
  }
}

const NEXT_LAYOUT = `export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif" }}>{children}</body>
    </html>
  );
}
`;

const NEXT_PAGE = `export default function HomePage() {
  return (
    <main style={{ padding: 24 }}>
      <h1>App shell</h1>
      <p>Foundation ready — open routes under app/ to continue.</p>
    </main>
  );
}
`;

const NEXT_CONFIG = `/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};
export default nextConfig;
`;

const TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
`;

const README = `# Product app (Nebulla workspace root)

This folder is the **runnable product root** (same directory as \`app/\` / \`components/\`).

## Run locally

\`\`\`bash
npm install
npm run dev
\`\`\`

## Production build

\`\`\`bash
npm run build
npm run start
\`\`\`

In Nebulla IDE, use **Deploy / Build check** to verify \`npm run build\` on the workspace.
App Preview cannot run the Vite/Next bundler inside the iframe yet — build + deploy (or \`npm run dev\` locally) is the functional path.
`;

/**
 * Ensure workspace root can `npm install && npm run build`.
 * Idempotent — fills gaps only; does not wipe feature pages.
 */
export function ensureRunnableSkeleton(
  workspaceRoot: string,
  options?: { projectName?: string; forceFramework?: ProductFramework },
): RunnableSkeletonStatus {
  const root = path.resolve(workspaceRoot);
  fs.mkdirSync(root, { recursive: true });
  const written: string[] = [];
  let framework = options?.forceFramework || detectProductFramework(root);
  if (framework === "unknown") framework = "next";
  if (framework === "expo") {
    // Minimal expo note — prefer not inventing full Expo config mid-slice; fall back to next if app/ web tree.
    if (exists(path.join(root, "app", "page.tsx")) || exists(path.join(root, "app", "layout.tsx"))) {
      framework = "next";
    }
  }

  const projectName = options?.projectName?.trim() || "nebulla-app";
  mergePackageScripts(root, framework === "vite" ? "vite" : "next", projectName, written);

  if (framework === "vite") {
    writeIfMissing(
      path.join(root, "index.html"),
      `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${projectName}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
      written,
      root,
    );
    writeIfMissing(
      path.join(root, "src", "main.tsx"),
      `import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`,
      written,
      root,
    );
    writeIfMissing(
      path.join(root, "src", "App.tsx"),
      `export default function App() {
  return (
    <main style={{ padding: 24 }}>
      <h1>App shell</h1>
      <p>Vite foundation ready.</p>
    </main>
  );
}
`,
      written,
      root,
    );
    writeIfMissing(
      path.join(root, "vite.config.ts"),
      `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
});
`,
      written,
      root,
    );
  } else {
    writeIfMissing(path.join(root, "app", "layout.tsx"), NEXT_LAYOUT, written, root);
    writeIfMissing(path.join(root, "app", "page.tsx"), NEXT_PAGE, written, root);
    writeIfMissing(path.join(root, "next.config.mjs"), NEXT_CONFIG, written, root);
    writeIfMissing(path.join(root, "tsconfig.json"), TSCONFIG, written, root);
    writeIfMissing(
      path.join(root, "next-env.d.ts"),
      `/// <reference types="next" />
/// <reference types="next/image-types/global" />
`,
      written,
      root,
    );
  }

  writeIfMissing(path.join(root, "README.md"), README, written, root);

  const status = inspectRunnableSkeleton(root);
  return { ...status, written };
}

export function runnableStatusLine(status: RunnableSkeletonStatus): string {
  const pathLabel = status.appRootRel === "." ? "workspace root" : status.appRootRel;
  return `Runnable root: ${status.runnable ? "yes" : "no"} (${pathLabel}, ${status.framework})`;
}

/** Go / coding prompt bullets — keep compact. */
export const RUNNABLE_SKELETON_GO_BULLETS = `
RUNNABLE / DEPLOYABLE ROOT (mandatory when emitting app/ src/ pages/ components/ product UI):
- Product app root = **workspace root** (same folder as app/, components/) — not nebulla-project/.
- If package.json or build scripts are missing, emit them in the SAME response: package.json with private:true and scripts.dev, scripts.build, scripts.start (Next: next dev/build/start; Vite: vite / vite build / vite preview).
- Foundation must include framework entry: Next → app/layout.tsx + app/page.tsx (+ next.config + tsconfig as needed). Prefer Next app/ routes for multi-page plans (Home/practice/parent). Vite-only src/App.tsx + src/main.tsx is NOT a Foundation when §4 lists multiple screens.
- Include a short README.md with npm install / npm run dev / npm run build.
- Orphan feature pages without a runnable root are NOT done — leave something the user can install, build, and deploy.
`.trim();
