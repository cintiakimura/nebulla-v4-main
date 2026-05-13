import type { SwarmHandoffPacket, SwarmPhase, SwarmIntensity } from '@/types/swarm';
import type { SwarmHandoffHints } from '@/lib/nebulaSwarmExecutionPlan';
import { triggerSwarmOnMessage } from './triggerSwarmOnMessage';

export type RunNebulaSwarmParams = {
  phase: SwarmPhase;
  userMessage: string;
  projectName: string;
  runId: string;
  swarmIntensity: SwarmIntensity;
  contextSummary?: string;
  focusPaths?: string[];
  focusSnippets?: Record<string, string>;
  swarmHints?: SwarmHandoffHints;
};

/**
 * Nebula Swarm **handoff** API — invoked only when `shouldPostSwarmHandoff` is true
 * (`src/lib/nebulaSwarmGate.ts`): routine turns stay a single `/api/grok/chat` (Grok 4.1).
 *
 * **Server** (`POST /api/nebula-swarm/handoff`, `lib/nebulaSwarmHandoff.ts`): runs agents per
 * `buildSwarmAgentRunPlan` — P+R **once in `pre_phase_0` only**; Tester / Reviewer on **narrow** user text.
 */
export async function runNebulaSwarm(
  params: RunNebulaSwarmParams,
  grokHeaders: Record<string, string>
): Promise<SwarmHandoffPacket> {
  return triggerSwarmOnMessage(params, grokHeaders);
}
