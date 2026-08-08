/**
 * Master Plan completeness validator (Phase C).
 * Authority: nebula-project/project-execution-rules.md
 *
 * MASTER_PLAN_STRICT=off|warn|strict (default: off)
 *
 * Pure module (no fs) so the browser can import discovery helpers safely.
 * Disk ui-brief checks: `masterPlanCompletenessIo.ts`.
 */
import {
  MASTER_PLAN_SECTION_KEYS,
  normalizeMasterPlanRecord,
} from "./masterPlanSections";
import {
  AUTH_MODEL_RE,
  NEEDS_AUTH_RE,
  SECURITY_MARKERS_RE,
  SECURITY_NEGATED_RE,
  sectionHasSecurityBaseline,
} from "./securityBaselinePropose";

export type MasterPlanStrictMode = "off" | "warn" | "strict";

export type MasterPlanGapSeverity = "warn" | "block";

export type MasterPlanGap = {
  code: string;
  section: string;
  severity: MasterPlanGapSeverity;
  message: string;
  remediation: string;
};

export type MasterPlanShape = "complete" | "legacy" | "incomplete";

export type MasterPlanCompletenessResult = {
  ok: boolean;
  mode: MasterPlanStrictMode;
  shape: MasterPlanShape;
  gaps: MasterPlanGap[];
  /** Whether Go / coding should proceed under the current mode. */
  allowGo: boolean;
  sectionLengths: Record<string, number>;
};

const PLACEHOLDER_RE =
  /^(tbd|todo|n\/a|none|placeholder|coming soon|\.|\-+)$/i;

/** Backtick paths, or plain `/…` allowing digit/underscore first segment (`/2fa`, `/_secret`). */
const ROUTE_RE = /`(\/[^`\s]+)`|(\/[A-Za-z0-9_][\w\-./:{}\*]*)/g;

const PII_RE =
  /\b(pii\s*:|personal data\s*:|minimize|no logging of (tokens|secrets))\b/i;

const PAGE_FIELD_HINTS_RE =
  /\b(purpose|primary[_ ]?actions?|data[_ ]?entities?|authz|empty[_ ]?state|error[_ ]?state|nav[_ ]?links?|roles?)\b/i;

const HEX_RE = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/;
const TYPO_RE = /\b(typography|font|sans|serif|inter|geist|typeface)\b/i;
const DENSITY_RE = /\b(density|spacing|compact|comfortable|spacious)\b/i;

const KPI_HINT_RE =
  /\b(kpi|%|percent|under \d|<\s*\d|seconds?|minutes?|zero |≥|<=|>=|measurable|testable)\b/i;

export function readMasterPlanStrictMode(
  env: NodeJS.ProcessEnv = process.env,
): MasterPlanStrictMode {
  const raw = String(env.MASTER_PLAN_STRICT ?? "off")
    .trim()
    .toLowerCase();
  if (raw === "warn" || raw === "strict" || raw === "off") return raw;
  return "off";
}

function gap(
  code: string,
  section: string,
  severity: MasterPlanGapSeverity,
  message: string,
  remediation: string,
): MasterPlanGap {
  return { code, section, severity, message, remediation };
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

function countRoutes(section4: string): number {
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(ROUTE_RE.source, "g");
  while ((m = re.exec(section4)) !== null) {
    const r = (m[1] || m[2] || "").trim();
    if (r.startsWith("/")) found.add(r.split(/\s/)[0]!);
  }
  return found.size;
}

function lineCount(text: string): number {
  return text.split(/\r?\n/).filter((l) => l.trim()).length;
}

export type AssessMasterPlanOptions = {
  /** Raw or normalized plan record */
  plan: Record<string, unknown> | Record<string, string>;
  mode?: MasterPlanStrictMode;
  /** When true, require uiBriefLength >= 80 (IO must supply the length). */
  checkUiBrief?: boolean;
  /** Character length of nebula-ui-studio/ui-brief.md (from IO layer). */
  uiBriefLength?: number;
};

/**
 * Pure assessment of Master Plan completeness.
 * Always computes gaps; `allowGo` / `ok` depend on MASTER_PLAN_STRICT mode.
 */
export function assessMasterPlanCompleteness(
  opts: AssessMasterPlanOptions,
): MasterPlanCompletenessResult {
  const mode = opts.mode ?? readMasterPlanStrictMode();
  const plan = normalizeMasterPlanRecord(opts.plan as Record<string, unknown>);
  const gaps: MasterPlanGap[] = [];
  const sectionLengths: Record<string, number> = {};

  for (const key of MASTER_PLAN_SECTION_KEYS) {
    sectionLengths[key] = String(plan[key] ?? "").trim().length;
  }

  const s1 = sectionText(plan, 1);
  const s2 = sectionText(plan, 2);
  const s3 = sectionText(plan, 3);
  const s4 = sectionText(plan, 4);
  const s5 = sectionText(plan, 5);
  const combined = [s1, s2, s3, s4, s5].join("\n");

  if (isThin(s1, 40)) {
    gaps.push(
      gap(
        "GOAL_EMPTY",
        "1. Goal of the app",
        "block",
        "Goal section is empty or placeholder-level.",
        "State purpose, users, and in/out of scope.",
      ),
    );
  }

  if (isThin(s2, 80)) {
    gaps.push(
      gap(
        "RESEARCH_THIN",
        "2. Tech and Research",
        "block",
        "Tech and Research is too thin for architecture-first planning.",
        "Add project type, 8–12 real competitors, features, evidence, UI patterns.",
      ),
    );
  } else {
    const competitorHints = (s2.match(/\b[A-Z][A-Za-z0-9][A-Za-z0-9.+&\-]{1,30}\b/g) || [])
      .length;
    if (competitorHints < 4 && !/\bcompetitors?\b/i.test(s2)) {
      gaps.push(
        gap(
          "RESEARCH_THIN",
          "2. Tech and Research",
          "warn",
          "Research pillars look weak (few named competitors).",
          "List 8–12 real competitor product names with ranked features.",
        ),
      );
    }
  }

  if (isThin(s3, 40)) {
    gaps.push(
      gap(
        "FEATURES_EMPTY",
        "3. Features and KPIs",
        "block",
        "Features and KPIs missing or placeholder.",
        "List MVP features as verbs and at least one testable KPI.",
      ),
    );
  } else if (!KPI_HINT_RE.test(s3)) {
    gaps.push(
      gap(
        "KPI_UNTESTABLE",
        "3. Features and KPIs",
        "warn",
        "KPIs look like slogans rather than testable measures.",
        "Add measurable KPIs (time, %, pass/fail access tests).",
      ),
    );
  }

  const routeCount = countRoutes(s4);
  if (isThin(s4, 40) || routeCount < 1) {
    gaps.push(
      gap(
        "PAGES_EMPTY",
        "4. Pages and navigation",
        "block",
        "Pages section has no real `/routes`.",
        "Add every page with route, purpose, actions, authz, empty/error, nav.",
      ),
    );
  } else {
    if (!PAGE_FIELD_HINTS_RE.test(s4) && s4.length < 400) {
      gaps.push(
        gap(
          "PAGES_THIN",
          "4. Pages and navigation",
          "block",
          "§4 lists routes but lacks page contracts (actions/authz/states).",
          "For each page include purpose, primary_actions, data_entities, authz, empty_state, error_state, nav_links.",
        ),
      );
    } else if (!PAGE_FIELD_HINTS_RE.test(s4)) {
      gaps.push(
        gap(
          "PAGE_MISSING_ACTIONS",
          "4. Pages and navigation",
          "warn",
          "§4 may be missing explicit page-field labels (authz, empty/error, actions).",
          "Use the required §4 page fields from project-execution-rules.md.",
        ),
      );
    }
  }

  if (isThin(s5, 40)) {
    gaps.push(
      gap(
        "UI_TOKENS_MISSING",
        "5. UI/UX design",
        "block",
        "UI/UX design tokens missing.",
        "Add mood, palette (hex), typography, density, radius, motion, component style (≤15–25 lines).",
      ),
    );
  } else {
    if (!HEX_RE.test(s5) || !TYPO_RE.test(s5) || !DENSITY_RE.test(s5)) {
      gaps.push(
        gap(
          "UI_TOKENS_MISSING",
          "5. UI/UX design",
          "warn",
          "§5 should include palette (hex), typography, and density.",
          "Keep §5 to 15–25 lines of concrete visual tokens.",
        ),
      );
    }
    if (lineCount(s5) > 40) {
      gaps.push(
        gap(
          "UI_SECTION_TOO_LONG",
          "5. UI/UX design",
          "warn",
          "§5 is longer than the token-summary budget; page detail belongs in ui-brief.md.",
          "Move page specs to §4 / nebula-ui-studio/ui-brief.md; keep §5 ≤15–25 lines.",
        ),
      );
    }
  }

  const needsSecurity = NEEDS_AUTH_RE.test(combined);
  if (needsSecurity) {
    const securityOk = sectionHasSecurityBaseline(s2);
    // Keep marker/auth checks for precise gap codes (shared regexes with accept path).
    const securityPresent = SECURITY_MARKERS_RE.test(s2) && !SECURITY_NEGATED_RE.test(s2);
    const authPresent = AUTH_MODEL_RE.test(s2) && !SECURITY_NEGATED_RE.test(s2);
    // Product contract (recovery): SEC_* are ASSUMPTION polish (warn), never hard Go blockers on MVP.
    if (!securityOk && !securityPresent) {
      gaps.push(
        gap(
          "SEC_RLS_MISSING",
          "2. Tech and Research",
          "warn",
          "Security baseline assumptions not yet written into §2 (auto-applied on Go / plan sync).",
          "MVP: industry-standard auth/RLS draft is merged as labeled assumptions — harden before deploy.",
        ),
      );
    }
    if (!securityOk && !authPresent) {
      gaps.push(
        gap(
          "SEC_AUTH_MISSING",
          "2. Tech and Research",
          "warn",
          "Sign-in approach not yet written into §2 (auto-applied as assumption on Go / plan sync).",
          "MVP: sign-in model is drafted as assumption — confirm before deploy; does not pause Foundation.",
        ),
      );
    }
    if (!PII_RE.test(combined) && /\b(email|client|invoice|upload|file)\b/i.test(combined)) {
      gaps.push(
        gap(
          "SEC_PII_MISSING",
          "2. Tech and Research",
          "warn",
          "PII / sensitive data handling not documented.",
          "Note what personal data is stored and minimization rules (harden before deploy).",
        ),
      );
    }
  }

  if (opts.checkUiBrief) {
    const briefOk = (opts.uiBriefLength ?? 0) >= 80;
    if (!briefOk) {
      gaps.push(
        gap(
          "UI_BRIEF_MISSING",
          "ui-brief",
          "block",
          "nebula-ui-studio/ui-brief.md missing or too short.",
          "After Master Plan save, write ui-brief.md from full §4 page contracts + §5 tokens.",
        ),
      );
    }
  }

  const blockGaps = gaps.filter((g) => g.severity === "block");
  const hasBlock = blockGaps.length > 0;

  let shape: MasterPlanShape = "complete";
  if (hasBlock) {
    const totalLen = Object.values(sectionLengths).reduce((a, b) => a + b, 0);
    const looksLegacy =
      totalLen > 0 &&
      totalLen < 900 &&
      routeCount <= 4 &&
      !SECURITY_MARKERS_RE.test(combined);
    shape = looksLegacy || (routeCount >= 1 && totalLen < 1200) ? "legacy" : "incomplete";
    // thin-legacy fixture: short everything → legacy
    if (totalLen < 500) shape = "legacy";
  }

  if (!hasBlock && gaps.some((g) => g.severity === "warn")) {
    shape = "complete"; // complete enough, with warnings
  }
  if (!hasBlock && gaps.length === 0) shape = "complete";

  const allowGo =
    mode === "off" || mode === "warn" ? true : !hasBlock;

  return {
    ok: mode === "strict" ? !hasBlock : true,
    mode,
    shape,
    gaps,
    allowGo,
    sectionLengths,
  };
}

/**
 * True when the saved Master Plan is solid enough to skip full Discovery.
 * Plan body only — ui-brief is written after plan save (not required to leave Discovery).
 */
export function isMasterPlanCompleteForDiscovery(
  raw: Record<string, unknown> | null | undefined,
): boolean {
  if (!raw || typeof raw !== "object") return false;
  const result = assessMasterPlanCompleteness({
    plan: raw,
    mode: "strict",
    checkUiBrief: false,
  });
  return result.gaps.filter((g) => g.severity === "block").length === 0;
}

/**
 * Structure ready for plan-first UI mockup: §§1–5 usable + routes.
 * Security baseline is warn-only (auto-applied assumptions) — never blocks mockup or Go.
 */
export function isMasterPlanReadyForUiMockup(
  raw: Record<string, unknown> | null | undefined,
): boolean {
  if (!raw || typeof raw !== "object") return false;
  const result = assessMasterPlanCompleteness({
    plan: raw,
    mode: "strict",
    checkUiBrief: false,
  });
  const structuralBlocks = result.gaps.filter((g) => g.severity === "block");
  return structuralBlocks.length === 0;
}
