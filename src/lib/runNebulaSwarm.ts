import type { SwarmHandoffPacket, SwarmPhase, SwarmIntensity } from '@/types/swarm';
import { triggerSwarmOnMessage } from './triggerSwarmOnMessage';

export type RunNebulaSwarmParams = {
  phase: SwarmPhase;
  userMessage: string;
  projectName: string;
  runId: string;
  swarmIntensity: SwarmIntensity;
};

/**
 * Nebula Swarm orchestration for a single chat turn.
 *
 * **Server** (`POST /api/nebula-swarm/handoff`, `lib/nebulaSwarmHandoff.ts`): Project Isolator;
 * Planner / Researcher / Tester on **Grok 3** (parallel, subset by intensity); optional **Reviewer**
 * on **Grok 4.1** after the draft packet when intensity is `full_quality`. Merged JSON is sent to
 * main chat Grok 4.1 in the user message (see `AssistantSidebar`).
 */
export async function runNebulaSwarm(
  params: RunNebulaSwarmParams,
  grokHeaders: Record<string, string>
): Promise<SwarmHandoffPacket> {
  return triggerSwarmOnMessage(params, grokHeaders);
}
