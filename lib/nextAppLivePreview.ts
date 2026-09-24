/**
 * Live iframe for a Next app/ root — never public/product-preview/index.html.
 */
import fs from "fs";
import path from "path";
import { PRODUCT_PREVIEW_REL } from "./interactiveProductPreview";
import { readProductIdentity } from "./productIdentity";

export const NEXT_APP_LIVE_MARKER = "next-app-live";

const NEXT_PAGE_RELS = [
  "app/page.tsx",
  "app/page.jsx",
  "app/page.js",
  "src/app/page.tsx",
  "src/app/page.jsx",
  "src/app/page.js",
];

export function workspaceHasNextAppRoot(workspaceRoot: string): boolean {
  const root = String(workspaceRoot || "").trim();
  if (!root) return false;
  return NEXT_PAGE_RELS.some((rel) => fs.existsSync(path.join(root, rel)));
}

export function removeProductPreviewAfterFoundation(workspaceRoot: string): string[] {
  const removed: string[] = [];
  const root = path.resolve(workspaceRoot);
  for (const rel of [PRODUCT_PREVIEW_REL, "public/product-preview.html"]) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) continue;
    try {
      fs.unlinkSync(abs);
      removed.push(rel);
    } catch {
      /* ignore */
    }
  }
  return removed;
}

function escapeHtml(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function readFirstExisting(root: string, rels: string[]): { rel: string; body: string } | null {
  for (const rel of rels) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) continue;
    try {
      const body = fs.readFileSync(abs, "utf8");
      if (body.trim().length >= 20) return { rel, body };
    } catch {
      /* next */
    }
  }
  return null;
}

function extractVisibleCopy(src: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string) => {
    const t = String(raw || "").replace(/\s+/g, " ").trim();
    if (t.length < 2 || t.length > 80) return;
    if (/^(import|export|return|const|function|from|className)$/i.test(t)) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(t);
  };
  for (const m of src.matchAll(/>([^<>{}]{2,80})</g)) add(m[1]);
  for (const m of src.matchAll(/>\{\s*["'`]([^"'`]{2,80})["'`]\s*\}/g)) add(m[1]);
  for (const m of src.matchAll(/(?:placeholder|aria-label|title)=["'`]([^"'`]{2,80})["'`]/gi)) {
    add(m[1]);
  }
  return out.slice(0, 12);
}

function listNextAppRoutes(workspaceRoot: string): string[] {
  const routes = new Set<string>(["/"]);
  for (const top of ["app", "src/app"]) {
    const absTop = path.join(workspaceRoot, top);
    if (!fs.existsSync(absTop)) continue;
    const walk = (dir: string, rel: string) => {
      let ents: fs.Dirent[] = [];
      try {
        ents = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const ent of ents) {
        if (ent.name.startsWith(".") || ent.name === "node_modules") continue;
        const nextAbs = path.join(dir, ent.name);
        const nextRel = rel ? `${rel}/${ent.name}` : ent.name;
        if (ent.isDirectory()) {
          walk(nextAbs, nextRel);
          continue;
        }
        if (/^page\.(tsx|jsx|js)$/i.test(ent.name)) {
          const folder = nextRel.replace(/\/page\.(tsx|jsx|js)$/i, "");
          if (!folder || folder === "page.tsx") routes.add("/");
          else routes.add(`/${folder.replace(/^src\/app\/?/, "").replace(/^app\/?/, "")}`.replace(/\/+/g, "/"));
        }
      }
    };
    walk(absTop, "");
  }
  return [...routes];
}

function routeLabel(route: string): string {
  if (route === "/") return "Home";
  const last = route.replace(/^\//, "").split("/").filter(Boolean).pop() || route;
  return last.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** HTML built from app/page.tsx + §4 routes — not the product-preview template. */
export function buildLiveHtmlFromNextApp(
  workspaceRoot: string,
  displayName?: string,
): string | null {
  if (!workspaceHasNextAppRoot(workspaceRoot)) return null;
  const page = readFirstExisting(workspaceRoot, NEXT_PAGE_RELS);
  if (!page) return null;
  const identity = readProductIdentity(workspaceRoot);
  const title = String(identity?.projectName || displayName || "App").trim() || "App";
  const initials = String(identity?.logoInitials || title.slice(0, 2)).trim() || "AP";
  const navRoutes = listNextAppRoutes(workspaceRoot);
  const copy = extractVisibleCopy(page.body);
  const cssAbs = ["app/globals.css", "src/app/globals.css"]
    .map((rel) => path.join(workspaceRoot, rel))
    .find((abs) => fs.existsSync(abs));
  let css = "";
  if (cssAbs) {
    try {
      css = fs.readFileSync(cssAbs, "utf8").slice(0, 8000);
    } catch {
      css = "";
    }
  }
  const nav = navRoutes
    .map((r) => `<a href="#${escapeHtml(r)}">${escapeHtml(routeLabel(r))}</a>`)
    .join("");
  const body =
    copy.length > 0
      ? copy.map((t) => `<p>${escapeHtml(t)}</p>`).join("")
      : `<p>${escapeHtml(title)}</p><button type="button">Continue</button>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="nebulla-preview" content="${NEXT_APP_LIVE_MARKER}"/>
<meta name="nebulla-next-source" content="${escapeHtml(page.rel)}"/>
<title>${escapeHtml(title)}</title>
<style>
:root { --bg:#0B1220; --text:#E8EEF6; --accent:#7C9CFF; --muted:#94A3B8; }
html,body { margin:0; background:var(--bg); color:var(--text); font-family:ui-sans-serif,system-ui,sans-serif; }
header { display:flex; align-items:center; gap:10px; padding:14px 16px; border-bottom:1px solid #1f2a3d; }
.mark { width:32px; height:32px; border-radius:10px; background:var(--accent); color:#0B1220; display:grid; place-items:center; font-weight:700; font-size:12px; }
nav { display:flex; flex-wrap:wrap; gap:10px; padding:10px 16px; }
nav a { color:var(--text); text-decoration:none; font-size:14px; }
nav a:hover { color:var(--accent); }
main { padding:16px; }
main p { margin:0 0 10px; }
button { background:var(--accent); color:#0B1220; border:0; border-radius:10px; padding:10px 14px; font-weight:600; }
${css}
</style>
</head>
<body>
<header><div class="mark">${escapeHtml(initials)}</div><strong>${escapeHtml(title)}</strong></header>
<nav>${nav}</nav>
<main data-next-source="${escapeHtml(page.rel)}">${body}</main>
</body>
</html>`;
}
