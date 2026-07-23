import fs from "fs";
import path from "path";
import { readV0PromptMarkdown, writeV0PromptMarkdown } from "./nebulaUiStudioPipeline";
import { summarizeDesignReferencesForPrompt } from "./nebulaDesignReferences";
import {
  isVisualEditorEligible,
  readEditorState,
  writeEditorState,
} from "./visualUiEditorWorkspace";

import { MASTER_PLAN_ALL_KEYS, MASTER_PLAN_USER_SECTION_KEYS, normalizeMasterPlanRecord } from "./masterPlanSections";

export const MASTER_PLAN_TAB_KEYS = MASTER_PLAN_ALL_KEYS;

const MIND_MAP_REL = "nebulla-ide/mind-map.json";

export function readMasterPlanFile(masterPlanPath: string): Record<string, string> {
  if (!fs.existsSync(masterPlanPath)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(masterPlanPath, "utf8")) as Record<string, unknown>;
    return normalizeMasterPlanRecord(raw);
  } catch {
    return {};
  }
}

export function masterPlanLooksEmpty(plan: Record<string, string>): boolean {
  return MASTER_PLAN_USER_SECTION_KEYS.every((k) => !String(plan[k] ?? "").trim());
}

const MIN_MASTER_PLAN_SECTION_CHARS = 48;

export function listMissingMasterPlanSections(plan: Record<string, string>): string[] {
  return MASTER_PLAN_USER_SECTION_KEYS.filter(
    (k) => !String(plan[k] ?? "").trim() || String(plan[k] ?? "").trim().length < MIN_MASTER_PLAN_SECTION_CHARS,
  );
}

/** Fill empty §1–§5 from workspace routes, user note, and design refs (no LLM). */
export function fillMissingMasterPlanSectionsLocal(opts: {
  workspaceRoot: string;
  masterPlanPath: string;
  projectName: string;
  userNote?: string;
}): { updated: string[] } {
  const plan = readMasterPlanFile(opts.masterPlanPath);
  const missing = listMissingMasterPlanSections(plan);
  if (missing.length === 0) return { updated: [] };

  const routes = discoverWorkspaceRoutes(opts.workspaceRoot);
  const note = (opts.userNote ?? "").trim().slice(0, 2000);
  const name = opts.projectName.trim() || "Untitled Project";
  const goal = String(plan["1. Goal of the app"] ?? "").trim();
  const refHint = summarizeDesignReferencesForPrompt(opts.workspaceRoot, 280);
  const next = { ...plan };
  const updated: string[] = [];

  if (!String(next["1. Goal of the app"] ?? "").trim()) {
    next["1. Goal of the app"] =
      note ||
      `Build **${name}** — product goal from discovery (refine in chat). Users, problem, and scope for this workspace.`;
    updated.push("1. Goal of the app");
  }

  if (missing.includes("2. Tech and Research")) {
    next["2. Tech and Research"] = [
      `- **Category:** ${name} — research 5–10 real competitors and their dominant UX patterns before coding.`,
      "- **Industry UI:** derive palette, density, and nav from competitor research + user discovery (not Nebulla IDE chrome).",
      "- **Stack:** Next.js App Router, TypeScript, Tailwind, shadcn/ui.",
      "- **Integrations:** auth, dashboards, uploads as described in discovery.",
      ...(note ? [`- **Session focus:** ${note.slice(0, 400)}`] : []),
    ].join("\n");
    updated.push("2. Tech and Research");
  }

  if (missing.includes("3. Features and KPIs")) {
    next["3. Features and KPIs"] = [
      "- Core flows from discovery (see Goal §1)",
      "- Role-based access where applicable",
      "- Structured data / uploads where required",
      "- **KPI:** working preview, navigable routes, deployable MVP on Render",
    ].join("\n");
    updated.push("3. Features and KPIs");
  }

  if (missing.includes("4. Pages and navigation")) {
    next["4. Pages and navigation"] =
      routes.length > 0
        ? routes
            .slice(0, 12)
            .map((r) => `- **${r === "/" ? "Home" : r.replace(/^\//, "").replace(/[-_]/g, " ")}** (\`${r}\`)`)
            .join("\n")
        : "- **Home** (`/`)\n- **Dashboard** (`/dashboard`)";
    updated.push("4. Pages and navigation");
  }

  if (missing.includes("5. UI/UX design")) {
    const oneLiner = goal.split("\n").find((l) => l.trim())?.slice(0, 120) || name;
    const research = String(
      next["2. Tech and Research"] ??
        next["2. Text & Search"] ??
        plan["2. Tech Research"] ??
        "",
    ).trim();
    next["5. UI/UX design"] = [
      "- **Theme:** Industry-appropriate palette from §2 competitor research and discovery — **not** Nebulla platform UI (#080A14 / #00D4D4).",
      "- **Typography:** Clear sans-serif hierarchy; accessible contrast; spacing matched to product type",
      "- **Components:** shadcn/ui + Tailwind; nav pattern from §4 (sidebar vs top nav per category norms)",
      `- **Mood:** Purpose-built for **${oneLiner.replace(/\*\*/g, "")}** — mirror leading apps in this space`,
      ...(research
        ? ["- **Research anchor:** use patterns documented in §2 Tech and Research"]
        : ["- **Research anchor:** fill §2 with competitor UX before finalizing colors"]),
      ...(refHint ? ["", "**Brand references (user-provided):**", refHint] : []),
    ].join("\n");
    updated.push("5. UI/UX design");
  }

  const uniq = [...new Set(updated)];
  if (uniq.length === 0) return { updated: [] };

  fs.mkdirSync(path.dirname(opts.masterPlanPath), { recursive: true });
  fs.writeFileSync(opts.masterPlanPath, JSON.stringify(next, null, 2), "utf8");
  return { updated: uniq };
}

/** Discover Next.js app router pages under `app/` and `pages/`. */
export function discoverWorkspaceRoutes(workspaceRoot: string): string[] {
  const routes = new Set<string>();

  const scanApp = (dir: string, segments: string[]) => {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name.startsWith(".") || ent.name === "node_modules") continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        const next =
          ent.name.startsWith("(") && ent.name.endsWith(")")
            ? segments
            : [...segments, ent.name];
        scanApp(full, next);
        continue;
      }
      if (/^page\.(tsx|jsx|js|ts)$/.test(ent.name)) {
        const route = segments.length ? `/${segments.join("/")}` : "/";
        routes.add(route.replace(/\/+/g, "/"));
      }
    }
  };

  scanApp(path.join(workspaceRoot, "app"), []);
  const pagesDir = path.join(workspaceRoot, "pages");
  if (fs.existsSync(pagesDir)) {
    const walkPages = (dir: string, segments: string[]) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        if (ent.name.startsWith(".") || ent.name === "api") continue;
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          walkPages(full, [...segments, ent.name]);
          continue;
        }
        const base = ent.name.replace(/\.(tsx|jsx|js|ts)$/, "");
        if (base === "index") {
          routes.add(segments.length ? `/${segments.join("/")}` : "/");
        } else if (!base.startsWith("_")) {
          routes.add(`/${[...segments, base].join("/")}`.replace(/\/+/g, "/"));
        }
      }
    };
    walkPages(pagesDir, []);
  }

  if (routes.size === 0) routes.add("/");
  return [...routes].sort((a, b) => a.localeCompare(b));
}

export function bootstrapMasterPlanFromWorkspace(opts: {
  workspaceRoot: string;
  masterPlanPath: string;
  projectName: string;
  userNote?: string;
}): { updated: number } {
  const filled = fillMissingMasterPlanSectionsLocal(opts);
  return { updated: filled.updated.length };
}

export function buildMindMapGraphFromRoutes(
  routes: string[],
  projectLabel: string
): { pages: unknown[]; edges: unknown[] } {
  const sorted = routes.length ? routes : ["/"];
  const pages = sorted.map((route, i) => {
    const label =
      route === "/"
        ? projectLabel || "Home"
        : route
            .split("/")
            .filter(Boolean)
            .pop()
            ?.replace(/[-_]/g, " ")
            .replace(/\b\w/g, (c) => c.toUpperCase()) || route;
    return {
      id: `mm-${i}-${route.replace(/\W/g, "_") || "home"}`,
      type: "pageNode",
      position: { x: 80 + i * 200, y: 200 + (i % 2) * 80 },
      data: {
        label,
        isCreated: true,
        isCritical: route === "/" || /dashboard/i.test(route),
        description: `Route: ${route}`,
      },
    };
  });
  const edges = pages.slice(1).map((p, i) => ({
    id: `e-${i}`,
    source: pages[0].id,
    target: (p as { id: string }).id,
    type: "smoothstep",
  }));
  return { pages, edges };
}

export type MindMapPageSpec = { route: string; label: string };

function labelToRoute(label: string): string {
  const raw = label.replace(/\*\*/g, "").trim();
  const lower = raw.toLowerCase().replace(/\s*page\s*$/i, "").trim();
  if (!lower || /^(home|landing|index)$/.test(lower) || lower.includes("landing")) return "/";
  const slug = lower.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug ? `/${slug}` : "/";
}

function routeToLabel(route: string, projectLabel: string): string {
  if (route === "/") return projectLabel || "Home";
  const seg = route.split("/").filter(Boolean).pop() ?? route;
  return seg.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Parse section 4 into page nodes (names + routes). Mind map uses this first. */
export function mindMapPagesFromMasterPlan(
  plan: Record<string, string>,
  projectLabel = "Home"
): MindMapPageSpec[] {
  const section = String(plan["4. Pages and navigation"] ?? "").trim();
  if (!section) return [];
  const specs: MindMapPageSpec[] = [];
  const seen = new Set<string>();

  const add = (label: string, route?: string) => {
    let clean = label.replace(/\*\*/g, "").trim();
    clean = clean.replace(/\s*\([^)]*\)\s*$/g, "").trim();
    if (!clean || clean.length < 2) return;
    if (/^(pages and navigation|navigation|overview)$/i.test(clean)) return;
    const r = (route?.trim() || labelToRoute(clean)).replace(/\/+/g, "/");
    const key = r.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    specs.push({ route: r, label: clean });
  };

  for (const line of section.split("\n")) {
    const boldRoute = line.match(/\*\*([^*]+)\*\*\s*(?:\([^)]*?(`(\/[^`]+)`))?/);
    if (boldRoute) {
      add(boldRoute[1], boldRoute[2]);
      continue;
    }
    const heading = line.match(/^\s*#{2,4}\s+(?:\d+[.)]\s*)?(.+?)\s*$/);
    if (heading) {
      add(heading[1]);
      continue;
    }
    const bullet = line.match(/^\s*[-*•]\s+(.+?)\s*$/);
    if (bullet) {
      const inner = bullet[1];
      const routeInLine = inner.match(/`(\/[^`]+)`/);
      const name = inner.replace(/`[^`]+`/g, "").replace(/\*\*/g, "").trim();
      if (name.length >= 2) add(name, routeInLine?.[1]);
      continue;
    }
    const routeOnly = line.match(/`(\/[^`]+)`/);
    if (routeOnly?.[1]) add(routeToLabel(routeOnly[1], projectLabel), routeOnly[1]);
  }

  const proseRe =
    /\b([A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*){0,4})\s+(?:page|screen|view|dashboard|portal)\b/g;
  let pm: RegExpExecArray | null;
  while ((pm = proseRe.exec(section)) !== null) add(pm[1]);

  return specs;
}

/** Parse `4. Pages and navigation` for route paths like `/dashboard`. */
export function routesFromMasterPlanSection(plan: Record<string, string>): string[] {
  const specs = mindMapPagesFromMasterPlan(plan);
  if (specs.length) return specs.map((s) => s.route);
  const section = String(plan["4. Pages and navigation"] ?? "").trim();
  if (!section) return [];
  const routes = new Set<string>();
  for (const line of section.split("\n")) {
    const backtick = line.match(/`(\/[^`]+)`/);
    if (backtick?.[1]) routes.add(backtick[1].replace(/\/+/g, "/"));
    const bold = line.match(/\*\*(\/[^*]+)\*\*/);
    if (bold?.[1]) routes.add(bold[1].replace(/\/+/g, "/"));
    const plain = line.match(/(?:^|\s)(\/[a-z0-9/_-]+)/i);
    if (plain?.[1] && !plain[1].includes(" ")) routes.add(plain[1].replace(/\/+/g, "/"));
  }
  return [...routes];
}

export function buildMindMapGraphFromPageSpecs(
  specs: MindMapPageSpec[],
  projectLabel: string
): { pages: unknown[]; edges: unknown[] } {
  const list = specs.length ? specs : [{ route: "/", label: projectLabel || "Home" }];
  const pages = list.map((spec, i) => ({
    id: `mm-${i}-${spec.route.replace(/\W/g, "_") || "home"}`,
    type: "pageNode",
    position: { x: 80 + i * 200, y: 200 + (i % 2) * 80 },
    data: {
      label: spec.label,
      isCreated: true,
      isCritical: spec.route === "/" || /dashboard|login/i.test(spec.route),
      description: `Route: ${spec.route}`,
    },
  }));
  const hub = pages[0] as { id: string };
  const edges = pages.slice(1).map((p, i) => ({
    id: `e-${i}`,
    source: hub.id,
    target: (p as { id: string }).id,
    type: "smoothstep",
  }));
  return { pages, edges };
}

export function mergeRoutesForMindMap(
  workspaceRoot: string,
  masterPlanPath: string,
  projectLabel = "Home"
): string[] {
  const plan = readMasterPlanFile(masterPlanPath);
  const specs = mindMapPagesFromMasterPlan(plan, projectLabel);
  if (specs.length > 0) return specs.map((s) => s.route).sort((a, b) => a.localeCompare(b));
  const fromDisk = discoverWorkspaceRoutes(workspaceRoot);
  return fromDisk.length ? fromDisk.sort((a, b) => a.localeCompare(b)) : ["/"];
}

function extractNebulaUiStudioPrompt(workspaceRoot: string): string {
  const fromFile = readV0PromptMarkdown(workspaceRoot);
  if (fromFile) return fromFile;
  const rels = ["nebula-project/nebula-ui-studio.md", "nebula-ui-studio.md"];
  for (const rel of rels) {
    const full = path.join(workspaceRoot, rel);
    if (!fs.existsSync(full)) continue;
    try {
      const raw = fs.readFileSync(full, "utf8");
      const m = raw.match(/<!--\s*NEBULA_UI_STUDIO_PROMPT\s*([\s\S]*?)-->/i);
      const inner = m?.[1]?.trim() ?? "";
      if (inner && !/^no prompt generated yet\.?$/i.test(inner)) return inner;
    } catch {
      /* ignore */
    }
  }
  return "";
}

/** Fill empty Master Plan sections from studio file / section 4 / disk routes. */
export function hydrateMasterPlanDerivedSections(
  workspaceRoot: string,
  plan: Record<string, string>
): { plan: Record<string, string>; changed: boolean } {
  const out = { ...plan };
  let changed = false;

  const pagesSection = String(out["4. Pages and navigation"] ?? "").trim();
  if (!pagesSection) {
    const routes = discoverWorkspaceRoutes(workspaceRoot);
    if (routes.length) {
      out["4. Pages and navigation"] = routes
        .map((r) => `- **${r === "/" ? "Home" : routeToLabel(r, "App")}** (\`${r}\`)`)
        .join("\n");
      changed = true;
    }
  }

  const uiSection = String(out["5. UI/UX design"] ?? "").trim();
  if (!uiSection) {
    const prompt = extractNebulaUiStudioPrompt(workspaceRoot);
    if (prompt) {
      out["5. UI/UX design"] = prompt;
      changed = true;
    } else {
      const goal = String(out["1. Goal of the app"] ?? "").trim();
      const oneLiner =
        goal.split(/\n/).find((l) => l.trim())?.replace(/\*\*/g, "").trim().slice(0, 120) ||
        "App workspace";
      const refHint = summarizeDesignReferencesForPrompt(workspaceRoot, 200);
      out["5. UI/UX design"] = [
        "- **Theme:** Industry-appropriate palette from §2 competitor research — **not** Nebulla platform UI (#080A14 / #00D4D4)",
        "- **Typography:** Clear sans-serif hierarchy; accessible contrast; spacing matched to product type",
        "- **Components:** shadcn/ui + Tailwind; nav pattern from §4 (sidebar vs top nav per category norms)",
        `- **Mood:** Purpose-built for **${oneLiner}** — mirror leading apps in this space`,
        ...(refHint ? ["", "**Brand references (uploaded):**", refHint] : []),
      ].join("\n");
      changed = true;
    }
  }

  return { plan: out, changed };
}

/** Hydrate Master Plan §4/§5 if needed, then write nebula-ui-studio/v0-prompt.md. */
export function syncV0PromptFromMasterPlan(
  workspaceRoot: string,
  masterPlanPath: string,
): { plan: Record<string, string>; content: string; written: boolean } {
  const plan = hydrateAndPersistMasterPlan(workspaceRoot, masterPlanPath);
  const { content, written } = writeV0PromptMarkdown(workspaceRoot, plan);
  return { plan, content, written };
}

export function hydrateAndPersistMasterPlan(
  workspaceRoot: string,
  masterPlanPath: string
): Record<string, string> {
  let plan = readMasterPlanFile(masterPlanPath);
  const { plan: hydrated, changed } = hydrateMasterPlanDerivedSections(workspaceRoot, plan);
  plan = hydrated;
  if (changed) {
    fs.mkdirSync(path.dirname(masterPlanPath), { recursive: true });
    fs.writeFileSync(masterPlanPath, JSON.stringify(plan, null, 2), "utf8");
  }
  return plan;
}

/** Note that Grok wrote app routes — does not fake v0 completion (real v0 still required). */
export function unlockVisualEditorFromWorkspaceCoding(
  workspaceRoot: string,
  _projectName: string
): boolean {
  if (isVisualEditorEligible(workspaceRoot).eligible) return true;
  const hasApp =
    fs.existsSync(path.join(workspaceRoot, "app")) ||
    fs.existsSync(path.join(workspaceRoot, "src")) ||
    fs.existsSync(path.join(workspaceRoot, "pages"));
  if (!hasApp) return false;
  const st = readEditorState(workspaceRoot);
  if (st.workspaceCodingDetected) return true;
  writeEditorState(workspaceRoot, {
    ...st,
    workspaceCodingDetected: true,
    updatedAt: new Date().toISOString(),
  });
  return true;
}

export function syncMindMapFromMasterPlan(opts: {
  workspaceRoot: string;
  masterPlanPath: string;
  projectLabel: string;
}): { pages: unknown[]; edges: unknown[]; written: boolean; routeCount: number } {
  const plan = hydrateAndPersistMasterPlan(opts.workspaceRoot, opts.masterPlanPath);
  const specs = mindMapPagesFromMasterPlan(plan, opts.projectLabel);
  const graph =
    specs.length > 0
      ? buildMindMapGraphFromPageSpecs(specs, opts.projectLabel)
      : buildMindMapGraphFromRoutes(
          mergeRoutesForMindMap(opts.workspaceRoot, opts.masterPlanPath, opts.projectLabel),
          opts.projectLabel
        );

  const target = path.join(opts.workspaceRoot, MIND_MAP_REL);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(graph, null, 2), "utf8");
  const routeCount = specs.length || (Array.isArray(graph.pages) ? graph.pages.length : 0);
  return { ...graph, written: true, routeCount };
}

export function writeBasicUiScaffold(workspaceRoot: string, projectName: string): string[] {
  const written: string[] = [];
  const routes = discoverWorkspaceRoutes(workspaceRoot);
  const title = projectName.trim() || "Nebula App";

  const routeCards = routes
    .map((r) => {
      const label = r === "/" ? "Home" : r;
      return `<a class="card" href="#"><span class="path">${r}</span><strong>${label}</strong><p>Scaffolded route — run <code>npm run dev</code> for live Next.js UI.</p></a>`;
    })
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${title} — Preview</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, sans-serif; background: #0a1628; color: #e2e8f0; min-height: 100vh; }
    header { padding: 1.5rem 2rem; border-bottom: 1px solid rgba(255,255,255,.08); }
    h1 { margin: 0 0 .35rem; font-size: 1.35rem; color: #67e8f9; }
    .sub { color: #94a3b8; font-size: .9rem; max-width: 42rem; line-height: 1.5; }
    main { padding: 1.5rem 2rem 2.5rem; display: grid; gap: 1rem; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
    .card { display: block; padding: 1rem 1.1rem; border-radius: 10px; border: 1px solid rgba(103,232,249,.25); background: rgba(15,23,42,.85); text-decoration: none; color: inherit; transition: border-color .15s; }
    .card:hover { border-color: rgba(103,232,249,.55); }
    .path { font-family: ui-monospace, monospace; font-size: .75rem; color: #64748b; }
    .card strong { display: block; margin: .35rem 0; color: #f1f5f9; }
    .card p { margin: 0; font-size: .8rem; color: #94a3b8; line-height: 1.4; }
    code { background: rgba(0,0,0,.35); padding: .1rem .35rem; border-radius: 4px; font-size: .85em; }
  </style>
</head>
<body>
  <header>
    <h1>${title}</h1>
    <p class="sub">Nebula <strong>basic UI preview</strong> (V0 credits unavailable). Routes detected in your workspace. Use the IDE <strong>Preview</strong> panel or terminal <code>npm run dev</code> for the full app.</p>
  </header>
  <main>${routeCards}</main>
</body>
</html>`;

  const idx = path.join(workspaceRoot, "index.html");
  if (!fs.existsSync(idx) || fs.statSync(idx).size < 200) {
    fs.writeFileSync(idx, html, "utf8");
    written.push("index.html");
  }

  const stylesDir = path.join(workspaceRoot, "public");
  fs.mkdirSync(stylesDir, { recursive: true });
  const previewCopy = path.join(stylesDir, "nebula-basic-preview.html");
  fs.writeFileSync(previewCopy, html, "utf8");
  written.push("public/nebula-basic-preview.html");

  return written;
}

export function ensurePreviewIndexHtml(workspaceRoot: string, projectName: string): boolean {
  const idx = path.join(workspaceRoot, "index.html");
  if (fs.existsSync(idx) && fs.statSync(idx).size > 200) return false;
  writeBasicUiScaffold(workspaceRoot, projectName);
  return true;
}
