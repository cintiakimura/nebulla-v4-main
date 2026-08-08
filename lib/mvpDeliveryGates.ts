/**
 * MVP delivery gates — soft-continue policies so optional services / polish
 * never hard-block Foundation coding for a first shippable draft.
 *
 * Authority: nebula-project/recovery-orchestration.md (Phase 7 exit / golden brief)
 */
import type { MasterPlanCompletenessResult } from "./masterPlanCompleteness";

const SEC_GAP_RE = /^SEC_/;

/** True when every blocking gap is a security/auth documentation gap. */
export function onlySecurityBlockGaps(result: MasterPlanCompletenessResult): boolean {
  const blocks = result.gaps.filter((g) => g.severity === "block");
  return blocks.length > 0 && blocks.every((g) => SEC_GAP_RE.test(g.code));
}

/**
 * Demote SEC_* block gaps to warn so Go can proceed.
 * Call after merging the industry-standard security baseline draft.
 * Non-security block gaps still pause Go under MASTER_PLAN_STRICT=strict.
 */
export function softenSecurityBlocksForMvpGo(
  result: MasterPlanCompletenessResult,
): MasterPlanCompletenessResult {
  const hasSecBlock = result.gaps.some(
    (g) => SEC_GAP_RE.test(g.code) && g.severity === "block",
  );
  if (!hasSecBlock) return result;

  const gaps = result.gaps.map((g) =>
    SEC_GAP_RE.test(g.code) && g.severity === "block"
      ? {
          ...g,
          severity: "warn" as const,
          remediation: `${g.remediation} (MVP: continuing with industry-standard draft — correct if wrong.)`,
        }
      : g,
  );
  const hasBlock = gaps.some((g) => g.severity === "block");
  return {
    ...result,
    gaps,
    allowGo: result.mode === "off" || result.mode === "warn" ? true : !hasBlock,
    ok: result.mode === "strict" ? !hasBlock : true,
  };
}
