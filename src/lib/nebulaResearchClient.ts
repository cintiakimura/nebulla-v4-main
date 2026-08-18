/**
 * Client: Phase 3 research stroke (Web Search) before UI Gen / Go.
 */

import { isAbortLikeError } from './abortLikeError';
import { fetchJson } from './apiFetch';
import type { GrokActivityProgressFn } from './ideGrokActivityStatus';
import { getGrokRequestHeaders } from './grokUserKey';
import { withProjectBody, withProjectQuery } from './nebulaProjectApi';
import {
  RESEARCH_STAGE_MERGING,
  RESEARCH_STAGE_SEARCHING,
  RESEARCH_STAGE_WRITING,
  RESEARCH_STOPPED,
} from '../../lib/researchStages';
import { isFoundationGoInFlight } from './foundationHeavyJob';

export {
  RESEARCH_STAGE_BRIEF,
  RESEARCH_STAGE_MERGING,
  RESEARCH_STAGE_SEARCHING,
  RESEARCH_STAGE_WRITING,
  RESEARCH_STOPPED,
} from '../../lib/researchStages';

export type ResearchStrokeResult = {
  ok: boolean;
  error?: string;
  reused?: boolean;
  wrote?: boolean;
  gate?: { ok: boolean; competitorCount?: number; reasons?: string[] };
  /** Fetch aborted/timed out — not a real Gate R fail. */
  softAbort?: boolean;
  /** Web Search job still running — do not start Go/UI Gen. */
  stillPending?: boolean;
};

/** Wait up to ~90s for an in-flight research stroke (do not start Go in parallel). */
export const RESEARCH_IN_FLIGHT_WAIT_LOOPS = 36;
export const RESEARCH_IN_FLIGHT_WAIT_MS = 2500;

export function formatResearchStopMessage(reasons?: string[]): string {
  const extra = (reasons || [])
    .map((r) => String(r || '').trim())
    .filter(Boolean)
    .slice(0, 3)
    .join('; ');
  return extra ? `${RESEARCH_STOPPED} ${extra}` : RESEARCH_STOPPED;
}

export async function fetchResearchStatus(goal?: string): Promise<{
  ok: boolean;
  pending?: boolean;
  skipped?: boolean;
  competitorCount?: number;
  reasons?: string[];
}> {
  try {
    const q = goal?.trim()
      ? withProjectQuery(`/api/grok/research/status?goal=${encodeURIComponent(goal.trim())}`)
      : withProjectQuery('/api/grok/research/status');
    const st = await fetchJson<{
      ok?: boolean;
      pending?: boolean;
      gate?: { ok?: boolean; skipped?: boolean; competitorCount?: number; reasons?: string[] };
    }>(q, { credentials: 'include', cache: 'no-store', headers: getGrokRequestHeaders() });
    const competitorCount =
      typeof st.gate?.competitorCount === 'number' ? st.gate.competitorCount : 0;
    const skipped = st.gate?.skipped === true;
    const reasons = Array.isArray(st.gate?.reasons)
      ? st.gate.reasons.filter((r): r is string => typeof r === 'string' && r.trim().length > 0)
      : [];
    return {
      ok: st.ok === true && (skipped || competitorCount >= 5),
      pending: st.pending === true,
      skipped,
      competitorCount,
      reasons,
    };
  } catch {
    return { ok: false, reasons: ['research status unavailable'] };
  }
}

async function waitForInFlightResearch(
  onProgress?: GrokActivityProgressFn,
  goal?: string,
): Promise<ResearchStrokeResult> {
  onProgress?.(RESEARCH_STAGE_SEARCHING, 'info');
  for (let i = 0; i < RESEARCH_IN_FLIGHT_WAIT_LOOPS; i++) {
    await new Promise((r) => setTimeout(r, RESEARCH_IN_FLIGHT_WAIT_MS));
    const st = await fetchResearchStatus(goal);
    if (st.ok) return { ok: true, reused: true };
    if (!st.pending) break;
  }
  const st = await fetchResearchStatus(goal);
  if (st.ok) return { ok: true, reused: true };
  const stop = formatResearchStopMessage(st.reasons);
  if (st.pending) return { ok: false, error: stop, stillPending: true, gate: { ok: false, reasons: st.reasons } };
  return { ok: false, error: stop, gate: { ok: false, reasons: st.reasons } };
}

export async function ensureResearchBeforeUiAndGo(options: {
  projectName?: string;
  goal?: string;
  onProgress?: GrokActivityProgressFn;
}): Promise<ResearchStrokeResult> {
  const onProgress = options.onProgress;
  if (isFoundationGoInFlight(options.projectName)) {
    onProgress?.('Foundation Go running — research waits (one heavy job).', 'warn');
    return { ok: false, error: 'Foundation Go in flight' };
  }

  const existing = await fetchResearchStatus(options.goal);
  if (existing.ok) {
    return { ok: true, reused: true };
  }
  if (existing.pending) {
    const waited = await waitForInFlightResearch(onProgress, options.goal);
    if (!waited.ok) onProgress?.(waited.error || RESEARCH_STOPPED, 'error');
    return waited;
  }

  onProgress?.(RESEARCH_STAGE_SEARCHING, 'info');
  try {
    const data = await fetchJson<ResearchStrokeResult & { error?: string; pending?: boolean }>(
      withProjectQuery('/api/grok/research'),
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...getGrokRequestHeaders() },
        body: JSON.stringify(
          withProjectBody({
            projectName: options.projectName,
            goal: options.goal,
          }),
        ),
      },
    );
    if (data.pending && !data.ok) {
      return waitForInFlightResearch(onProgress, options.goal);
    }
    if (data.wrote) onProgress?.(RESEARCH_STAGE_WRITING, 'info');
    if (data.ok && data.reused !== true) onProgress?.(RESEARCH_STAGE_MERGING, 'info');
    if (!data.ok) {
      const err = formatResearchStopMessage(data.gate?.reasons).replace(/^HTTP \d+:\s*/, '');
      const detail = (data.error || err).replace(/^HTTP \d+:\s*/, '');
      const stop = /research not complete/i.test(detail) ? formatResearchStopMessage(data.gate?.reasons) : detail;
      onProgress?.(stop, 'error');
      return { ok: false, error: stop, gate: data.gate };
    }
    return { ok: true, reused: data.reused, wrote: data.wrote, gate: data.gate };
  } catch (e) {
    if (isAbortLikeError(e)) {
      onProgress?.('Research request interrupted — waiting for in-flight stroke (one heavy job)', 'warn');
      const waited = await waitForInFlightResearch(onProgress, options.goal);
      if (waited.ok) return waited;
      return {
        ok: false,
        error: waited.stillPending ? waited.error : 'research_soft_abort',
        softAbort: !waited.stillPending,
        stillPending: waited.stillPending,
      };
    }
    const err = (e instanceof Error ? e.message : RESEARCH_STOPPED).replace(/^HTTP \d+:\s*/, '');
    onProgress?.(err, 'error');
    return { ok: false, error: err };
  }
}
