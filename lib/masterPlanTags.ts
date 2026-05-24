/** Matches `<END_MASTERPLAN>` and `</END_MASTERPLAN>` (models vary). */
export const MASTER_PLAN_BLOCK_RE = /<START_MASTERPLAN>([\s\S]*?)<\/?END_MASTERPLAN>/i;

export function extractMasterPlanInner(source: string): string | null {
  const m = source.match(MASTER_PLAN_BLOCK_RE);
  return m?.[1]?.trim() ?? null;
}

export function sourceHasMasterPlanBlock(source: string): boolean {
  return MASTER_PLAN_BLOCK_RE.test(source);
}
