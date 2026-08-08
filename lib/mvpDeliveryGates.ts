/**
 * MVP delivery gates — soft-continue policies so optional services / polish
 * never hard-block Foundation coding for a first shippable draft.
 *
 * Authority: nebula-project/recovery-orchestration.md
 * Product: security baseline = auto-applied assumptions (asset); never a hard Go blocker.
 */
import type { MasterPlanCompletenessResult } from "./masterPlanCompleteness";

const SEC_GAP_RE = /^SEC_/;

/** True when every blocking gap is a security/auth documentation gap. */
export function onlySecurityBlockGaps(result: MasterPlanCompletenessResult): boolean {
  const blocks = result.gaps.filter((g) => g.severity === "block");
  return blocks.length > 0 && blocks.every((g) => SEC_GAP_RE.test(g.code));
}

/**
 * Safety net: demote any residual SEC_* blocks to warn and recompute allowGo.
 * Primary contract is warn-at-source in masterPlanCompleteness; this catches older callers.
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
          remediation: `${g.remediation} (MVP: security is assumption polish — does not pause Go.)`,
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
