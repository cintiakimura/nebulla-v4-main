import { withProjectBody, withProjectQuery } from './nebulaProjectApi';
import { fetchJson } from './apiFetch';
import type { SwarmHandoffPacket, SwarmPhase, SwarmIntensity } from '@/types/swarm';
import type { SwarmHandoffHints } from '@/lib/nebulaSwarmExecutionPlan';

export type TriggerSwarmParams = {
  userMessage: string;
  phase: SwarmPhase;
  projectName: string;
  runId: string;
  swarmIntensity: SwarmIntensity;
  /** Bounded recap — never full chat (token control). */
  contextSummary?: string;
  /** Up to 3 paths — no repo bodies; optional IDE hook `window.nebulaSwarmFocusPaths`. */
  focusPaths?: string[];
  /** Path → snippet from client only (`window.nebulaSwarmFocusSnippets`); max 3 keys, capped values. */
  focusSnippets?: Record<string, string>;
  /** Drives `buildSwarmAgentRunPlan` on the server (manual Run and Test only in lean mode). */
  swarmHints?: SwarmHandoffHints;
  /** Manual **Run and Test** — single Quality agent on Grok 4.1. */
  manualRunAndTest?: boolean;
};

/**
 * HTTP client for `POST /api/nebula-swarm/handoff`.
 * Pass `manualRunAndTest: true` for the **Run and Test** Quality agent (Grok 4.1).
 */
export async function triggerSwarmOnMessage(
  params: TriggerSwarmParams,
  grokHeaders: Record<string, string>
): Promise<SwarmHandoffPacket> {
  const body: Record<string, unknown> = {
    userMessage: params.userMessage,
    phase: params.phase,
    projectName: params.projectName,
    runId: params.runId,
    swarmIntensity: params.swarmIntensity,
  };
  if (params.contextSummary?.trim()) {
    body.contextSummary = params.contextSummary.trim().slice(0, 2000);
  }
  if (params.focusPaths?.length) {
    body.focusPaths = params.focusPaths.slice(0, 3);
  }
  if (params.focusSnippets && Object.keys(params.focusSnippets).length > 0) {
    body.focusSnippets = params.focusSnippets;
  }
  if (params.manualRunAndTest) {
    body.manualRunAndTest = true;
  }
  const data = await fetchJson<{ handoff?: SwarmHandoffPacket; error?: string }>(
    withProjectQuery('/api/nebula-swarm/handoff'),
    {
      method: 'POST',
      headers: { ...grokHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(withProjectBody(body as Record<string, unknown>)),
    }
  );
  if (data.error) throw new Error(data.error);
  if (!data.handoff) throw new Error('Swarm handoff missing in server response');
  return data.handoff;
}
