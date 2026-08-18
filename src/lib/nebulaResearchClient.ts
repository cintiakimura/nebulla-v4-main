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

export async function fetchResearchStatus(): Promise<{ ok: boolean; pending?: boolean }> {
  try {
    const st = await fetchJson<{ ok?: boolean; pending?: boolean }>(
      withProjectQuery('/api/grok/research/status'),
      { credentials: 'include', cache: 'no-store', headers: getGrokRequestHeaders() },
    );
    return { ok: st.ok === true, pending: st.pending === true };
  } catch {
    return { ok: false };
  }
}

async function waitForInFlightResearch(onProgress?: GrokActivityProgressFn): Promise<ResearchStrokeResult> {
  onProgress?.(RESEARCH_STAGE_SEARCHING, 'info');
  for (let i = 0; i < RESEARCH_IN_FLIGHT_WAIT_LOOPS; i++) {
    await new Promise((r) => setTimeout(r, RESEARCH_IN_FLIGHT_WAIT_MS));
    const st = await fetchResearchStatus();
    if (st.ok) return { ok: true, reused: true };
    if (!st.pending) break;
  }
  const st = await fetchResearchStatus();
  if (st.ok) return { ok: true, reused: true };
  if (st.pending) return { ok: false, error: RESEARCH_STOPPED, stillPending: true };
  return { ok: false, error: RESEARCH_STOPPED };
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

  const existing = await fetchResearchStatus();
  if (existing.ok) {
    return { ok: true, reused: true };
  }
  if (existing.pending) {
    const waited = await waitForInFlightResearch(onProgress);
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
      return waitForInFlightResearch(onProgress);
    }
    if (data.wrote) onProgress?.(RESEARCH_STAGE_WRITING, 'info');
    if (data.ok && data.reused !== true) onProgress?.(RESEARCH_STAGE_MERGING, 'info');
    if (!data.ok) {
      const err = data.error || RESEARCH_STOPPED;
      onProgress?.(err, 'error');
      return { ok: false, error: err, gate: data.gate };
    }
    return { ok: true, reused: data.reused, wrote: data.wrote, gate: data.gate };
  } catch (e) {
    if (isAbortLikeError(e)) {
      onProgress?.('Research request interrupted — waiting for in-flight stroke (one heavy job)', 'warn');
      const waited = await waitForInFlightResearch(onProgress);
      if (waited.ok) return waited;
      return {
        ok: false,
        error: waited.stillPending ? waited.error : 'research_soft_abort',
        softAbort: !waited.stillPending,
        stillPending: waited.stillPending,
      };
    }
    const err = e instanceof Error ? e.message : RESEARCH_STOPPED;
    onProgress?.(err, 'error');
    return { ok: false, error: err };
  }
}
