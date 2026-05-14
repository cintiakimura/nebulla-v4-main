/**
 * Bounded excerpt of `master-plan.json` for Inspect (Quality) `contextSummary`, matching the
 * same JSON source the IDE Grok chat loads via `/api/master-plan/read`.
 */
export function compactMasterPlanForInspect(latestMP: Record<string, unknown>): string {
  if (!latestMP || typeof latestMP !== 'object') return '';
  if (Object.keys(latestMP).length === 0) return '';
  try {
    const s = JSON.stringify(latestMP);
    const body = s.length <= 1600 ? s : `${s.slice(0, 1600)}…`;
    return `Master plan (JSON): ${body}`;
  } catch {
    return '';
  }
}
