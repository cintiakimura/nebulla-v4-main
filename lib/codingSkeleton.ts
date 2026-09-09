/**
 * Coding skeleton contract — classify the job, persist on master-plan.json, clamp Go/apply.
 * Not a new artifact family. Authority: project-workflow.md (order) + this module (coding shape).
 */

import { CODING_SKELETON_KEY, PRE_CODING_SUMMARY_KEY } from "./masterPlanSections";

export type CodingSkeletonKind = "mobile_home" | "web_dashboard" | "landing" | "marketplace";
export type CodingAuth = "none" | "mock";
export type CodingProjectType = "mobile" | "web" | "landing" | "marketplace";

export type CodingEntity = {
  name: string;
  fields: string[];
  owner_role?: string;
};

export type CodingRoute = {
  path: string;
  purpose: string;
  entity?: string;
};

export type CodingSkeleton = {
  skeleton: CodingSkeletonKind;
  project_type: CodingProjectType;
  roles: string[];
  entities: CodingEntity[];
  verbs: string[];
  routes: CodingRoute[];
  auth: CodingAuth;
  out_of_scope: string[];
  source: "classified" | "plan" | "merged";
  skeleton_note?: string;
};

const DEFAULT_OUT_OF_SCOPE = ["supabase", "firebase", "payments", "DNS"];

const KIDS_RE =
  /\b(kids?|child|children|student|learner|teacher|tutor|classroom|school|parent|adhd|reading|lesson|practice)\b/i;
const LANDING_RE =
  /\b(landing|one[- ]?pager|brochure|portfolio|photography|photographer|marketing site)\b/i;
const MARKET_RE =
  /\b(marketplace|e-?commerce|shop|storefront|\bcart\b|catalog|baker|bakery|bread|pastry|pickup order)\b/i;
const DASH_RE = /\b(saas|analytics|admin|dashboard|crm|metrics|backoffice|internal tool)\b/i;

const EXTRA_ADMIN_RE = /^\/(settings|analytics|dashboard|admin)(\/|$)/i;

export function isCodingSkeletonReady(c: CodingSkeleton | null | undefined): boolean {
  if (!c) return false;
  if (!c.skeleton || !c.auth) return false;
  if (!c.roles.length || !c.entities.length || !c.verbs.length || !c.routes.length) return false;
  return c.routes.some((r) => r.path === "/" || r.path.startsWith("/"));
}

export function parseCodingSkeleton(raw: unknown): CodingSkeleton | null {
  if (!raw) return null;
  let obj: unknown = raw;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return null;
    try {
      obj = JSON.parse(t);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  const skeleton = String(o.skeleton || "").trim() as CodingSkeletonKind;
  if (!["mobile_home", "web_dashboard", "landing", "marketplace"].includes(skeleton)) return null;
  const auth = o.auth === "none" || o.auth === "mock" ? o.auth : null;
  if (!auth) return null;
  const roles = asStringList(o.roles);
  const verbs = asStringList(o.verbs);
  const entities = asEntities(o.entities);
  const routes = asRoutes(o.routes);
  const project_type = normalizeProjectType(o.project_type, skeleton);
  const out_of_scope = asStringList(o.out_of_scope);
  const source =
    o.source === "plan" || o.source === "merged" || o.source === "classified" ? o.source : "plan";
  const parsed: CodingSkeleton = {
    skeleton,
    project_type,
    roles,
    entities,
    verbs,
    routes,
    auth,
    out_of_scope: out_of_scope.length ? out_of_scope : [...DEFAULT_OUT_OF_SCOPE],
    source,
    skeleton_note: typeof o.skeleton_note === "string" ? o.skeleton_note : undefined,
  };
  return isCodingSkeletonReady(parsed) ? parsed : null;
}

export function readCodingSkeletonFromPlan(plan: Record<string, unknown> | null | undefined): CodingSkeleton | null {
  if (!plan) return null;
  const fromKey = parseCodingSkeleton(plan[CODING_SKELETON_KEY]);
  if (fromKey) return { ...fromKey, source: "plan" };
  const summary = String(plan[PRE_CODING_SUMMARY_KEY] || "");
  const fenced = summary.match(/CODING_SKELETON_JSON:\s*(\{[\s\S]*?\})(?:\n|$)/);
  if (fenced?.[1]) return parseCodingSkeleton(fenced[1]);
  return null;
}

/** Drop last project's roles/routes when this goal is a different job. */
export function skeletonFitsCurrentGoal(c: CodingSkeleton | null | undefined, goal: string): boolean {
  if (!c) return false;
  const g = String(goal || "");
  if (!g.trim()) return true;
  const kids = KIDS_RE.test(g);
  const market = MARKET_RE.test(g);
  const roles = c.roles.join(" ").toLowerCase();
  if (market && !kids && /teacher|kid|student|tutor|learner/.test(roles)) return false;
  if (kids && c.skeleton === "web_dashboard") return false;
  if (market && /baker|bakery|bread/.test(g) && c.skeleton !== "marketplace") return false;
  return true;
}

export function classifyCodingSkeleton(
  goal: string,
  projectType?: string | null,
  masterPlan?: Record<string, unknown> | null,
): CodingSkeleton {
  const text = [goal, projectType, section(masterPlan, "1. Goal of the app"), section(masterPlan, "3. Features and KPIs")]
    .filter(Boolean)
    .join("\n");
  const existingRaw = readCodingSkeletonFromPlan(masterPlan || undefined);
  const existing = skeletonFitsCurrentGoal(existingRaw, text) ? existingRaw : null;
  const typeHint = String(projectType || "").toLowerCase();

  const kids = KIDS_RE.test(text);
  const landing = LANDING_RE.test(text) || /\blanding\b/.test(typeHint);
  const market = MARKET_RE.test(text);
  const dash = DASH_RE.test(text) && !kids;

  let skeleton: CodingSkeletonKind = "mobile_home";
  if (kids) skeleton = "mobile_home";
  else if (landing && !market) skeleton = "landing";
  else if (market) skeleton = "marketplace";
  else if (dash || /\b(saas|web app|dashboard)\b/.test(typeHint)) skeleton = "web_dashboard";
  else if (/\bmobile\b/.test(typeHint)) skeleton = "mobile_home";

  const fromPlanRoutes = parseRoutesFromSection4(section(masterPlan, "4. Pages and navigation"));
  const built = buildDefaults(skeleton, text, kids);
  const routes = mergeRoutes(fromPlanRoutes, built.routes, skeleton);
  const merged: CodingSkeleton = {
    skeleton,
    project_type: projectTypeFromSkeleton(skeleton),
    roles: uniqueStrings(existing?.roles?.length ? existing.roles : built.roles),
    entities: existing?.entities?.length ? existing.entities : built.entities,
    verbs: uniqueStrings(existing?.verbs?.length ? existing.verbs : built.verbs),
    routes,
    auth: existing?.auth || built.auth,
    out_of_scope: uniqueStrings([...(existing?.out_of_scope || []), ...DEFAULT_OUT_OF_SCOPE]),
    source: existing ? "merged" : "classified",
    skeleton_note: built.skeleton_note,
  };
  return merged;
}

export function mergeCodingSkeletonOntoPlan(
  plan: Record<string, unknown>,
  skeleton: CodingSkeleton,
): Record<string, unknown> {
  const next = { ...plan };
  next[CODING_SKELETON_KEY] = JSON.stringify(skeleton);
  const pages = String(next["4. Pages and navigation"] || "").trim();
  if (pages.length < 40 || !/\//.test(pages)) {
    next["4. Pages and navigation"] = formatSection4FromSkeleton(skeleton);
  }
  const summary = String(next[PRE_CODING_SUMMARY_KEY] || "").trim();
  const appendix = formatCodingSkeletonForGo(skeleton);
  if (!/CODING_SKELETON:/.test(summary)) {
    next[PRE_CODING_SUMMARY_KEY] = [summary, appendix].filter(Boolean).join("\n").slice(0, 2400);
  }
  return next;
}

export function ensureCodingSkeletonOnPlan(
  plan: Record<string, unknown>,
  opts?: { goal?: string; projectType?: string },
): { plan: Record<string, unknown>; skeleton: CodingSkeleton } {
  const goal = String(opts?.goal || section(plan, "1. Goal of the app") || "").trim();
  const existing = readCodingSkeletonFromPlan(plan);
  const reuse = existing && skeletonFitsCurrentGoal(existing, goal);
  const skeleton = reuse ? existing : classifyCodingSkeleton(goal, opts?.projectType, plan);
  const ready = isCodingSkeletonReady(skeleton);
  if (!ready) {
    return { plan, skeleton };
  }
  if (reuse && String(plan[CODING_SKELETON_KEY] || "").trim()) {
    return { plan, skeleton: existing };
  }
  return { plan: mergeCodingSkeletonOntoPlan(plan, skeleton), skeleton };
}

export function formatCodingSkeletonForGo(c: CodingSkeleton): string {
  const routes = c.routes.map((r) => `${r.path} (${r.purpose})`).join(", ");
  return [
    `CODING_SKELETON: ${c.skeleton} auth=${c.auth}`,
    `roles: ${c.roles.join(", ")}`,
    `entities: ${c.entities.map((e) => e.name).join(", ")}`,
    `verbs: ${c.verbs.join(", ")}`,
    `routes: ${routes}`,
    `out_of_scope: ${c.out_of_scope.join(", ")}`,
    "MUST: implement only these routes + shared layout/components/lib. Mockup is not the spec.",
    c.skeleton === "web_dashboard"
      ? "Settings/dashboard allowed for this skeleton."
      : "MUST NOT: /dashboard /settings /analytics /admin unless listed above.",
    "Do not claim the product or Preview is finished after Foundation.",
  ].join("\n");
}

export function primaryVerbFromSkeleton(c: CodingSkeleton | null | undefined): string {
  return String(c?.verbs?.[0] || "practice").trim() || "practice";
}

/** Shared scaffold + listed routes stay; extra admin pages drop unless web_dashboard. */
export function shouldSkipApplyPathForSkeleton(relPath: string, skeleton: CodingSkeleton | null): boolean {
  if (!skeleton) return false;
  const rel = String(relPath || "").replace(/\\/g, "/").replace(/^\.\//, "");
  if (!rel) return true;
  if (isAlwaysAllowedApplyPath(rel)) return false;
  const route = routeFromProductFile(rel);
  if (!route) return false;
  if (contractHasRoute(skeleton, route)) return false;
  if (skeleton.auth === "mock" && isAuthRoute(route)) return false;
  if (EXTRA_ADMIN_RE.test(route) && skeleton.skeleton !== "web_dashboard") return true;
  if (!contractHasRoute(skeleton, route)) return true;
  return false;
}

export function filterBlocksOutsideCodingSkeleton<T extends { relativePath: string }>(
  blocks: T[],
  skeleton: CodingSkeleton | null,
): { kept: T[]; skipped: string[] } {
  if (!skeleton) return { kept: blocks, skipped: [] };
  const kept: T[] = [];
  const skipped: string[] = [];
  for (const b of blocks) {
    if (shouldSkipApplyPathForSkeleton(b.relativePath, skeleton)) {
      skipped.push(b.relativePath.replace(/\\/g, "/"));
      continue;
    }
    kept.push(b);
  }
  return { kept, skipped };
}

export function isAlwaysAllowedApplyPath(rel: string): boolean {
  const p = rel.replace(/\\/g, "/");
  if (/^(package|tsconfig|next\.config|README|\.env)/i.test(p)) return true;
  if (/(^|\/)(layout|template|loading|error|not-found|globals|providers)\./i.test(p)) return true;
  if (/^(components|src\/components|lib|src\/lib)\//i.test(p)) return true;
  if (/(^|\/)((src\/)?app\/api|(src\/)?pages\/api)\//i.test(p)) return true;
  if (/(^|\/)(master-plan\.json|nebula-ui-studio|nebula-project|nebulla-ide)\//i.test(p)) return true;
  if (/^master-plan\.json$/i.test(p)) return true;
  if (/\.(css|md|json)$/i.test(p) && !/(^|\/)app\/.+\/page\./i.test(p)) return true;
  return false;
}

export function routeFromProductFile(rel: string): string | null {
  const p = rel.replace(/\\/g, "/");
  if (/^(?:src\/)?app\/page\.(tsx|jsx|js)$/i.test(p)) return "/";
  const appPage = p.match(/^(?:src\/)?app\/(.+)\/page\.(tsx|jsx|js)$/i);
  if (appPage) return `/${appPage[1].replace(/\/index$/i, "")}`;
  const pages = p.match(/^(?:src\/)?pages\/(.+)\.(tsx|jsx|js)$/i);
  if (pages) {
    const slug = pages[1].replace(/\/index$/i, "").replace(/^index$/i, "");
    return `/${slug.replace(/\[(.+?)\]/g, ":$1")}`;
  }
  return null;
}

function contractHasRoute(c: CodingSkeleton, route: string): boolean {
  const n = normalizeRoute(route);
  return c.routes.some((r) => {
    const cr = normalizeRoute(r.path);
    return cr === n || n.startsWith(`${cr}/`) || cr.startsWith(`${n}/`);
  });
}

function isAuthRoute(route: string): boolean {
  return /^\/(login|auth|signin|sign-in|signup|register|sign-up)$/i.test(normalizeRoute(route));
}

function normalizeRoute(path: string): string {
  const t = String(path || "").trim();
  if (!t || t === "/") return "/";
  return `/${t.replace(/^\/+/, "").replace(/\/+$/, "")}`;
}

function buildDefaults(skeleton: CodingSkeletonKind, text: string, kids: boolean): CodingSkeleton {
  if (skeleton === "landing") {
    return {
      skeleton,
      project_type: "landing",
      roles: ["visitor"],
      entities: [{ name: "Page", fields: ["headline", "proof", "cta"] }],
      verbs: ["view"],
      routes: [{ path: "/", purpose: "Hero + proof + CTA", entity: "Page" }],
      auth: "none",
      out_of_scope: [...DEFAULT_OUT_OF_SCOPE, "dashboard"],
      source: "classified",
      skeleton_note: "Brochure only — no /dashboard.",
    };
  }
  if (skeleton === "marketplace") {
    if (/\b(baker|bakery|bread|pastry|pickup order)\b/i.test(text)) {
      return {
        skeleton,
        project_type: "marketplace",
        roles: ["customer", "baker"],
        entities: [
          { name: "Bread", fields: ["name", "available"], owner_role: "baker" },
          { name: "Order", fields: ["items", "status"], owner_role: "customer" },
        ],
        verbs: ["browse", "order", "mark_ready"],
        routes: [
          { path: "/", purpose: "Today's breads", entity: "Bread" },
          { path: "/order", purpose: "Place pickup order", entity: "Order" },
          { path: "/confirmation", purpose: "Order confirmation", entity: "Order" },
          { path: "/baker", purpose: "Order queue", entity: "Order" },
        ],
        auth: "none",
        out_of_scope: [...DEFAULT_OUT_OF_SCOPE],
        source: "classified",
        skeleton_note: "Bakery: menu + order + baker. No competitor names.",
      };
    }
    return {
      skeleton,
      project_type: "marketplace",
      roles: ["buyer", "seller"],
      entities: [
        { name: "Listing", fields: ["title", "price", "seller"], owner_role: "seller" },
        { name: "Cart", fields: ["items"], owner_role: "buyer" },
      ],
      verbs: ["browse", "checkout"],
      routes: [
        { path: "/", purpose: "Catalog", entity: "Listing" },
        { path: "/product", purpose: "Listing detail", entity: "Listing" },
        { path: "/cart", purpose: "Cart", entity: "Cart" },
      ],
      auth: "mock",
      out_of_scope: [...DEFAULT_OUT_OF_SCOPE],
      source: "classified",
    };
  }
  if (skeleton === "web_dashboard") {
    return {
      skeleton,
      project_type: "web",
      roles: ["admin"],
      entities: [
        { name: "Account", fields: ["email", "role"] },
        { name: "Metric", fields: ["name", "value"] },
      ],
      verbs: ["view", "filter"],
      routes: [
        { path: "/login", purpose: "Sign in", entity: "Account" },
        { path: "/dashboard", purpose: "Metrics home", entity: "Metric" },
        { path: "/settings", purpose: "Thin settings", entity: "Account" },
      ],
      auth: "mock",
      out_of_scope: [...DEFAULT_OUT_OF_SCOPE],
      source: "classified",
    };
  }
  const teacher = /\bteacher|\beducator/i.test(text) || kids;
  return {
    skeleton: "mobile_home",
    project_type: "mobile",
    roles: teacher ? ["kid", "teacher"] : ["user"],
    entities: kids
      ? [
          { name: "Lesson", fields: ["title", "status", "progress"], owner_role: "kid" },
          { name: "Progress", fields: ["child", "score"], owner_role: "teacher" },
        ]
      : [{ name: "Item", fields: ["title", "status"], owner_role: "user" }],
    verbs: kids ? ["practice", "review"] : ["do"],
    routes: teacher
      ? [
          { path: "/", purpose: "Home = next practice (the job)", entity: "Lesson" },
          { path: "/practice", purpose: "Practice session", entity: "Lesson" },
          { path: "/teacher", purpose: "Teacher progress", entity: "Progress" },
        ]
      : [
          { path: "/", purpose: "Home = the job", entity: "Item" },
          { path: "/practice", purpose: "Primary job", entity: "Item" },
        ],
    auth: "mock",
    out_of_scope: [...DEFAULT_OUT_OF_SCOPE, "dashboard"],
    source: "classified",
    skeleton_note: kids
      ? "Home is practice, not login or admin dashboard. Teacher is /teacher, not Home."
      : "Home is the job, not a dashboard.",
  };
}

function formatSection4FromSkeleton(c: CodingSkeleton): string {
  return c.routes
    .map((r) => `### ${r.purpose} \`${r.path}\`\n- purpose: ${r.purpose}\n- entity: ${r.entity || "—"}\n`)
    .join("\n");
}

function parseRoutesFromSection4(pages: string): CodingRoute[] {
  if (!pages.trim()) return [];
  const found = new Set<string>();
  const out: CodingRoute[] = [];
  const re = /`(\/[^`\s]+)`|\/([a-zA-Z][a-zA-Z0-9/_-]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pages))) {
    const raw = m[1] || `/${m[2]}`;
    const path = normalizeRoute(raw);
    if (found.has(path)) continue;
    found.add(path);
    out.push({ path, purpose: path === "/" ? "Home" : path.slice(1) });
  }
  if (/`\/`|\bhome\b/i.test(pages) && !found.has("/")) {
    out.unshift({ path: "/", purpose: "Home" });
  }
  return out;
}

function mergeRoutes(fromPlan: CodingRoute[], defaults: CodingRoute[], skeleton: CodingSkeletonKind): CodingRoute[] {
  const base = fromPlan.length ? fromPlan : defaults;
  const filtered =
    skeleton === "web_dashboard"
      ? base
      : base.filter((r) => !EXTRA_ADMIN_RE.test(normalizeRoute(r.path)));
  if (!filtered.some((r) => normalizeRoute(r.path) === "/")) {
    filtered.unshift(defaults.find((r) => r.path === "/") || { path: "/", purpose: "Home" });
  }
  const seen = new Set<string>();
  return filtered.filter((r) => {
    const n = normalizeRoute(r.path);
    if (seen.has(n)) return false;
    seen.add(n);
    return true;
  });
}

function asStringList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return uniqueStrings(v.map((x) => String(x || "").trim()).filter(Boolean));
}

function asEntities(v: unknown): CodingEntity[] {
  if (!Array.isArray(v)) return [];
  const out: CodingEntity[] = [];
  for (const row of v) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const name = String(o.name || "").trim();
    if (!name) continue;
    out.push({
      name,
      fields: asStringList(o.fields),
      owner_role: typeof o.owner_role === "string" ? o.owner_role : undefined,
    });
  }
  return out;
}

function asRoutes(v: unknown): CodingRoute[] {
  if (!Array.isArray(v)) return [];
  const out: CodingRoute[] = [];
  for (const row of v) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const path = normalizeRoute(String(o.path || ""));
    if (!path) continue;
    out.push({
      path,
      purpose: String(o.purpose || path).trim() || path,
      entity: typeof o.entity === "string" ? o.entity : undefined,
    });
  }
  return out;
}

function uniqueStrings(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const t = raw.trim();
    const key = t.toLowerCase();
    if (!t || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function section(plan: Record<string, unknown> | null | undefined, key: string): string {
  if (!plan) return "";
  return String(plan[key] || "").trim();
}

function projectTypeFromSkeleton(s: CodingSkeletonKind): CodingProjectType {
  if (s === "landing") return "landing";
  if (s === "marketplace") return "marketplace";
  if (s === "web_dashboard") return "web";
  return "mobile";
}

function normalizeProjectType(raw: unknown, skeleton: CodingSkeletonKind): CodingProjectType {
  const t = String(raw || "").toLowerCase();
  if (t === "mobile" || t === "web" || t === "landing" || t === "marketplace") return t;
  return projectTypeFromSkeleton(skeleton);
}
