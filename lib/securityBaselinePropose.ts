/**
 * Propose (not silent-inject) security baseline for Master Plan §2.
 */
import { normalizeMasterPlanRecord } from "./masterPlanSections";

const NEEDS_AUTH_RE =
  /\b(auth|login|sign[\s-]?up|sign[\s-]?in|oauth|multi[-\s]?tenant|workspace|client portal|invoice|private data|members?|roles?|accounts?)\b/i;

const SECURITY_MARKERS_RE =
  /\b(security baseline|row[-\s]?level security|\brls\b|workspace_id|deny by default|authz:|scoped by\s+\w+|multi[-\s]?tenant isolation:\s*\w)/i;

const SECURITY_NEGATED_RE =
  /\bno\s+(auth model|rls|pii|tenant isolation|security)\b/i;

export const SECURITY_BASELINE_DRAFT = `### Security baseline
- **Auth model:** Sign-in required for private routes (session or magic link / OAuth as appropriate).
- **Tenant isolation:** Scope data by workspace_id (or equivalent); row-level security / deny-by-default on server queries.
- **Roles:** Define least-privilege roles (e.g. owner / member / viewer) and enforce authz on every mutating action.
- **Secrets:** API keys and tokens only in server env / Secrets — never in client bundles or Master Plan.
- **PII:** Minimize personal data; do not log tokens or secrets.
- **Public routes:** Explicitly list which routes stay public (marketing / login only).`;

export function planNeedsSecurityBaseline(plan: Record<string, unknown> | Record<string, string>): boolean {
  const n = normalizeMasterPlanRecord(plan as Record<string, unknown>);
  const combined = Object.values(n).join("\n");
  if (!NEEDS_AUTH_RE.test(combined)) return false;
  if (SECURITY_NEGATED_RE.test(combined)) return true;
  return !SECURITY_MARKERS_RE.test(combined);
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

/** Append baseline to §2 if not already present. Returns new §2 text or null if skipped. */
export function mergeSecurityBaselineIntoSection2(section2: string): string | null {
  const cur = String(section2 || "").trim();
  if (SECURITY_MARKERS_RE.test(cur) && !SECURITY_NEGATED_RE.test(cur)) return null;
  if (!cur) return SECURITY_BASELINE_DRAFT;
  return `${cur}\n\n${SECURITY_BASELINE_DRAFT}`;
}
