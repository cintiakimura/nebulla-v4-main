/**
 * Canonical Master Plan sections (5 user-facing tabs).
 * Tab 6 is internal (Environment Setup) — not shown in the Master Plan UI.
 */

export const MASTER_PLAN_SECTION_KEYS = [
  "1. Goal of the app",
  "2. Tech and Research",
  "3. Features and KPIs",
  "4. Pages and navigation",
  "5. UI/UX design",
] as const;

export const MASTER_PLAN_INTERNAL_KEY = "6. Environment Setup";

/** Written by Go / go-code before Grok Code runs — shown in Master Plan UI. */
export const PRE_CODING_SUMMARY_KEY = "Pre-coding summary (Grok)";

/** User-facing tabs (Master Plan UI) — section 6 is internal/env. */
export const MASTER_PLAN_USER_SECTION_KEYS = [...MASTER_PLAN_SECTION_KEYS] as const;

/** Legacy JSON keys → canonical keys when reading master-plan.json */
export const MASTER_PLAN_LEGACY_KEY_ALIASES: Record<string, string> = {
  "2. Tech Research": "2. Tech and Research",
  "2. Text & Search": "2. Tech and Research",
  "2. Tech & Research": "2. Tech and Research",
};

export const MASTER_PLAN_ALL_KEYS = [
  ...MASTER_PLAN_SECTION_KEYS,
  MASTER_PLAN_INTERNAL_KEY,
] as const;

const ORCHESTRATION_DUMP_RE =
  /Project Execution Rules|INITIAL ONBOARDING|START_CODING|AUTOMATED WORKFLOW|TAB \d HIDDEN RULES/i;

const SECTION_META: { index: number; titlePattern: string }[] = [
  { index: 1, titlePattern: "Goal of the app" },
  { index: 2, titlePattern: "(?:Tech\\s+and\\s+Research|Tech\\s*&\\s*Research|Text\\s*&\\s*Search|Tech\\s*Research)" },
  { index: 3, titlePattern: "Features and KPIs" },
  { index: 4, titlePattern: "Pages and navigation" },
  { index: 5, titlePattern: "UI\\/UX design" },
  { index: 6, titlePattern: "Environment Setup" },
];

const LINE_HEADING_RE =
  /^\s{0,3}(?:#{1,4}\s*)?(\d)\.\s*(Goal of the app|Tech\s+and\s+Research|Tech\s*&\s*Research|Text\s*&\s*Search|Tech\s*Research|Features and KPIs|Pages and navigation|UI\/UX design|Environment Setup)\s*$/i;

export function masterPlanKeyForTabIndex(tabIndex: number): string | undefined {
  if (tabIndex >= 1 && tabIndex <= MASTER_PLAN_SECTION_KEYS.length) {
    return MASTER_PLAN_SECTION_KEYS[tabIndex - 1];
  }
  if (tabIndex === 6) return MASTER_PLAN_INTERNAL_KEY;
  return undefined;
}

/** Normalize stored plan object to canonical section keys. */
export function normalizeMasterPlanRecord(
  raw: Record<string, unknown>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v !== "string") continue;
    const canonical = MASTER_PLAN_LEGACY_KEY_ALIASES[k] ?? k;
    if (MASTER_PLAN_ALL_KEYS.includes(canonical as (typeof MASTER_PLAN_ALL_KEYS)[number])) {
      const prev = out[canonical]?.trim();
      const next = v.trim();
      if (!prev || next.length > prev.length) out[canonical] = next;
    }
  }
  return out;
}

function stripOrchestrationDump(content: string): string | null {
  const t = content.trim();
  if (!t) return null;
  if (ORCHESTRATION_DUMP_RE.test(t)) return null;
  return t;
}

/** Parse a Master Plan block into tab indices 1–6. */
export function parseMasterPlanBlock(block: string): Partial<Record<number, string>> {
  const trimmed = block.trim();
  if (!trimmed) return {};

  const byLines = parseByLineHeadings(trimmed);
  const byRegex = parseBySectionRegex(trimmed);
  const merged = mergeParsedSections(byLines, byRegex);

  if (Object.keys(merged).length <= 1 && looksLikeMonolithicDump(merged[1])) {
    const rescued = parseBySectionRegex(merged[1] ?? trimmed);
    return mergeParsedSections(merged, rescued);
  }

  return merged;
}

function parseByLineHeadings(block: string): Partial<Record<number, string>> {
  const lines = block.split("\n");
  const out: Partial<Record<number, string>> = {};
  let current: number | null = null;

  for (const line of lines) {
    const m = line.match(LINE_HEADING_RE);
    if (m) {
      current = Number(m[1]);
      if (current >= 1 && current <= 6 && !out[current]) out[current] = "";
      continue;
    }
    if (current) out[current] = `${out[current] ?? ""}${line}\n`;
  }

  return sanitizeParsedSections(out);
}

function parseBySectionRegex(block: string): Partial<Record<number, string>> {
  const out: Partial<Record<number, string>> = {};

  for (let i = 0; i < SECTION_META.length; i++) {
    const { index, titlePattern } = SECTION_META[i];
    const next = SECTION_META[i + 1];
    const header = `(?:#{1,4}\\s*|\\*{2}\\s*)?${index}\\.\\s*${titlePattern}`;
    const nextHeader = next
      ? `(?:#{1,4}\\s*|\\*{2}\\s*)?${next.index}\\.\\s*${next.titlePattern}`
      : "$";
    const re = new RegExp(
      `${header}[\\s\\S]*?(?=${nextHeader})`,
      "i"
    );
    const match = block.match(re);
    if (!match) continue;
    let body = match[0]
      .replace(new RegExp(`^\\s*(?:#{1,4}\\s*|\\*{2}\\s*)?${index}\\.\\s*${titlePattern}`, "i"), "")
      .trim();
    body = body.replace(/^[:\-\s]+/, "").trim();
    const clean = stripOrchestrationDump(body);
    if (clean) out[index] = clean;
  }

  return out;
}

function mergeParsedSections(
  a: Partial<Record<number, string>>,
  b: Partial<Record<number, string>>
): Partial<Record<number, string>> {
  const out: Partial<Record<number, string>> = { ...a };
  for (let i = 1; i <= 6; i++) {
    const fromB = b[i]?.trim();
    if (!fromB) continue;
    const fromA = out[i]?.trim() ?? "";
    if (!fromA || fromB.length > fromA.length * 1.15) out[i] = fromB;
  }
  return sanitizeParsedSections(out);
}

function sanitizeParsedSections(
  raw: Partial<Record<number, string>>
): Partial<Record<number, string>> {
  const out: Partial<Record<number, string>> = {};
  for (let i = 1; i <= 6; i++) {
    const clean = stripOrchestrationDump(raw[i] ?? "");
    if (clean) out[i] = clean;
  }
  return out;
}

function looksLikeMonolithicDump(section1?: string): boolean {
  if (!section1 || section1.length < 400) return false;
  return /(?:^|\n)\s*(?:#{1,4}\s*)?[2-5]\.\s*(?:Text\s*&\s*Search|Tech\s*Research|Features|Pages|UI)/im.test(
    section1
  );
}

export function masterPlanSectionSeparationRules(): string {
  return `
MASTER PLAN SECTION SEPARATION (mandatory inside <START_MASTERPLAN>…</END_MASTERPLAN>):
- Use exactly these five section headers, each on its own line (### prefix recommended):
  ### 1. Goal of the app
  ### 2. Tech and Research
  ### 3. Features and KPIs
  ### 4. Pages and navigation
  ### 5. UI/UX design
- Put content ONLY under the matching section. Never dump Tabs 2–5 into "1. Goal of the app".
- Section 1 = product goal, users, problem, scope only.
- Section 2 = Mandatory Research Pillars 1–3: **8–12 real competitors** (actual names), ranked most-used features, evidence/studies (or exact phrase "No supporting studies found for this feature.").
- Section 3 = features list with KPIs (from Pillar 2 ranking).
- Section 4 = every page at developer depth: exact name, purpose, roles, sections, every important button + action, nav method, features on page, key data displayed/collected, routes (e.g. \`/dashboard\`) — drives Mind Map. Vague pages forbidden.
- Section 5 = concrete visual direction from Pillar 4 + target user (palette, type, density, nav, components) — drives Nebula UI Studio / v0. No vague-only "modern/clean/user-friendly".
- Mind Map uses Section 4 only. v0 UI generation uses §2 research + Section 5 primarily (plus concise §4 routes in v0-prompt.md).
`.trim();
}

const MIN_SECTION_CHARS = 80;
const RESEARCH_HINT_RE =
  /competitor|research|study|studies|feature|ui\/ux|navigation|pillar|supporting/i;
const EVIDENCE_HINT_RE =
  /no supporting studies|stud(?:y|ies)|statistic|case study|evidence|research shows|data (?:shows|suggests)/i;
const PROJECT_TYPE_RE = /\b(web\s*app|mobile\s*app|landing\s*page)\b/i;
const ROUTE_HINT_RE = /`\/[^`]+`|(?:^|[\s(])\/[a-z0-9][\w/-]*/i;
const UI_CONCRETE_RE =
  /#[0-9a-fA-F]{3,8}\b|\b(?:palette|typography|font|sidebar|bottom\s*nav|nav(?:igation)?|density|shadcn|tailwind)\b/i;
/** Stopwords that inflate capitalized-name competitor heuristics. */
const COMPETITOR_NAME_STOP = new Set([
  "The",
  "And",
  "For",
  "With",
  "From",
  "This",
  "That",
  "App",
  "Goal",
  "Tech",
  "Research",
  "Features",
  "Pages",
  "Navigation",
  "Project",
  "Type",
  "Web",
  "Mobile",
  "Landing",
  "Page",
  "User",
  "Users",
  "Most",
  "Used",
  "Common",
  "Important",
  "Supporting",
  "Studies",
  "Found",
  "Feature",
  "Module",
  "Core",
]);
/** At least a few capitalized product-like names (real competitors, not fluff). */
const COMPETITOR_NAME_HINT_RE =
  /\b([A-Z][a-zA-Z0-9]{2,}(?:\s+[A-Z][a-zA-Z0-9]{2,}){0,2})\b/g;

/**
 * True when the saved Master Plan is solid enough to skip full Discovery:
 * all five user sections present with substance, Project Type in §1,
 * §2 research pillars (competitors + evidence), §4 routes, §5 concrete UI.
 */
export function isMasterPlanCompleteForDiscovery(
  raw: Record<string, unknown> | null | undefined,
): boolean {
  if (!raw || typeof raw !== "object") return false;
  const n = normalizeMasterPlanRecord(raw);
  for (const key of MASTER_PLAN_SECTION_KEYS) {
    const body = (n[key] || "").trim();
    if (body.length < MIN_SECTION_CHARS) return false;
  }
  const goal = (n["1. Goal of the app"] || "").trim();
  const hasProjectType = PROJECT_TYPE_RE.test(goal) || /project\s*type/i.test(goal);

  const research = (n["2. Tech and Research"] || "").trim();
  if (research.length < 200) return false;
  if (!RESEARCH_HINT_RE.test(research)) return false;
  if (!EVIDENCE_HINT_RE.test(research)) return false;
  const names = research.match(COMPETITOR_NAME_HINT_RE) || [];
  const uniq = new Set(
    names.map((s) => s.trim()).filter((s) => !COMPETITOR_NAME_STOP.has(s.split(/\s+/)[0] || "")),
  );
  const hasCompetitorSignal =
    uniq.size >= 4 ||
    (/\b(competitors?|competitive)\b/i.test(research) && uniq.size >= 2);
  if (!hasCompetitorSignal) return false;

  const pages = (n["4. Pages and navigation"] || "").trim();
  const routeHits = pages.match(new RegExp(ROUTE_HINT_RE.source, "gi")) || [];
  if (routeHits.length < 2) return false;

  const ui = (n["5. UI/UX design"] || "").trim();
  if (!UI_CONCRETE_RE.test(ui)) return false;

  // Prefer explicit Project Type; allow strong legacy research plans without it.
  if (!hasProjectType && !(research.length >= 350 && uniq.size >= 5)) return false;
  return true;
}

