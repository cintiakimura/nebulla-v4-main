import fs from "fs";
import path from "path";
import { readV0PromptMarkdown, writeV0PromptMarkdown } from "./nebulaUiStudioPipeline";
import {
  formatPageContractsMarkdown,
  pagesTextHasParseableRoutes,
  pagesForPlanFromGoalAndDisk,
  writeUiBriefMarkdown,
} from "./nebulaUiBrief";
import { summarizeDesignReferencesForPrompt } from "./nebulaDesignReferences";
import {
  isVisualEditorEligible,
  readEditorState,
  writeEditorState,
} from "./visualUiEditorWorkspace";

import { MASTER_PLAN_ALL_KEYS, MASTER_PLAN_USER_SECTION_KEYS, normalizeMasterPlanRecord } from "./masterPlanSections";
import {
  extractGoalFromMemoryMarkdown,
  extractGoalFromUserNote,
  goalSectionNeedsReseed,
  seedGoalOfTheAppSection,
} from "./spineSequenceClient";
import {
  buildConcreteUiuxSection,
  isGenericUiuxBoilerplate,
} from "./uiuxSectionBuilder";
import {
  isNebulaUiGenMockupHtml,
  UI_GEN_MOCKUP_REL,
  workspaceHasCodedAppUi,
} from "./workspaceCodedAppUi";
import {
  projectKeyFromWorkspaceRoot,
  scheduleWorkspaceAbsR2Sync,
  scheduleWorkspaceRelPathsR2Sync,
} from "./nebulaWorkspaceStorage";

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
  return MASTER_PLAN_USER_SECTION_KEYS.filter((k) => {
    const v = String(plan[k] ?? "").trim();
    if (!v || v.length < MIN_MASTER_PLAN_SECTION_CHARS) return true;
    if (k === "5. UI/UX design" && isGenericUiuxBoilerplate(v)) return true;
    return false;
  });
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

  const goalNow = String(next["1. Goal of the app"] ?? "").trim();
  let memoryGoal = "";
  try {
    const memPath = path.join(opts.workspaceRoot, "nebula-project", "fast-prototype-memory.md");
    if (fs.existsSync(memPath)) {
      memoryGoal = extractGoalFromMemoryMarkdown(fs.readFileSync(memPath, "utf8"));
    }
  } catch {
    memoryGoal = "";
  }
  const seededGoal = seedGoalOfTheAppSection(next, [
    extractGoalFromUserNote(note),
    memoryGoal,
    name,
  ]);
  if (seededGoal && goalSectionNeedsReseed(goalNow, note)) {
    next["1. Goal of the app"] = seededGoal;
    updated.push("1. Goal of the app");
  }

  if (missing.includes("2. Tech and Research")) {
    next["2. Tech and Research"] = [
      `- **Category:** ${name} — research 3–10 real competitors and their dominant UX patterns before coding.`,
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
    const goalText = String(next["1. Goal of the app"] ?? goal);
    next["4. Pages and navigation"] = formatPageContractsMarkdown(
      pagesForPlanFromGoalAndDisk(goalText, routes),
      goalText,
    );
    updated.push("4. Pages and navigation");
  }

  if (missing.includes("5. UI/UX design")) {
    const research = String(
      next["2. Tech and Research"] ??
        next["2. Text & Search"] ??
        plan["2. Tech Research"] ??
        "",
    ).trim();
    const pages = String(next["4. Pages and navigation"] ?? plan["4. Pages and navigation"] ?? "");
    const concrete = buildConcreteUiuxSection({
      goal: String(next["1. Goal of the app"] ?? goal),
      pages,
      tech: research,
      projectName: name,
    });
    next["5. UI/UX design"] = [
      concrete,
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

/** §4 field lines — never promote these to Mind Map pages. */
const PAGE_FIELD_LINE_RE =
  /^(purpose|primary[_ ]?actions?|data[_ ]?entities?|data\b|authz|empty[_ ]?state|error[_ ]?state|empty\b|error\b|nav[_ ]?links?|nav\b)\s*:/i;

/** Parse section 4 into page nodes (names + routes). Mind map uses this first. */
export function mindMapPagesFromMasterPlan(
  plan: Record<string, string>,
  projectLabel = "Home"
): MindMapPageSpec[] {
  const section = String(plan["4. Pages and navigation"] ?? "").trim();
  if (!section) return [];
  const specs: MindMapPageSpec[] = [];
  const seen = new Set<string>();

  const add = (label: string, route?: string, requireExplicitRoute = false) => {
    let clean = label.replace(/\*\*/g, "").trim();
    clean = clean.replace(/\s*\([^)]*\)\s*$/g, "").trim();
    if (!clean || clean.length < 2) return;
    if (/^(pages and navigation|navigation|overview)$/i.test(clean)) return;
    if (PAGE_FIELD_LINE_RE.test(clean)) return;
    const explicit = route?.trim();
    if (requireExplicitRoute && !explicit) return;
    const r = (explicit || labelToRoute(clean)).replace(/\/+/g, "/");
    if (!r.startsWith("/")) return;
    const key = r.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    specs.push({ route: r, label: clean.split(/\s+/).slice(0, 6).join(" ") });
  };

  for (const line of section.split("\n")) {
    const boldRoute = line.match(/\*\*([^*]+)\*\*\s*(?:\([^)]*?(`(\/[^`]+)`))?/);
    if (boldRoute) {
      add(boldRoute[1], boldRoute[3] || undefined, Boolean(boldRoute[3]));
      if (boldRoute[3]) continue;
      // bold name without route — only keep if line also has a backtick route elsewhere
      const r = line.match(/`(\/[^`]+)`/);
      if (r) add(boldRoute[1], r[1], true);
      continue;
    }
    const heading = line.match(/^\s*#{2,4}\s+(?:\d+[.)]\s*)?(.+?)\s*$/);
    if (heading) {
      const raw = heading[1];
      const routeIn = raw.match(/`(\/[^`]+)`/);
      const name = raw.replace(/`[^`]+`/g, "").trim();
      // Prefer explicit routes on headings (### Login `/login`)
      add(name || raw, routeIn?.[1], true);
      continue;
    }
    const bullet = line.match(/^\s*[-*•]\s+(.+?)\s*$/);
    if (bullet) {
      const inner = bullet[1];
      if (PAGE_FIELD_LINE_RE.test(inner.replace(/\*\*/g, "").trim())) continue;
      const routeInLine = inner.match(/`(\/[^`]+)`/);
      if (!routeInLine) continue; // do not invent routes from field-like bullets
      const name = inner.replace(/`[^`]+`/g, "").replace(/\*\*/g, "").trim();
      if (name.length >= 2) add(name, routeInLine[1], true);
      continue;
    }
    const routeOnly = line.match(/`(\/[^`]+)`/);
    if (routeOnly?.[1] && !PAGE_FIELD_LINE_RE.test(line.trim())) {
      add(routeToLabel(routeOnly[1], projectLabel), routeOnly[1], true);
    }
  }

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

  const seededGoal = seedGoalOfTheAppSection(out);
  const goalNow = String(out["1. Goal of the app"] ?? "").trim();
  if (seededGoal && goalSectionNeedsReseed(goalNow)) {
    out["1. Goal of the app"] = seededGoal;
    changed = true;
  }

  const pagesSection = String(out["4. Pages and navigation"] ?? "").trim();
  const goal = String(out["1. Goal of the app"] ?? "").trim();
  if (!pagesTextHasParseableRoutes(pagesSection)) {
    const routes = discoverWorkspaceRoutes(workspaceRoot);
    const seeded = pagesForPlanFromGoalAndDisk(goal, routes);
    out["4. Pages and navigation"] = formatPageContractsMarkdown(seeded, goal);
    changed = true;
  }

  const uiSection = String(out["5. UI/UX design"] ?? "").trim();
  if (!uiSection || isGenericUiuxBoilerplate(uiSection)) {
    const prompt = !uiSection ? extractNebulaUiStudioPrompt(workspaceRoot) : "";
    if (prompt && !isGenericUiuxBoilerplate(prompt)) {
      out["5. UI/UX design"] = prompt;
      changed = true;
    } else {
      const pages = String(out["4. Pages and navigation"] ?? "").trim();
      const tech = String(out["2. Tech and Research"] ?? "").trim();
      const refHint = summarizeDesignReferencesForPrompt(workspaceRoot, 200);
      const concrete = buildConcreteUiuxSection({
        goal,
        pages,
        tech,
        projectName: path.basename(workspaceRoot),
      });
      out["5. UI/UX design"] = [
        concrete,
        ...(refHint ? ["", "**Brand references (uploaded):**", refHint] : []),
      ].join("\n");
      changed = true;
    }
  }

  return { plan: out, changed };
}

/** Hydrate Master Plan §4/§5 if needed, then write nebula-ui-studio/v0-prompt.md (legacy distill). */
export function syncV0PromptFromMasterPlan(
  workspaceRoot: string,
  masterPlanPath: string,
): { plan: Record<string, string>; content: string; written: boolean } {
  const plan = hydrateAndPersistMasterPlan(workspaceRoot, masterPlanPath);
  const { content, written } = writeV0PromptMarkdown(workspaceRoot, plan);
  return { plan, content, written };
}

/** Hydrate Master Plan, then write full nebula-ui-studio/ui-brief.md (Phase 3). */
export function syncUiBriefFromMasterPlan(
  workspaceRoot: string,
  masterPlanPath: string,
): { plan: Record<string, string>; content: string; written: boolean; path: string } {
  const plan = hydrateAndPersistMasterPlan(workspaceRoot, masterPlanPath);
  const { content, written, path: rel } = writeUiBriefMarkdown(workspaceRoot, plan);
  return { plan, content, written, path: rel };
}

/**
 * Sync primary ui-brief + optional legacy v0-prompt from current Master Plan.
 * Prefer ui-brief for Studio / UI Gen; v0-prompt remains for optional V0 API.
 */
export function syncUiArtifactsFromMasterPlan(
  workspaceRoot: string,
  masterPlanPath: string,
): {
  plan: Record<string, string>;
  uiBrief: { content: string; written: boolean };
  v0Prompt: { content: string; written: boolean };
} {
  const plan = hydrateAndPersistMasterPlan(workspaceRoot, masterPlanPath);
  const uiBrief = writeUiBriefMarkdown(workspaceRoot, plan);
  const v0Prompt = writeV0PromptMarkdown(workspaceRoot, plan);
  return {
    plan,
    uiBrief: { content: uiBrief.content, written: uiBrief.written },
    v0Prompt: { content: v0Prompt.content, written: v0Prompt.written },
  };
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
    scheduleWorkspaceAbsR2Sync(workspaceRoot, masterPlanPath);
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
}): {
  pages: unknown[];
  edges: unknown[];
  written: boolean;
  routeCount: number;
  /** section4 = exclusive §4; workspace_fallback only when §4 has no parseable pages */
  source: "section4" | "workspace_fallback";
} {
  const plan = hydrateAndPersistMasterPlan(opts.workspaceRoot, opts.masterPlanPath);
  const specs = mindMapPagesFromMasterPlan(plan, opts.projectLabel);
  /** Rule MM-1: when §4 has pages, never invent nodes from workspace routes. */
  let source: "section4" | "workspace_fallback" = "section4";
  const graph =
    specs.length > 0
      ? buildMindMapGraphFromPageSpecs(specs, opts.projectLabel)
      : (() => {
          source = "workspace_fallback";
          return buildMindMapGraphFromRoutes(
            mergeRoutesForMindMap(opts.workspaceRoot, opts.masterPlanPath, opts.projectLabel),
            opts.projectLabel,
          );
        })();

  const target = path.join(opts.workspaceRoot, MIND_MAP_REL);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(
    target,
    JSON.stringify({ version: 1, source, ...graph }, null, 2),
    "utf8",
  );
  const routeCount = specs.length || (Array.isArray(graph.pages) ? graph.pages.length : 0);
  return { ...graph, written: true, routeCount, source };
}

/** Old cyan/navy V0 fallback — rewrite to Nebulla shell tokens. */
export function isLegacyNebulaBasicPreviewHtml(html: string): boolean {
  return /V0 credits unavailable|basic UI preview/i.test(html);
}

export function writeBasicUiScaffold(
  workspaceRoot: string,
  projectName: string,
  opts?: { force?: boolean },
): string[] {
  const written: string[] = [];
  const routes = discoverWorkspaceRoutes(workspaceRoot);
  const title = projectName.trim() || "App";

  const routeCards = routes
    .map((r) => {
      const label = r === "/" ? "Home" : r;
      return `<a class="card" href="#"><span class="path">${r}</span><strong>${label}</strong><p>Route on disk — open in Code, or run <code>npm run dev</code> for the live app.</p></a>`;
    })
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta name="nebulla-preview" content="workspace-routes"/>
  <title>${title} — Preview</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; background: #141414; color: #e8e8e8; min-height: 100vh; font-weight: 400; }
    header { padding: 24px 24px 16px; border-bottom: 1px solid rgba(255,255,255,.12); }
    h1 { margin: 0 0 8px; font-size: 1.25rem; font-weight: 400; letter-spacing: -0.02em; color: #e8e8e8; }
    .sub { color: rgba(232,232,232,.66); font-size: .875rem; max-width: 36rem; line-height: 1.5; font-weight: 300; }
    main { padding: 24px; display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
    .card { display: block; padding: 16px; border-radius: 8px; border: 1px solid rgba(255,255,255,.12); background: #141414; text-decoration: none; color: inherit; }
    .card:hover { border-color: rgba(255,255,255,.18); }
    .path { font-family: ui-monospace, monospace; font-size: .6875rem; letter-spacing: .06em; color: rgba(232,232,232,.45); }
    .card strong { display: block; margin: 8px 0; font-weight: 400; color: #e8e8e8; }
    .card p { margin: 0; font-size: .8125rem; color: rgba(232,232,232,.66); line-height: 1.45; font-weight: 300; }
    code { background: rgba(255,255,255,.06); padding: .1rem .35rem; border-radius: 6px; font-size: .85em; }
  </style>
</head>
<body>
  <header>
    <h1>${title}</h1>
    <p class="sub">Workspace routes on disk. This is not the live app — open a file in Code, or run <code>npm run dev</code>.</p>
  </header>
  <main>${routeCards || '<p class="sub">No routes detected yet.</p>'}</main>
</body>
</html>`;

  const idx = path.join(workspaceRoot, "index.html");
  const existing = fs.existsSync(idx) ? fs.readFileSync(idx, "utf8") : "";
  const coded = workspaceHasCodedAppUi(workspaceRoot);
  const existingIsMockup = existing ? isNebulaUiGenMockupHtml(existing) : false;
  const shouldWrite =
    !coded &&
    !existingIsMockup &&
    (Boolean(opts?.force) ||
      !fs.existsSync(idx) ||
      fs.statSync(idx).size < 200 ||
      isLegacyNebulaBasicPreviewHtml(existing));
  if (shouldWrite) {
    fs.writeFileSync(idx, html, "utf8");
    written.push("index.html");
  }

  const stylesDir = path.join(workspaceRoot, "public");
  fs.mkdirSync(stylesDir, { recursive: true });
  const previewCopy = path.join(stylesDir, "nebula-basic-preview.html");
  fs.writeFileSync(previewCopy, html, "utf8");
  written.push("public/nebula-basic-preview.html");

  const key = projectKeyFromWorkspaceRoot(workspaceRoot);
  if (key) scheduleWorkspaceRelPathsR2Sync(key, workspaceRoot, written);

  return written;
}

export function ensurePreviewIndexHtml(workspaceRoot: string, projectName: string): boolean {
  if (workspaceHasCodedAppUi(workspaceRoot)) return false;
  const mockupAbs = path.join(workspaceRoot, UI_GEN_MOCKUP_REL);
  try {
    if (fs.existsSync(mockupAbs) && fs.statSync(mockupAbs).size > 80) return false;
  } catch {
    /* fall through */
  }
  const idx = path.join(workspaceRoot, "index.html");
  if (fs.existsSync(idx) && fs.statSync(idx).size > 200) {
    const existing = fs.readFileSync(idx, "utf8");
    if (isNebulaUiGenMockupHtml(existing)) return false;
    if (!isLegacyNebulaBasicPreviewHtml(existing)) return false;
  }
  writeBasicUiScaffold(workspaceRoot, projectName, { force: true });
  return true;
}
