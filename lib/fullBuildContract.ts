/**
 * Full Build contract — complete Plan, then one thick Go of every §4 route.
 * Mockup is occupancy only. Not autopilot. Not Fast Prototype's 1–2 screen clamp.
 */
import { ensureCodingSkeletonOnPlan, isCodingSkeletonReady, readCodingSkeletonFromPlan, skeletonFitsCurrentGoal } from "./codingSkeleton";
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
import { isReplacementProductBrief, looksLikeStandaloneProductBrief } from "./productGoalFingerprint";

export { BUILD_MODE_PLAN_KEY };

/** Durable lock on master-plan.json — coding reads only this frozen plan. */
export const PLAN_FROZEN_KEY = "planFrozen";
export const PLAN_LOCKED_AT_KEY = "planLockedAt";
/** Set only after wrap + Start this session — skip-chat Full Build requires it. */
export const TALK_WRAP_ACCEPTED_AT_KEY = "talkWrapAcceptedAt";
/** Verbatim wrap (no lock line) — copied into nebula-project/build-packet.md on Start. */
export const TALK_WRAP_TEXT_KEY = "talkWrapText";

export const TALK_CLOSE_QUESTION =
  "Would you like me to start building, or would you like to keep talking?";
export const TALK_CLOSE_QUESTION_LEGACY =
  "If this is what you want, say start. If not, say let’s keep talking.";
export const TALK_CLOSE_QUESTION_LEGACY_OLDER =
  "I think I have what I need. Start building, or add something?";
export const TALK_CLOSE_QUESTION_LEGACY_OLDEST =
  "I think I have everything I need. Anything you want to add?";

/** Imperfect Grok wraps — Start phrases still count (do not require the two-option line). */
const TALK_WRAP_OFFER_RE =
  /would you like me to start building|would you like to keep talking|i think we['’]?ve got what we need|got what we need|here['’]?s what i heard|tell me if this is right|i think i have what i need|i think i have everything i need/i;

export const FIRST_SEED_TALK_CANNED_RE = /I['’]m with you on this\.\s*What do you think\?/i;

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

const COURIER_GOAL_RE = /\b(moto|motodrop|courier|delivery|dropoff|parcel)\b/i;
const EDUCATION_LEFTOVER_ROUTE_RE = /^\/(practice|teacher|parent|learn|lesson|progress)$/i;

/** Leftover kids/education routes must not ride along on a courier/delivery plan. */
export function filterRoutesForCurrentGoal(
  goal: string,
  routes: { name: string; route: string }[],
): { name: string; route: string }[] {
  if (!COURIER_GOAL_RE.test(String(goal || ""))) return routes;
  return routes.filter((p) => {
    const r = p.route.startsWith("/") ? p.route : `/${p.route}`;
    if (EDUCATION_LEFTOVER_ROUTE_RE.test(r)) return false;
    if (/^\/login$/i.test(r)) return false;
    return true;
  });
}

export function pageFileCoversRoute(relPath: string, route: string): boolean {
  const p = String(relPath || "").replace(/\\/g, "/").replace(/^\.\//, "");
  const r = route.startsWith("/") ? route : `/${route}`;
  if (r === "/") {
    return /^(?:src\/)?app\/page\.(tsx|jsx|js)$/i.test(p) || /^pages\/index\.(tsx|jsx|js)$/i.test(p);
  }
  const slug = r.replace(/^\//, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (
    new RegExp(`^(?:src\\/)?app\\/${slug}\\/page\\.(tsx|jsx|js)$`, "i").test(p) ||
    new RegExp(`^(?:src\\/)?pages\\/${slug}\\.(tsx|jsx|js)$`, "i").test(p)
  );
}

export function listMissingFullBuildRoutes(
  expected: { name?: string; route: string }[],
  existingRelPaths: string[],
): { name: string; route: string }[] {
  const paths = (existingRelPaths || []).map((x) => String(x || "").replace(/\\/g, "/"));
  return expected
    .filter((p) => p.route && p.route !== "/")
    .filter((p) => !paths.some((file) => pageFileCoversRoute(file, p.route)))
    .map((p) => ({ name: p.name || p.route.replace(/^\//, ""), route: p.route }));
}

export type InferFullBuildRoutesOpts = {
  /** After wrap+Start — named wrap/§4 screens only. No seedPages / implied /practice /teacher /login. */
  lockToTalkNames?: boolean;
  wrapText?: string;
};

const INVENTED_UNLESS_NAMED_RE = /^\/(dashboard|settings|practice|teacher|parent|progress|nft)$/i;

function wrapBansRoute(wrap: string, route: string): boolean {
  const w = String(wrap || "");
  const slug = route.replace(/^\//, "");
  if (route.toLowerCase() === "/nft" && /\bnft\b/i.test(w)) return true;
  if (INVENTED_UNLESS_NAMED_RE.test(route) && new RegExp(`\\bno\\s+${slug}\\b`, "i").test(w)) {
    return true;
  }
  if (
    /\/(dashboard|settings|nft)/i.test(route) &&
    /\b(out of scope|not in v1|won'?t include|will not include)\b/i.test(w) &&
    new RegExp(`\\b${slug}\\b`, "i").test(w)
  ) {
    return true;
  }
  return false;
}

function extractTalkScreenPhrases(wrap: string): { name: string; route: string }[] {
  const w = String(wrap || "");
  const out: { name: string; route: string }[] = [];
  const seen = new Set<string>();
  const add = (name: string, route: string) => {
    const r = route.startsWith("/") ? route : `/${route}`;
    const key = r.toLowerCase();
    if (seen.has(key) || wrapBansRoute(w, r)) return;
    seen.add(key);
    out.push({ name, route: r });
  };
  if (/\b(public\s+)?listen(?:ing)?\b/i.test(w)) add("Listen", "/listen");
  if (/\b(artist\s+)?login\b|\bsign[\s-]?in\b/i.test(w)) add("Login", "/login");
  return out;
}

/** Screens named in wrap and/or existing §4 — never seedPagesFromGoal extras. */
export function talkLockedRoutes(
  wrapText: string,
  section4: string,
): { name: string; route: string }[] {
  const wrap = stripTalkCloseQuestion(wrapText);
  const fromWrapPaths = extractNamedRoutesFromPagesText(wrap);
  const phrases = extractTalkScreenPhrases(wrap);
  const fromS4 = inferNamedPagesFromSection4(section4);
  const wrapNamed = [...fromWrapPaths, ...phrases];
  const wrapHasScreens = wrapNamed.filter((p) => p.route !== "/").length > 0;
  const source = wrapHasScreens ? wrapNamed : fromS4;
  const merged: { name: string; route: string }[] = [];
  const seen = new Set<string>();
  const add = (p: { name: string; route: string }) => {
    const route = p.route.startsWith("/") ? p.route : `/${p.route}`;
    const key = route.toLowerCase();
    if (seen.has(key) || wrapBansRoute(wrap, route)) return;
    if (wrapHasScreens && INVENTED_UNLESS_NAMED_RE.test(route)) {
      const named =
        fromWrapPaths.some((x) => x.route.toLowerCase() === key) ||
        phrases.some((x) => x.route.toLowerCase() === key);
      if (!named) return;
    }
    const name =
      p.name.split(/\s+/).filter(Boolean).length > 5
        ? route === "/"
          ? "Home"
          : route.replace(/^\//, "").replace(/[-_]/g, " ").replace(/^\w/, (c) => c.toUpperCase())
        : p.name;
    seen.add(key);
    merged.push({ name, route });
  };
  for (const p of source) add(p);
  const wrapNamesHome =
    fromWrapPaths.some((p) => p.route === "/") ||
    /\bhome\b/i.test(wrap) ||
    /`\/`/.test(wrap);
  if (!seen.has("/") && wrapNamesHome) merged.unshift({ name: "Home", route: "/" });
  return merged;
}

export function inferFullBuildRoutes(
  goal: string,
  pagesSection = "",
  opts?: InferFullBuildRoutesOpts,
): { name: string; route: string }[] {
  if (opts?.lockToTalkNames) {
    return talkLockedRoutes(opts.wrapText || "", pagesSection);
  }
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
  if (implied.kid && implied.teacher && !COURIER_GOAL_RE.test(String(goal || ""))) {
    if (!seen.has("/practice")) add({ name: "Practice", route: "/practice" });
    if (!seen.has("/teacher")) add({ name: "Teacher", route: "/teacher" });
  }
  if (implied.auth && !seen.has("/login") && !COURIER_GOAL_RE.test(String(goal || ""))) {
    add({ name: "Login", route: "/login" });
  }
  if (!seen.has("/")) merged.unshift({ name: "Home", route: "/" });
  let out = filterRoutesForCurrentGoal(goal, merged);
  if (COURIER_GOAL_RE.test(String(goal || "")) && out.filter((r) => r.route !== "/").length === 0) {
    for (const p of seeded) {
      const route = p.route.startsWith("/") ? p.route : `/${p.route}`;
      if (!out.some((x) => x.route.toLowerCase() === route.toLowerCase())) {
        out.push({ name: p.name, route });
      }
    }
  }
  return out;
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
  /** Frozen / wrap+Start — existing wrap/§4 names only. */
  lockToNamedOnly?: boolean;
  wrapText?: string;
}): { section: string; filled: boolean } {
  const s4 = String(opts.section4 || "").trim();
  const goal = String(opts.goal || "").trim();
  const routes = opts.lockToNamedOnly
    ? inferNamedPagesFromSection4(s4)
    : inferFullBuildRoutes(goal, s4);
  const named = opts.lockToNamedOnly
    ? inferNamedPagesFromSection4(s4)
    : extractNamedRoutesFromPagesText(s4);
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

function applyTalkLockedPlanFill(
  plan: Record<string, unknown>,
): { plan: Record<string, unknown>; filled: boolean } {
  let next = { ...plan };
  let filled = false;
  const wrap = String(next[TALK_WRAP_TEXT_KEY] ?? "").trim();
  const s1 = String(next[MASTER_PLAN_SECTION_KEYS[0]] ?? "").trim() || wrap;
  const s4Key = MASTER_PLAN_SECTION_KEYS[3];

  const s2Key = MASTER_PLAN_SECTION_KEYS[1];
  const s2fill = fillMissingSection2Tech({
    section2: String(next[s2Key] ?? ""),
    goal: s1,
  });
  if (s2fill.filled) {
    next[s2Key] = s2fill.section;
    filled = true;
  }

  const ensured = ensureCodingSkeletonOnPlan(next, { goal: s1 });
  if (ensured.plan !== next) {
    next = ensured.plan;
    filled = true;
  }

  const s3Key = MASTER_PLAN_SECTION_KEYS[2];
  const features = fillMissingSection3Features({
    section3: String(next[s3Key] ?? "").trim(),
    goal: s1,
  });
  if (features.filled) {
    next[s3Key] = features.section;
    filled = true;
  }

  const result = fillMissingSection4PageFields({
    section4: String(next[s4Key] ?? "").trim(),
    goal: s1,
    lockToNamedOnly: true,
  });
  if (result.filled) {
    next[s4Key] = result.section;
    filled = true;
  }

  const s2 = String(next[s2Key] ?? "");
  if (!AUTH_STATED_RE.test([s1, s2, String(next[s4Key] ?? "")].join("\n"))) {
    next[s2Key] = `${s2.trim()}\nAuth model: assumption: mock/local role gates. No hosted BaaS.`.trim();
    filled = true;
  }

  const s5Key = MASTER_PLAN_SECTION_KEYS[4];
  const s5fill = fillMissingSection5Ui({
    section5: String(next[s5Key] ?? ""),
    goal: s1,
  });
  if (s5fill.filled) {
    next[s5Key] = s5fill.section;
    filled = true;
  }

  return { plan: next, filled };
}

function planLocksTalkRoutes(plan: Record<string, unknown> | Record<string, string>): boolean {
  return (
    isPlanFrozen(plan) ||
    isTalkWrapAccepted(plan) ||
    Boolean(String((plan as Record<string, unknown>)[TALK_WRAP_TEXT_KEY] || "").trim())
  );
}

export function applyFullBuildPlanFill(
  plan: Record<string, unknown> | Record<string, string>,
): { plan: Record<string, unknown>; filled: boolean } {
  if (planLocksTalkRoutes(plan)) {
    return applyTalkLockedPlanFill({ ...(plan as Record<string, unknown>) });
  }
  let next = { ...(plan as Record<string, unknown>) };
  const s1 = String(next[MASTER_PLAN_SECTION_KEYS[0]] ?? "").trim();
  let filled = false;

  const s2Key = MASTER_PLAN_SECTION_KEYS[1];
  const s2fill = fillMissingSection2Tech({
    section2: String(next[s2Key] ?? ""),
    goal: s1,
  });
  if (s2fill.filled) {
    next[s2Key] = s2fill.section;
    filled = true;
  }

  const ensured = ensureCodingSkeletonOnPlan(next, { goal: s1 });
  if (ensured.plan !== next) {
    next = ensured.plan;
    filled = true;
  }
  const skeleton = ensured.skeleton;

  const s3Key = MASTER_PLAN_SECTION_KEYS[2];
  const features = fillMissingSection3Features({
    section3: String(next[s3Key] ?? "").trim(),
    goal: s1,
    skeleton,
  });
  if (features.filled) {
    next[s3Key] = features.section;
    filled = true;
  }

  const s4Key = MASTER_PLAN_SECTION_KEYS[3];
  const result = fillMissingSection4PageFields({
    section4: String(next[s4Key] ?? "").trim(),
    goal: s1,
    skeleton,
  });
  if (result.filled) {
    next[s4Key] = result.section;
    filled = true;
  }

  const s2 = String(next[s2Key] ?? "");
  if (!AUTH_STATED_RE.test([s1, s2, String(next[s4Key] ?? "")].join("\n"))) {
    const authLine =
      skeleton?.auth === "none"
        ? "Auth model: assumption: no sign-in for this pass (mock/local if we add it)."
        : "Auth model: assumption: mock/local role gates. No hosted BaaS.";
    next[s2Key] = `${s2.trim()}\n${authLine}`.trim();
    filled = true;
  }

  const s5Key = MASTER_PLAN_SECTION_KEYS[4];
  const s5fill = fillMissingSection5Ui({
    section5: String(next[s5Key] ?? ""),
    goal: s1,
  });
  if (s5fill.filled) {
    next[s5Key] = s5fill.section;
    filled = true;
  }

  return { plan: next, filled };
}

/**
 * After MASTER_PLAN_INCOMPLETE: fill-missing once more, then stop.
 * Never auto-retry Go (a second 409 must not loop). Completeness OK is handled by fill-before-Go.
 */
export function fullBuildIncompleteFollowUp(opts: {
  alreadyFilled: boolean;
  completenessOk: boolean;
}): { fill: boolean; retryGo: boolean } {
  void opts.completenessOk;
  if (!opts.alreadyFilled) return { fill: true, retryGo: false };
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
  const wrapText = String(rawPlan[TALK_WRAP_TEXT_KEY] || "").trim();
  const wrapAccepted = isTalkWrapAccepted(rawPlan);
  const lockRoutes = wrapAccepted || Boolean(wrapText);
  const routes = inferFullBuildRoutes(s1, s4, lockRoutes ? { lockToTalkNames: true, wrapText } : undefined);

  if (isThin(s1, 24)) {
    gaps.push({ code: "GOAL_EMPTY", message: "§1 Goal is empty — what should the app help someone do?" });
  }
  if (isThin(s2, 24)) {
    gaps.push({ code: "TECH_EMPTY", message: "§2 Tech and Research is empty — add stack defaults (inferred is fine)." });
  }
  if (isThin(s3, 24)) {
    gaps.push({ code: "FEATURES_EMPTY", message: "§3 Features is empty — name the core jobs as verbs." });
  }
  if (!wrapAccepted && (isThin(s4, 40) || routes.filter((r) => r.route !== "/").length < 1)) {
    gaps.push({
      code: "PAGES_EMPTY",
      message: "§4 needs every product route for this pass, not a single empty Home.",
    });
  }

  const implied = goalImpliesRoles(s1);
  const wrapOrPages = `${wrapText}\n${s4}`;
  const wrapOrPagesNames = (route: string) => {
    const slug = route.replace(/^\//, "");
    return (
      wrapOrPages.toLowerCase().includes(route.toLowerCase()) ||
      new RegExp(`\\b${slug}\\b`, "i").test(wrapOrPages)
    );
  };
  if (!wrapAccepted && implied.kid && implied.teacher) {
    const paths = new Set(routes.map((r) => r.route.toLowerCase()));
    const requirePractice = !wrapAccepted || wrapOrPagesNames("/practice");
    const requireTeacher = !wrapAccepted || wrapOrPagesNames("/teacher");
    if (requirePractice || requireTeacher) {
      if (requirePractice && requireTeacher && !paths.has("/practice") && !paths.has("/teacher")) {
        gaps.push({
          code: "PAGES_ROLES",
          message: "§4 is missing distinct kid practice and teacher routes implied by the goal.",
        });
      } else if (requirePractice && !paths.has("/practice")) {
        gaps.push({
          code: "PAGES_ROLES",
          message: "§4 needs a kid practice route named in wrap or §4.",
        });
      } else if (requireTeacher && !paths.has("/teacher")) {
        gaps.push({
          code: "PAGES_ROLES",
          message: "§4 needs a teacher route named in wrap or §4.",
        });
      }
    }
  }

  const productRoutes = routes.filter((r) => r.route !== "/" && r.route !== "/login");
  if (implied.kid && implied.teacher && productRoutes.length < 2 && !wrapAccepted) {
    gaps.push({
      code: "PAGES_THIN",
      message: "§4 lists Home alone — add practice and teacher (and login if people sign in).",
    });
  }

  const blocks = pageBlocks(s4);
  const wholeHasFields = section4HasRequiredFields(s4);

  if (!wrapAccepted && !isThin(s4, 40) && !wholeHasFields) {
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
  } else if (!wrapAccepted && wholeHasFields && blocks.length > 1) {
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

  if (
    !wrapAccepted &&
    !AUTH_STATED_RE.test(combined) &&
    (implied.auth || implied.teacher || /\broles?\b/i.test(s4))
  ) {
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

function fillMissingSection2Tech(opts: { section2: string; goal: string }): { section: string; filled: boolean } {
  const s2 = String(opts.section2 || "").trim();
  if (!isThin(s2, 24)) return { section: s2, filled: false };
  return {
    section: [
      "Mobile/web Next.js App Router, TypeScript. Inferred stack.",
      "Auth model: assumption: mock/local role gates. No hosted BaaS.",
      "assumption: no live competitor search this pass.",
    ].join("\n"),
    filled: true,
  };
}

function fillMissingSection5Ui(opts: { section5: string; goal: string }): { section: string; filled: boolean } {
  const s5 = String(opts.section5 || "").trim();
  if (!isThin(s5, 24)) return { section: s5, filled: false };
  const courier = COURIER_GOAL_RE.test(String(opts.goal || ""));
  return {
    section: [
      courier ? "Mood street, high contrast, mobile-first." : "Mood calm, readable, one accent.",
      "Palette #111111 #F5C518 #F7F7F5. Typography sans. Density comfortable.",
      "assumption: inferred tokens — correct if they named a different vibe.",
    ].join("\n"),
    filled: true,
  };
}

/** Fill empty §3 from the confirmed goal — labeled assumptions, not a new product. */
export function fillMissingSection3Features(opts: {
  section3: string;
  goal: string;
  skeleton?: { verbs?: string[] } | null;
}): { section: string; filled: boolean } {
  const s3 = String(opts.section3 || "").trim();
  if (!isThin(s3, 24)) return { section: s3, filled: false };
  const goal = String(opts.goal || "").replace(/\s+/g, " ").trim();
  if (COURIER_GOAL_RE.test(goal)) {
    return {
      section: [
        "Request pickup — client books a same-day parcel.",
        "Accept job — driver claims an open request.",
        "Track — client and driver see last-known mock location.",
        "Pay — mock payment at drop-off.",
        "Rate — both parties rate after delivery.",
        "assumption: labels and mock/local data only (no live payments or GPS).",
      ].join("\n"),
      filled: true,
    };
  }
  const verbs = (opts.skeleton?.verbs || []).map((v) => String(v).replace(/_/g, " ").trim()).filter(Boolean);
  const verbLine =
    verbs.length > 0
      ? verbs.map((v) => v.charAt(0).toUpperCase() + v.slice(1)).join(", ")
      : goal.slice(0, 160) || "the core jobs named in §1";
  return {
    section: [
      `Core jobs: ${verbLine}.`,
      "assumption: inferred from the confirmed goal — correct if a job is missing.",
    ].join("\n"),
    filled: true,
  };
}

/** Client Go note for Full Build — every §4 `file:` block; index.html is not success. */
export function fullBuildGoUserNote(
  plan?: Record<string, unknown> | null,
  existingRelPaths: string[] = [],
): string {
  const goal = String(plan?.["1. Goal of the app"] || "");
  const s4 = String(plan?.["4. Pages and navigation"] || "");
  const wrap = String(plan?.[TALK_WRAP_TEXT_KEY] || "").trim();
  const lock = isTalkWrapAccepted(plan) || Boolean(wrap);
  const routes = inferFullBuildRoutes(goal, s4, lock ? { lockToTalkNames: true, wrapText: wrap } : undefined);
  const missing = listMissingFullBuildRoutes(routes, existingRelPaths);
  const apply = missing.length > 0 ? missing : routes;
  return [
    formatFullBuildApplyLine(apply),
    "START_CODING — Full Build. Reply is ONLY ```file:relative/path``` blocks plus one short note. No Press Go. No plan essay.",
    fullBuildCodingTaskLine(),
    "Minimum: ```file:app/layout.tsx``` + ```file:app/page.tsx``` + ```file:app/<route>/page.tsx``` for every §4 route.",
    missing.length
      ? `STILL MISSING (do not skip because Home exists): ${missing.map((r) => r.route).join(" ")}`
      : "",
    "BAN: leftover /practice /teacher /parent. BAN: only public/index.html, only nebula-ui-studio/*, only mockup HTML.",
  ]
    .filter(Boolean)
    .join("\n");
}

export const FULL_BUILD_NO_RETRY_ACTIVITY =
  "Stopped: Code returned no product file blocks. Not retrying Foundation+Primary — not asking you to type go again.";

/** After persist + assessFullBuildCompleteness — never gate on the pre-fill draft. */
export const FULL_BUILD_INCOMPLETE_STOP =
  "Stopped: Master Plan still incomplete after persist (§§1–5 / usable §4) — Full Build will not start.";

export function formatFullBuildIncompleteStop(detail?: string): string {
  const d = String(detail || "").replace(/\s+/g, " ").trim();
  if (!d) return FULL_BUILD_INCOMPLETE_STOP;
  return `Stopped: architecture inputs incomplete (${d}) — Full Build will not start.`;
}

const SEED_WHO_RE = /\b(client|driver|rider|customer|kid|teacher|parent|user|sender|buyer|seller|courier|brand|creator)\b/i;
const SEED_JOB_RE =
  /\b(request|pickup|accept|track|pay|rate|practice|deliver|book|order|dropoff|parcel)\b/i;

/** Seed already names who + a job — FAST LANE must write the Plan, not skip chat. */
export function seedAlreadyHasWhoAndJob(text: string): boolean {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (t.length < 24) return false;
  if (looksLikeStandaloneProductBrief(t)) return true;
  return SEED_WHO_RE.test(t) && SEED_JOB_RE.test(t);
}

function collectSeedTokens(re: RegExp, text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const r = new RegExp(re.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = r.exec(text))) {
    const w = String(m[1] || m[0] || "").toLowerCase();
    if (!w || seen.has(w)) continue;
    seen.add(w);
    out.push(w);
  }
  return out;
}

/** Spoken helper only — must not replace a Grok talk turn on an unfrozen plan. */
export function formatFullBuildFirstSpokenLine(seed: string): string {
  const t = String(seed || "").replace(/\s+/g, " ").trim();
  const roles = collectSeedTokens(SEED_WHO_RE, t).slice(0, 3);
  const jobs = collectSeedTokens(SEED_JOB_RE, t).slice(0, 3);
  const roleBit = roles.length ? roles.join(", ") : "your users";
  const jobBit = jobs.length ? jobs.join(", ") : "the job you named";
  return `Got it — ${roleBit} + ${jobBit}. I'll draft the plan from your brief and build a first version.`;
}

export function isPlanFrozen(
  plan: Record<string, unknown> | Record<string, string> | null | undefined,
): boolean {
  if (!plan || typeof plan !== "object") return false;
  const rec = plan as Record<string, unknown>;
  if (rec[PLAN_FROZEN_KEY] === true || rec[PLAN_FROZEN_KEY] === "true") return true;
  return Boolean(String(rec[PLAN_LOCKED_AT_KEY] || "").trim());
}

export function isTalkWrapAccepted(
  plan: Record<string, unknown> | Record<string, string> | null | undefined,
): boolean {
  if (!plan || typeof plan !== "object") return false;
  return Boolean(String((plan as Record<string, unknown>)[TALK_WRAP_ACCEPTED_AT_KEY] || "").trim());
}

export function markTalkWrapAccepted(
  plan: Record<string, unknown> | Record<string, string>,
  wrapText?: string,
): Record<string, unknown> {
  const next = { ...(plan as Record<string, unknown>) };
  if (!String(next[TALK_WRAP_ACCEPTED_AT_KEY] || "").trim()) {
    next[TALK_WRAP_ACCEPTED_AT_KEY] = new Date().toISOString();
  }
  const wrap = String(wrapText || next[TALK_WRAP_TEXT_KEY] || "").trim();
  if (wrap) next[TALK_WRAP_TEXT_KEY] = wrap.slice(0, 4000);
  return next;
}

/** Start only: wrap → TALK_WRAP_TEXT_KEY + §1; §4 = wrap/Talk names only. */
export function looksLikeUnsafeTalkGoal(text: string): boolean {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return true;
  if (isTalkLockProgressLine(t)) return true;
  if (FIRST_SEED_TALK_CANNED_RE.test(t) && t.length < 160) return true;
  if (/here are (some |a few )?(product )?names\b/i.test(t)) return true;
  if (/\bname ideas\b|\bsuggest(ed)? names\b|\bcould call (it|this)\b/i.test(t)) return true;
  if (/\b(lumen learn|quill path)\b/i.test(t) && /\b(or|option|names?|brainstorm)\b/i.test(t)) return true;
  if (/\b\/practice\b/i.test(t) && /\b\/teacher\b/i.test(t) && !/\b(quiet cues|aqua bell)\b/i.test(t)) {
    return true;
  }
  return false;
}

/** “I agree” / name brainstorm / market — Talk only, never skip-chat Full Build. */
export function isTalkPartnerStayOpen(text: string): boolean {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return false;
  if (/^(i agree|agreed)[\s.!?]*$/i.test(t)) return true;
  if (/\bsuggest( some)? names\b/i.test(t)) return true;
  if (/\bwhat(?:'s| is) on the market\b/i.test(t)) return true;
  return false;
}

export function isTalkSlotLockTurn(text: string): boolean {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return false;
  if (isTalkStartBuildingPhrase(t) || isTalkKeepTalking(t) || isTalkPartnerStayOpen(t)) return false;
  if (/^(yes|yeah|yep|yup|good|that['’]?s enough|that is enough|that['’]?s it|love it|perfect)[\s.!?]*$/i.test(t)) {
    return true;
  }
  if (/\b(that['’]?s the name|locked the name)\b/i.test(t)) return true;
  if (/\bvibe\b/i.test(t) && t.split(/\s+/).length <= 12) return true;
  return false;
}

/** Talk persist: wrap → §1; features → §3; screens → §4; vibe → §5. Never name-idea dumps. */
export function applyTalkSlotPersist(
  plan: Record<string, unknown> | Record<string, string>,
  opts: { userText: string; assistantText: string },
): Record<string, unknown> {
  const next = { ...(plan as Record<string, unknown>) };
  const asst = stripTalkCloseQuestion(opts.assistantText);
  if (looksLikeUnsafeTalkGoal(asst) && !isTalkWrapDisplayText(asst)) return next;
  if (
    isTalkSlotLockTurn(opts.userText) &&
    asst &&
    !looksLikeUnsafeTalkGoal(asst) &&
    (isTalkWrapDisplayText(asst) || lastAssistantOfferedTalkClose(asst))
  ) {
    const handed = applyApprovedWrapHandoff(next, asst);
    return applyFullBuildPlanFill(handed).plan;
  }
  return next;
}

/** Go kick: wrap+Start freeze on disk, or a live Start phrase. Compact Go notes are not Start. */
export function planAllowsGoCodeKick(
  plan: Record<string, unknown> | null | undefined,
  userText: string,
): boolean {
  if (isPlanFrozen(plan) && isTalkWrapAccepted(plan)) return true;
  return shouldStartGoAfterTalk({ plan, userText, seedText: userText });
}

/** Start only: wrap → TALK_WRAP_TEXT_KEY + §1; §4 = wrap/Talk names only. */
export function applyApprovedWrapHandoff(
  plan: Record<string, unknown> | Record<string, string>,
  wrapText: string,
): Record<string, unknown> {
  const wrap = stripTalkCloseQuestion(wrapText).replace(/\s+/g, " ").trim();
  const next = { ...(plan as Record<string, unknown>) };
  if (!wrap || looksLikeUnsafeTalkGoal(wrap)) return next;
  next[TALK_WRAP_TEXT_KEY] = wrap.slice(0, 4000);
  next[MASTER_PLAN_SECTION_KEYS[0]] = wrap.slice(0, 4000);
  const s4Key = MASTER_PLAN_SECTION_KEYS[3];
  const locked = talkLockedRoutes(wrap, "");
  if (locked.filter((p) => p.route !== "/").length > 0) {
    const stub = locked.map((p) => `### ${p.name} \`${p.route}\``).join("\n");
    const filled = fillMissingSection4PageFields({
      section4: stub,
      goal: wrap,
      lockToNamedOnly: true,
    });
    next[s4Key] = filled.section || stub;
  }
  return next;
}

/** Sets lock flag + timestamp. Does not change §§1–5. Does not mark wrap+Start. */
export function freezePlan(
  plan: Record<string, unknown> | Record<string, string>,
): Record<string, unknown> {
  const next = { ...(plan as Record<string, unknown>) };
  next[PLAN_FROZEN_KEY] = true;
  if (!String(next[PLAN_LOCKED_AT_KEY] || "").trim()) {
    next[PLAN_LOCKED_AT_KEY] = new Date().toISOString();
  }
  return next;
}

export function planAllowsGoAfterFill(
  plan: Record<string, unknown> | Record<string, string> | null | undefined,
): boolean {
  if (!plan || typeof plan !== "object") return false;
  if (assessFullBuildCompleteness({ plan }).allowGo) return true;
  const filled = applyFullBuildPlanFill({ ...(plan as Record<string, unknown>) });
  return assessFullBuildCompleteness({ plan: filled.plan }).allowGo;
}

export function lastAssistantOfferedTalkClose(text: string): boolean {
  const s = String(text || "");
  if (!s.trim()) return false;
  if (FIRST_SEED_TALK_CANNED_RE.test(s) && !TALK_WRAP_OFFER_RE.test(s) && !s.includes(TALK_CLOSE_QUESTION)) {
    return false;
  }
  return (
    s.includes(TALK_CLOSE_QUESTION) ||
    s.includes(TALK_CLOSE_QUESTION_LEGACY) ||
    s.includes(TALK_CLOSE_QUESTION_LEGACY_OLDER) ||
    s.includes(TALK_CLOSE_QUESTION_LEGACY_OLDEST) ||
    TALK_WRAP_OFFER_RE.test(s)
  );
}

export function stripTalkCloseQuestion(text: string): string {
  return String(text || "")
    .replace(TALK_CLOSE_QUESTION, "")
    .replace(TALK_CLOSE_QUESTION_LEGACY, "")
    .replace(TALK_CLOSE_QUESTION_LEGACY_OLDER, "")
    .replace(TALK_CLOSE_QUESTION_LEGACY_OLDEST, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** “Let’s keep talking” / keep talking / talk — stay Talk, never Start. */
export function isTalkKeepTalking(text: string): boolean {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  return /^(let['’]?s keep talking|keep talking|talk)[\s.!?]*$/i.test(t);
}

/** Question / research / hurry / wait / “No, I’m not saying…” — Talk only; never Go. */
export function isTalkStayOpenUserTurn(text: string): boolean {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return false;
  if (isTalkKeepTalking(t)) return true;
  if (isTalkPartnerStayOpen(t)) return true;
  if (isTalkStartBuildingPhrase(t)) return false;
  if (/^(no|nope|nah|não)[\s.!?]*$/i.test(t)) return true;
  if (isTalkContinueNotLock(t)) return true;
  if (/\?/.test(t)) return true;
  if (/\b(suggest|research|hurry|together|wait)\b/i.test(t)) return true;
  if (/\b(i want to add|add something|not yet)\b/i.test(t)) return true;
  if (/^(add)[\s.!?]*$/i.test(t)) return true;
  return false;
}

/** Questions / shaping / “No, I’m not saying…” — Talk only; never a Start answer. */
export function isTalkContinueNotLock(text: string): boolean {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return false;
  if (isTalkKeepTalking(t)) return true;
  if (talkMessageHasStartAccept(t) && t.split(/\s+/).filter(Boolean).length <= 12) return false;
  if (/^(no|nope|nah|não)[\s.!?]*$/i.test(t)) return true;
  if (/^(no|não)\b/i.test(t) && t.length > 6) return true;
  if (/\bi('?m| am) not saying\b/i.test(t)) return true;
  if (
    /\b(do you know|is there|how (do|can|would|should|to)|what (if|about|do you think)|suggest|example|i don'?t know)\b/i.test(
      t,
    )
  ) {
    return true;
  }
  if (/\?/.test(t)) return true;
  if (t.split(/\s+/).filter(Boolean).length > 8) return true;
  return false;
}

/** Rush / apology — no lock sentence this turn. */
export function isTalkRepairTurn(text: string): boolean {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return false;
  if (/\b(you'?re rushing|stop rushing|too (fast|quick|rushed)|slow down|don'?t rush)\b/i.test(t)) {
    return true;
  }
  if (/\bsorry\b/i.test(t) && !/\b(start|build|go|lock)\b/i.test(t)) return true;
  return false;
}

/** After freeze: Talk (or a later small pass) — never skip-chat Full Build. */
export function isPostFreezeTalkRequest(text: string): boolean {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return false;
  if (/\?/.test(t)) return true;
  if (/\bimprov(e|ing)\b[\s\S]{0,48}\b(ui|ux)\b/i.test(t)) return true;
  if (/\bui\s*\/\s*ux\b/i.test(t)) return true;
  if (/\badd (a |another |new )?page\b/i.test(t)) return true;
  return false;
}

export function isTalkWrapUserTurn(text: string): boolean {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return false;
  if (isTalkStayOpenUserTurn(t) || isTalkRepairTurn(t)) return false;
  return /\b(skip (the )?(talk|chat|summary)|wrap (this )?up)\b/i.test(t);
}

/** Assistant recap/wrap — stamp the two-option close. Mid-feature “What do you think?” is not this. */
export function isTalkWrapDisplayText(text: string): boolean {
  const t = String(text || "").trim();
  if (!t) return false;
  if (FIRST_SEED_TALK_CANNED_RE.test(t) && t.replace(/\s+/g, " ").length < 160) return false;
  if (
    /locked the name|here['’]?s what i (heard|got)|got what we need|before we wrap|wrap this up|\brecap\b/i.test(
      t,
    )
  ) {
    return true;
  }
  if (/anything else (you want to add|you['’]?d like to add|to add|to tweak)/i.test(t)) return true;
  const endsWdyt = /what do you think\??\s*$/i.test(t);
  const lines = t.split(/\n/).map((l) => l.trim()).filter(Boolean);
  if (endsWdyt && (lines.length >= 4 || t.length >= 240)) return true;
  return false;
}

/** Lock footer at wrap only, once, never on turn 1 / questions / repair. */
export function applyTalkCloseDisplayPolicy(
  displayText: string,
  opts: {
    userText: string;
    priorAssistantTexts: string[];
    isFirstAssistantReply: boolean;
    planAllowsGo: boolean;
    planFrozen: boolean;
  },
): string {
  let text = String(displayText || "");
  const lastPrior = [...(opts.priorAssistantTexts || [])].reverse().find((p) => String(p || "").trim()) || "";
  const lastOffered = lastAssistantOfferedTalkClose(lastPrior);
  const startPick = isTalkStartBuildingPhrase(opts.userText);
  const wrapDisplay = isTalkWrapDisplayText(text) || isTalkWrapUserTurn(opts.userText);
  const blocked =
    opts.planFrozen ||
    opts.isFirstAssistantReply ||
    isTalkStayOpenUserTurn(opts.userText) ||
    isTalkRepairTurn(opts.userText) ||
    isTalkKeepTalking(opts.userText) ||
    startPick ||
    /\bsorry\b/i.test(text);
  if (
    lastOffered ||
    startPick ||
    (opts.priorAssistantTexts || []).some((p) => lastAssistantOfferedTalkClose(p))
  ) {
    text = text
      .replace(FIRST_SEED_TALK_CANNED_RE, "")
      .replace(/I['’]ve updated the project quietly[\s\S]*/i, "")
      .replace(/^Got it\.?\s*$/i, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  if (blocked || lastOffered || !wrapDisplay) {
    text = stripTalkCloseQuestion(text);
  }
  if (wrapDisplay && !blocked && !lastOffered) {
    text = stripBannedTalkCloseEndings(text);
    if (!text.includes(TALK_CLOSE_QUESTION)) {
      text = `${text.trim()}\n\n${TALK_CLOSE_QUESTION}`.trim();
    }
  }
  return text;
}

function stripBannedTalkCloseEndings(text: string): string {
  let t = stripTalkCloseQuestion(text).replace(FIRST_SEED_TALK_CANNED_RE, "").trim();
  const trailing = [
    /\n*what do you think\??\s*$/i,
    /\n*tell me if this is right\.?\s*$/i,
    /\n*ready to start\??\s*$/i,
    /\n*is there anything else\??\s*$/i,
    /\n*anything else you want to add or tweak before we wrap this up\??\s*$/i,
    /\n*(is there )?anything else( you['’]?d | you want )?(to add|to tweak|to change)[\s\S]{0,80}\?\s*$/i,
  ];
  let prev = "";
  while (t !== prev) {
    prev = t;
    for (const re of trailing) t = t.replace(re, "").trim();
  }
  return t.replace(/\n{3,}/g, "\n\n").trim();
}

const TALK_START_ACCEPT_RE =
  /^(yes[,.]?\s*)?(please\s+)?((you can|go ahead and) start( building)?|start( building)?|would like me to start( building)?)[\s.!?]*$/i;

export function isTalkStartBuildingPhrase(text: string): boolean {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t || /\bcoding\b/i.test(t)) return false;
  if (TALK_START_ACCEPT_RE.test(t)) return true;
  if (/^(yes[,.]?\s+)?start building[\s.!?]*$/i.test(t)) return true;
  if (/^you can start building[\s.!?]*$/i.test(t)) return true;
  const words = t.split(/\s+/).filter(Boolean).length;
  if (words <= 10 && /\bwould like me to start\b/i.test(t)) return true;
  return false;
}

/** Grok lock/progress line — not the product wrap. */
export function isTalkLockProgressLine(text: string): boolean {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return false;
  return (
    /locking the plan/i.test(t) ||
    /starting the build now/i.test(t) ||
    /^plan is saved\b/i.test(t) ||
    /^understood\b.{0,40}lock/i.test(t)
  );
}

/** Bare “go” after a lock attempt — IDE Go, not a new Talk beat. */
export function isTalkStartRetryNudge(text: string): boolean {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t || /\bcoding\b/i.test(t)) return false;
  return /^(go)[\s.!?]*$/i.test(t);
}

/** Last real wrap (skip lock-progress / canned / Got it). */
export function lastTalkWrapFromThread(assistantTexts: string[]): string {
  for (let i = (assistantTexts || []).length - 1; i >= 0; i--) {
    const raw = String(assistantTexts[i] || "").trim();
    if (!raw) continue;
    if (isTalkLockProgressLine(raw)) continue;
    if (/^got it\.?$/i.test(raw)) continue;
    if (FIRST_SEED_TALK_CANNED_RE.test(raw) && raw.replace(/\s+/g, " ").length < 120) continue;
    if (/updated the project quietly/i.test(raw)) continue;
    const plain = stripTalkCloseQuestion(raw);
    if (!plain) continue;
    if (lastAssistantOfferedTalkClose(raw) || plain.length >= 40) return plain;
  }
  return "";
}

function talkMessageHasStartAccept(text: string): boolean {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (isTalkStartBuildingPhrase(t)) return true;
  if (/\bstart building\b/i.test(t) || /\byou can start\b/i.test(t) || /\bgo ahead and start\b/i.test(t)) {
    return true;
  }
  return /^(no|nope|nah|não)[,.\s]+start[\s.!?]*$/i.test(t);
}

export function shouldOpenTalkTurn(opts: {
  plan: Record<string, unknown> | null | undefined;
  seedText?: string;
  userText?: string;
  lastAssistantText?: string;
}): boolean {
  const plan = opts.plan && typeof opts.plan === "object" ? opts.plan : null;
  const live = String(opts.userText || "").trim();
  const seed = String(opts.userText || opts.seedText || "").trim();
  const goal = String(plan?.["1. Goal of the app"] || "").trim();
  if (seed && goal && isReplacementProductBrief(seed, goal)) return true;
  if (isTalkStartBuildingPhrase(live)) return false;
  if (
    isTalkStartRetryNudge(live) &&
    (isTalkLockProgressLine(String(opts.lastAssistantText || "")) ||
      lastAssistantOfferedTalkClose(String(opts.lastAssistantText || "")))
  ) {
    return false;
  }
  if (isTalkStayOpenUserTurn(live) || isTalkRepairTurn(live) || isPostFreezeTalkRequest(live)) {
    return true;
  }
  if (
    userAcceptedTalkClose(opts.userText || "", { lastAssistantText: opts.lastAssistantText }) &&
    planAllowsGoAfterFill(plan)
  ) {
    return false;
  }
  if (!isPlanFrozen(plan)) return true;
  return false;
}

export function userSaidTalkReady(text: string): boolean {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return false;
  return /\bhave everything we need\b/i.test(t) && !/\bnot\b.{0,20}everything we need/i.test(t);
}

export function userAcceptedTalkClose(
  text: string,
  opts?: { lastAssistantText?: string; lastAssistantOfferedTalkClose?: boolean },
): boolean {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return false;
  if (isTalkKeepTalking(t)) return false;
  if (isTalkStartBuildingPhrase(t)) return true;
  if (isTalkStayOpenUserTurn(t) || isTalkRepairTurn(t) || isTalkContinueNotLock(t)) {
    return false;
  }
  const offered =
    lastAssistantOfferedTalkClose(opts?.lastAssistantText || "") ||
    opts?.lastAssistantOfferedTalkClose === true ||
    userSaidTalkReady(t);
  if (!offered) return false;
  if (/\bSTART_CODING\b/i.test(t)) return true;
  if (talkMessageHasStartAccept(t) && /^(no|nope|nah|não)\b/i.test(t)) return true;
  if (userSaidTalkReady(t) && talkMessageHasStartAccept(t) && !/\bcoding\b/i.test(t)) return true;
  return false;
}

/** Plan tabs / architecture apply only after Start — not on the first seed dump. */
export function mayPersistMasterPlanFromChat(opts: {
  userText: string;
  lastAssistantText?: string;
  lastAssistantOfferedTalkClose?: boolean;
}): boolean {
  return userAcceptedTalkClose(opts.userText, opts);
}

export function shouldStartGoAfterTalk(opts: {
  plan: Record<string, unknown> | null | undefined;
  userText: string;
  seedText?: string;
  lastAssistantText?: string;
  lastAssistantOfferedTalkClose?: boolean;
  priorAssistantTexts?: string[];
}): boolean {
  const plan = opts.plan && typeof opts.plan === "object" ? opts.plan : null;
  const live = String(opts.userText || "").trim();
  const seed = String(opts.userText || opts.seedText || "").trim();
  const goal = String(plan?.["1. Goal of the app"] || "").trim();
  if (seed && goal && isReplacementProductBrief(seed, goal)) return false;
  if (isTalkKeepTalking(live)) return false;
  const wrapInChat = lastTalkWrapFromThread([
    ...(opts.priorAssistantTexts || []),
    String(opts.lastAssistantText || ""),
  ]);
  if (isTalkStartBuildingPhrase(live)) {
    return true;
  }
  if (isTalkStartRetryNudge(live)) {
    return Boolean(
      lastAssistantOfferedTalkClose(String(opts.lastAssistantText || "")) ||
        isTalkLockProgressLine(String(opts.lastAssistantText || "")) ||
        (opts.priorAssistantTexts || []).some((p) => lastAssistantOfferedTalkClose(p) || isTalkLockProgressLine(p)) ||
        (isPlanFrozen(plan) && isTalkWrapAccepted(plan)),
    );
  }
  if (
    isTalkStayOpenUserTurn(live) ||
    isTalkRepairTurn(live) ||
    isPostFreezeTalkRequest(live) ||
    isTalkContinueNotLock(live)
  ) {
    return false;
  }
  const acceptOpts = {
    lastAssistantText: opts.lastAssistantText,
    lastAssistantOfferedTalkClose: opts.lastAssistantOfferedTalkClose,
  };
  if (isPlanFrozen(plan) && isTalkWrapAccepted(plan)) return true;
  if (!userAcceptedTalkClose(opts.userText, acceptOpts)) {
    return false;
  }
  if (wrapInChat) return true;
  if (!plan) return false;
  return planAllowsGoAfterFill(plan);
}

/**
 * Skip Grok talk only after wrap + Start this session (talkWrapAcceptedAt).
 * Frozen seed-only plans without wrap stay in Talk. Replacement briefs talk again.
 */
export function shouldSkipGrokChatForExistingPlan(opts: {
  plan: Record<string, unknown> | null | undefined;
  seedText: string;
  userText?: string;
}): boolean {
  const plan = opts.plan && typeof opts.plan === "object" ? opts.plan : null;
  if (!plan) return false;
  if (!isPlanFrozen(plan) || !isTalkWrapAccepted(plan)) return false;
  const live = String(opts.userText || "").trim();
  if (
    live &&
    (isPostFreezeTalkRequest(live) ||
      isTalkStayOpenUserTurn(live) ||
      isTalkRepairTurn(live) ||
      isTalkKeepTalking(live) ||
      isTalkPartnerStayOpen(live) ||
      isTalkContinueNotLock(live))
  ) {
    return false;
  }
  const fb = assessFullBuildCompleteness({ plan });
  if (!fb.allowGo) return false;
  const seed = String(opts.seedText || "").trim();
  const goal = String(plan["1. Goal of the app"] || "").trim();
  const sk = readCodingSkeletonFromPlan(plan);
  if (seed && !skeletonFitsCurrentGoal(sk, seed)) return false;
  if (seed && goal && isReplacementProductBrief(seed, goal)) return false;
  return true;
}
