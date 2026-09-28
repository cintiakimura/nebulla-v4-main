/**
 * Full Build contract — complete Plan, then one thick Go of every §4 route.
 * Mockup is occupancy only. Not autopilot. Not Fast Prototype's 1–2 screen clamp.
 */
import { isCodingSkeletonReady, readCodingSkeletonFromPlan } from "./codingSkeleton";
import {
  BUILD_MODE_PLAN_KEY,
  MASTER_PLAN_SECTION_KEYS,
  normalizeMasterPlanRecord,
} from "./masterPlanSections";
import {
  inferFirstSliceRoutes,
  inferNamedPagesFromSection4,
  seedPagesFromGoal,
  extractNamedRoutesFromPagesText,
} from "./nebulaUiBrief";

export { BUILD_MODE_PLAN_KEY };

export type BuildMode = "full_build" | "fast_prototype";

export type FullBuildGap = {
  code: string;
  message: string;
};

export type FullBuildCompleteness = {
  ok: boolean;
  allowGo: boolean;
  gaps: FullBuildGap[];
  /** One sentence to ask in chat — never "coding" / "Foundation". */
  ask: string | null;
  routes: { name: string; route: string }[];
};

const PLACEHOLDER_RE = /^(tbd|todo|n\/a|none|placeholder|coming soon|\.|\-+)$/i;

const AUTH_STATED_RE =
  /\b(auth(\s+model)?\s*:|who signs in|mock(\s+role)?(\s+switch)?|local(\s+|\/)?mock auth|sign-?in required|login required|parent\/teacher accounts|teacher\/parent accounts|session cookie|magic[-\s]?link)\b/i;

const EMPTY_RE = /\b(empty[_ ]?state|empty:)\b/i;
const ERROR_RE = /\b(error[_ ]?state|error:)\b/i;
const LOADING_RE = /\b(loading[_ ]?state|loading:)\b/i;
const ASSUMPTION_RE = /\bassumption\s*:/i;
const PURPOSE_RE = /\bpurpose\s*:/i;
const ROLES_RE = /\broles?\s*:/i;
const WHO_RE = /\bwho\s*:/i;
const ACTIONS_RE = /\bprimary[_ ]?actions?\s*:/i;
const ACTIONS_LOOSE_RE = /\bactions?\s*:/i;

export function isBuildMode(v: unknown): v is BuildMode {
  return v === "full_build" || v === "fast_prototype";
}

/** Missing / unknown → Full Build. Quick-draft stays only when explicitly stored. */
export function normalizeBuildMode(v: unknown): BuildMode {
  return v === "fast_prototype" ? "fast_prototype" : "full_build";
}

export function detectQuickDraftIntent(text: string): boolean {
  const t = String(text || "").trim();
  if (!t) return false;
  return /\b(fast\s*prototype|quick\s+(draft|prototype)|thin\s+draft|mvp\s+slice|first\s+draft\s+only|quick\s+mvp)\b/i.test(
    t,
  );
}

export function readBuildModeFromPlan(plan: Record<string, unknown> | null | undefined): BuildMode {
  if (!plan || typeof plan !== "object") return "full_build";
  return normalizeBuildMode(plan[BUILD_MODE_PLAN_KEY]);
}

export function writeBuildModeOnPlan(
  plan: Record<string, unknown>,
  mode: BuildMode,
): Record<string, unknown> {
  return { ...plan, [BUILD_MODE_PLAN_KEY]: mode };
}

function sectionText(plan: Record<string, string>, index: number): string {
  const key = MASTER_PLAN_SECTION_KEYS[index - 1];
  return String(plan[key] ?? "").trim();
}

function isThin(text: string, minChars: number): boolean {
  if (!text || text.length < minChars) return true;
  if (PLACEHOLDER_RE.test(text)) return true;
  return false;
}

function goalImpliesRoles(goal: string): { kid: boolean; teacher: boolean; auth: boolean } {
  const g = String(goal || "").toLowerCase();
  const kid = /\b(kids?|child|children|student|learner)\b/.test(g);
  const teacher = /\b(teacher|parent|tutor|classroom|school)\b/.test(g);
  const auth = teacher || /\b(login|sign-?in|account|auth)\b/.test(g);
  return { kid, teacher, auth };
}

export function inferFullBuildRoutes(
  goal: string,
  pagesSection = "",
): { name: string; route: string }[] {
  const fromPlan = inferNamedPagesFromSection4(pagesSection);
  const seeded = seedPagesFromGoal(goal);
  const first = inferFirstSliceRoutes(goal, pagesSection, {
    maxRoutes: 24,
    includeImpliedAuth: true,
  });
  const merged: { name: string; route: string }[] = [];
  const seen = new Set<string>();
  const add = (p: { name: string; route: string }) => {
    const route = p.route.startsWith("/") ? p.route : `/${p.route}`;
    const key = route.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    merged.push({ name: p.name, route });
  };
  for (const p of fromPlan) add(p);
  for (const p of first) add(p);
  const implied = goalImpliesRoles(goal);
  if (fromPlan.filter((p) => p.route !== "/").length === 0) {
    for (const p of seeded) add(p);
  }
  if (implied.kid && implied.teacher) {
    if (!seen.has("/practice")) add({ name: "Practice", route: "/practice" });
    if (!seen.has("/teacher")) add({ name: "Teacher", route: "/teacher" });
  }
  if (implied.auth && !seen.has("/login")) add({ name: "Login", route: "/login" });
  if (!seen.has("/")) merged.unshift({ name: "Home", route: "/" });
  return merged;
}

export function formatFullBuildApplyLine(routes: { name: string; route: string }[]): string {
  const list = routes.length ? routes : [{ name: "Home", route: "/" }];
  return `FULL BUILD APPLY (every §4 route this Go — not a 1–2 screen Foundation clamp): ${list
    .map((p) => `${p.route} → app${p.route === "/" ? "" : p.route}/page.tsx`)
    .join("; ")}. Mockup is occupancy only — do not copy mockup pixels.`;
}

function pageBlocks(s4: string): string[] {
  const text = String(s4 || "").trim();
  if (!text) return [];
  const parts = text.split(/(?=^#{1,4}\s+)/m).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return parts;
  const byRoute = text.split(/(?=\/[A-Za-z0-9_\-][\w\-./]*)/).map((p) => p.trim()).filter(Boolean);
  if (byRoute.length >= 2) return byRoute;
  const byList = text.split(/(?=^[-*•]\s+)/m).map((p) => p.trim()).filter(Boolean);
  if (byList.length >= 2) return byList;
  return [text];
}

function blockHasPurpose(t: string): boolean {
  return PURPOSE_RE.test(t) || /\bthis (page|screen) (is|lets|helps)\b/i.test(t);
}

function blockHasRoles(t: string): boolean {
  return ROLES_RE.test(t) || WHO_RE.test(t);
}

function blockHasActions(t: string): boolean {
  return ACTIONS_RE.test(t) || ACTIONS_LOOSE_RE.test(t);
}

function section4HasRequiredFields(s4: string): boolean {
  return (
    blockHasPurpose(s4) &&
    blockHasRoles(s4) &&
    blockHasActions(s4) &&
    (EMPTY_RE.test(s4) || ASSUMPTION_RE.test(s4)) &&
    (ERROR_RE.test(s4) || ASSUMPTION_RE.test(s4)) &&
    (LOADING_RE.test(s4) || ASSUMPTION_RE.test(s4))
  );
}

function formatFilledPageContract(
  page: { name: string; route: string },
  opts: { goal: string; roles: string[]; purpose?: string; verb?: string },
): string {
  const roles =
    opts.roles.length > 0 ? opts.roles.join(", ") : "assumption: people using this screen";
  const purpose =
    opts.purpose ||
    (page.route === "/"
      ? String(opts.goal || "").replace(/\s+/g, " ").trim().slice(0, 140) ||
        "Primary landing — one clear next action"
      : `Screen for ${page.name.toLowerCase()} — assumption: serves the goal`);
  const action = opts.verb
    ? opts.verb.replace(/_/g, " ")
    : `Continue ${page.name.toLowerCase()}`;
  return [
    `### ${page.name} \`${page.route}\``,
    "",
    `- Purpose: ${purpose}`,
    `- Roles: ${roles}`,
    `- Primary actions: ${action}`,
    `- Auth model: assumption: mock/local (no hosted BaaS)`,
    `- Empty state: assumption: nothing here yet`,
    `- Error state: assumption: could not load — try again`,
    `- Loading state: assumption: brief wait while mock data loads`,
  ].join("\n");
}

/** Rewrite thin / prose §4 into named contracts. Does not invent a product — only fills missing fields. */
export function fillMissingSection4PageFields(opts: {
  section4: string;
  goal: string;
  skeleton?: { roles?: string[]; routes?: { path: string; purpose: string }[]; verbs?: string[] } | null;
}): { section: string; filled: boolean } {
  const s4 = String(opts.section4 || "").trim();
  const goal = String(opts.goal || "").trim();
  const routes = inferFullBuildRoutes(goal, s4);
  const named = extractNamedRoutesFromPagesText(s4);
  if (named.length === 0 && routes.filter((r) => r.route !== "/").length < 1) {
    return { section: s4, filled: false };
  }
  if (s4 && section4HasRequiredFields(s4) && named.length + routes.length > 0) {
    return { section: s4, filled: false };
  }
  const pages = routes.length ? routes : named;
  const roles = (opts.skeleton?.roles || []).map((r) => String(r).trim()).filter(Boolean);
  const skRoutes = opts.skeleton?.routes || [];
  const verbs = opts.skeleton?.verbs || [];
  const next = pages
    .map((p, i) => {
      const sk = skRoutes.find((r) => r.path.toLowerCase() === p.route.toLowerCase());
      return formatFilledPageContract(p, {
        goal,
        roles,
        purpose: sk?.purpose,
        verb: verbs[i] || verbs[0],
      });
    })
    .join("\n\n");
  return { section: next, filled: Boolean(next) && next !== s4 };
}

export function applyFullBuildPlanFill(
  plan: Record<string, unknown> | Record<string, string>,
): { plan: Record<string, unknown>; filled: boolean } {
  const next = { ...(plan as Record<string, unknown>) };
  const s1 = String(next[MASTER_PLAN_SECTION_KEYS[0]] ?? "").trim();
  const s4 = String(next[MASTER_PLAN_SECTION_KEYS[3]] ?? "").trim();
  const skeleton = readCodingSkeletonFromPlan(next);
  const result = fillMissingSection4PageFields({ section4: s4, goal: s1, skeleton });
  let filled = false;
  if (result.filled) {
    next[MASTER_PLAN_SECTION_KEYS[3]] = result.section;
    filled = true;
  }
  const s2Key = MASTER_PLAN_SECTION_KEYS[1];
  const s2 = String(next[s2Key] ?? "");
  if (!AUTH_STATED_RE.test([s1, s2, String(next[MASTER_PLAN_SECTION_KEYS[3]] ?? "")].join("\n"))) {
    const authLine =
      skeleton?.auth === "none"
        ? "Auth model: assumption: no sign-in for this pass (mock/local if we add it)."
        : "Auth model: assumption: mock/local role gates. No hosted BaaS.";
    next[s2Key] = `${s2.trim()}\n${authLine}`.trim();
    filled = true;
  }
  return { plan: next, filled };
}

/**
 * After MASTER_PLAN_INCOMPLETE: fill-missing once, then at most one Go if completeness is OK.
 * A second 409 never auto-Gos.
 */
export function fullBuildIncompleteFollowUp(opts: {
  alreadyFilled: boolean;
  completenessOk: boolean;
}): { fill: boolean; retryGo: boolean } {
  if (!opts.alreadyFilled) return { fill: true, retryGo: false };
  if (opts.completenessOk) return { fill: false, retryGo: true };
  return { fill: false, retryGo: false };
}

export function assessFullBuildCompleteness(opts: {
  plan: Record<string, unknown> | Record<string, string>;
}): FullBuildCompleteness {
  const rawPlan = opts.plan as Record<string, unknown>;
  const plan = normalizeMasterPlanRecord(rawPlan);
  const gaps: FullBuildGap[] = [];
  const s1 = sectionText(plan, 1);
  const s2 = sectionText(plan, 2);
  const s3 = sectionText(plan, 3);
  const s4 = sectionText(plan, 4);
  const s5 = sectionText(plan, 5);
  const combined = [s1, s2, s3, s4, s5].join("\n");
  const routes = inferFullBuildRoutes(s1, s4);

  if (isThin(s1, 24)) {
    gaps.push({ code: "GOAL_EMPTY", message: "§1 Goal is empty — what should the app help someone do?" });
  }
  if (isThin(s2, 24)) {
    gaps.push({ code: "TECH_EMPTY", message: "§2 Tech and Research is empty — add stack defaults (inferred is fine)." });
  }
  if (isThin(s3, 24)) {
    gaps.push({ code: "FEATURES_EMPTY", message: "§3 Features is empty — name the core jobs as verbs." });
  }
  if (isThin(s4, 40) || routes.filter((r) => r.route !== "/").length < 1) {
    gaps.push({
      code: "PAGES_EMPTY",
      message: "§4 needs every product route for this pass, not a single empty Home.",
    });
  }

  const implied = goalImpliesRoles(s1);
  if (implied.kid && implied.teacher) {
    const paths = new Set(routes.map((r) => r.route.toLowerCase()));
    if (!paths.has("/practice") && !paths.has("/teacher")) {
      gaps.push({
        code: "PAGES_ROLES",
        message: "§4 is missing distinct kid practice and teacher routes implied by the goal.",
      });
    } else if (!paths.has("/practice") || !paths.has("/teacher")) {
      gaps.push({
        code: "PAGES_ROLES",
        message: "§4 needs both a kid practice route and a teacher route.",
      });
    }
  }

  const productRoutes = routes.filter((r) => r.route !== "/" && r.route !== "/login");
  if (implied.kid && implied.teacher && productRoutes.length < 2) {
    gaps.push({
      code: "PAGES_THIN",
      message: "§4 lists Home alone — add practice and teacher (and login if people sign in).",
    });
  }

  const blocks = pageBlocks(s4);
  const wholeHasFields = section4HasRequiredFields(s4);

  if (!isThin(s4, 40) && !wholeHasFields) {
    const missingStates = !EMPTY_RE.test(s4) && !ERROR_RE.test(s4) && !LOADING_RE.test(s4) && !ASSUMPTION_RE.test(s4);
    const missingAuth = !AUTH_STATED_RE.test(combined);
    if (missingStates && missingAuth) {
      gaps.push({
        code: "PAGE_STATES_AUTH",
        message:
          "Each §4 page still needs empty / error / loading (or a labeled assumption:) and who signs in (mock/local is OK).",
      });
    } else if (missingStates) {
      gaps.push({
        code: "PAGE_STATES",
        message: "Add one line each for empty, error, and loading on §4 pages — or label assumption: for that state.",
      });
    }
    if (!blockHasPurpose(s4) || !blockHasRoles(s4) || !blockHasActions(s4)) {
      gaps.push({
        code: "PAGE_FIELDS",
        message: "Each §4 page needs name, route, purpose, roles, and primary actions.",
      });
    }
  } else if (wholeHasFields && blocks.length > 1) {
    const weak = blocks.filter(
      (b) =>
        b.length > 20 &&
        (!PURPOSE_RE.test(b) || !ROLES_RE.test(b) || !ACTIONS_RE.test(b)) &&
        !ASSUMPTION_RE.test(b),
    );
    if (weak.length > blocks.length / 2) {
      gaps.push({
        code: "PAGE_FIELDS",
        message: "Some §4 pages are missing purpose, roles, or primary actions.",
      });
    }
  }

  if (!AUTH_STATED_RE.test(combined) && (implied.auth || implied.teacher || /\broles?\b/i.test(s4))) {
    if (!gaps.some((g) => g.code === "PAGE_STATES_AUTH")) {
      gaps.push({
        code: "AUTH_MODEL",
        message: "Who signs in? State the auth model (mock/local is OK) before coding.",
      });
    }
  }

  if (isThin(s5, 24)) {
    gaps.push({ code: "UI_EMPTY", message: "§5 UI/UX is empty — add palette, type, and density (short is fine)." });
  }

  const skeleton = readCodingSkeletonFromPlan(rawPlan);
  if (!isCodingSkeletonReady(skeleton)) {
    gaps.push({
      code: "SKELETON",
      message: "Coding skeleton (routes + entities) is missing from the plan.",
    });
  }

  const ask = gaps[0]?.message || null;
  const allowGo = gaps.length === 0;
  return { ok: allowGo, allowGo, gaps, ask, routes };
}

export function fullBuildGoBlockedMessage(result: FullBuildCompleteness): string {
  const detail = result.ask || "Finish the Plan before coding.";
  return `Stopped: Plan is not complete for Full Build. ${detail} Not coding.`;
}

export function shouldClampToFastPrototypeSlice(mode: BuildMode): boolean {
  return mode === "fast_prototype";
}

export function fullBuildCodingTaskLine(): string {
  return "FULL BUILD — implement every §4 route and the core jobs in this single Go. Mock/local data OK. Mockup is not the spec. File blocks only.";
}
