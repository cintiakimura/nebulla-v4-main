/**
 * Propose (not silent-inject) security baseline for Master Plan §2.
 */
import { normalizeMasterPlanRecord } from "./masterPlanSections";

export const NEEDS_AUTH_RE =
  /\b(auth|login|sign[\s-]?up|sign[\s-]?in|oauth|multi[-\s]?tenant|workspace|client portal|invoice|private data|members?|roles?|accounts?|kids?|students?|teachers?|parents?|classroom|school|coppa|ferpa)\b/i;

/** Real §2 security baseline markers — not bare page-field `authz:` labels. */
export const SECURITY_MARKERS_RE =
  /\b(security baseline|row[-\s]?level security|\brls\b|workspace_id|classroom_id|deny[-\s]by[-\s]default|deny by default|scoped by\s+\w+|multi[-\s]?tenant isolation:\s*\w)/i;

/**
 * Real sign-in model — not bare "Auth model TBD".
 * Require concrete auth language (sign-in / oauth / session / magic link / accounts).
 */
export const AUTH_MODEL_RE =
  /\b(auth(entication)?\s+required|magic[-\s]?link|oauth(\s+login)?|session cookie|sign[\s-]?in required|login required|parent\/teacher accounts|teacher\/parent accounts)\b/i;

/**
 * Explicit refusal to implement security — NOT "no PII logging" / "minimize PII".
 * Broad "no PII|no security" previously made Accept a permanent no-op loop.
 */
export const SECURITY_NEGATED_RE =
  /\b(no\s+auth(\s+model)?|no\s+rls|no\s+tenant isolation|without\s+(any\s+)?(auth|authentication|rls)|skip(ping)?\s+(the\s+)?security\s+baseline)\b/i;

export const SECURITY_BASELINE_DRAFT = `### Security baseline
- **Auth model:** Sign-in required for private routes (session, magic link, or MVP mock role switch). For kids/education: parent/teacher accounts; COPPA-aware consent when under-13 data applies.
- **Tenant isolation:** Scope data by workspace_id / classroom_id (or equivalent); deny-by-default authorization on every query/mutation in **app/server code** (in-app RLS/role rules on the Render/Postgres stack — not a hosted BaaS product).
- **Roles:** Define least-privilege roles (e.g. owner / member / viewer / teacher / parent / student) and enforce authz on every mutating action.
- **Secrets:** API keys and tokens only in server env / Secrets — never in client bundles or Master Plan.
- **PII:** Minimize personal data; do not log tokens or secrets; avoid collecting unnecessary child PII.
- **Public routes:** Explicitly list which routes stay public (marketing / login only).
- **MVP stack:** Render PostgreSQL + Render Web Service + local/mock auth + in-app role gates.
- *(Assumption: security baseline drafted because the goal implies accounts or private/child data — correct if wrong.)*`;

export function sectionHasSecurityBaseline(section2: string): boolean {
  const cur = String(section2 || "");
  if (SECURITY_NEGATED_RE.test(cur)) return false;
  return SECURITY_MARKERS_RE.test(cur) && AUTH_MODEL_RE.test(cur);
}

export function planNeedsSecurityBaseline(plan: Record<string, unknown> | Record<string, string>): boolean {
  const n = normalizeMasterPlanRecord(plan as Record<string, unknown>);
  const combined = Object.values(n).join("\n");
  if (!NEEDS_AUTH_RE.test(combined)) return false;
  // Explicit skip only when §2 itself refuses security — not "no PII" in goals/features.
  const s2 = String(n["2. Tech and Research"] ?? "");
  if (SECURITY_NEGATED_RE.test(s2)) return true;
  return !sectionHasSecurityBaseline(s2);
}

export function buildSecurityBaselineProposal(plan: Record<string, unknown> | Record<string, string>): {
  needed: boolean;
  sectionKey: string;
  draftMarkdown: string;
} | null {
  if (!planNeedsSecurityBaseline(plan)) return null;
  return {
    needed: true,
    sectionKey: "2. Tech and Research",
    draftMarkdown: SECURITY_BASELINE_DRAFT,
  };
}

/** Auth-only draft when §2 already has RLS/isolation markers but no sign-in model. */
export const SECURITY_AUTH_MODEL_DRAFT = `### Auth model (inference-first draft)
- **Auth model:** Sign-in required for private routes (session or magic link / OAuth as appropriate). For kids/education: parent/teacher accounts; COPPA-aware consent when under-13 data applies.
- **Public routes:** Explicitly list which routes stay public (marketing / login only).
- *(Assumption: sign-in approach drafted because the goal implies accounts or private/child data — correct if wrong.)*`;

/** Append baseline to §2 if not already complete. Returns new §2 text or null if skipped. */
export function mergeSecurityBaselineIntoSection2(section2: string): string | null {
  const cur = String(section2 || "").trim();
  if (sectionHasSecurityBaseline(cur)) return null;
  if (!cur) return SECURITY_BASELINE_DRAFT;
  const hasMarkers = SECURITY_MARKERS_RE.test(cur) && !SECURITY_NEGATED_RE.test(cur);
  const hasAuth = AUTH_MODEL_RE.test(cur) && !SECURITY_NEGATED_RE.test(cur);
  if (hasMarkers && !hasAuth) return `${cur}\n\n${SECURITY_AUTH_MODEL_DRAFT}`;
  if (!hasMarkers && hasAuth) return `${cur}\n\n${SECURITY_BASELINE_DRAFT}`;
  return `${cur}\n\n${SECURITY_BASELINE_DRAFT}`;
}

/**
 * Normalize plan keys and ensure §2 has a real industry baseline.
 * Force-appends when a thin "Auth model TBD" previously looked "already present".
 */
export function ensureSecurityBaselineInPlan(
  plan: Record<string, unknown> | Record<string, string>,
): { plan: Record<string, string>; applied: boolean; sectionKey: string } {
  const normalized = normalizeMasterPlanRecord(plan as Record<string, unknown>);
  const key = "2. Tech and Research";
  const merged = mergeSecurityBaselineIntoSection2(String(normalized[key] ?? ""));
  if (!merged) {
    return { plan: normalized, applied: false, sectionKey: key };
  }
  return {
    plan: { ...normalized, [key]: merged },
    applied: true,
    sectionKey: key,
  };
}
