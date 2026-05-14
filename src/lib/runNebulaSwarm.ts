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
  /** Manual Run and Test — Quality agent only. */
  manualRunAndTest?: boolean;
};

/**
 * Nebula Swarm **handoff** — used for **manual Run and Test** (Quality agent) or legacy callers.
 * Chat turns do not call this (`shouldPostSwarmHandoff` is always false).
 */
export async function runNebulaSwarm(
  params: RunNebulaSwarmParams,
  grokHeaders: Record<string, string>
): Promise<SwarmHandoffPacket> {
  return triggerSwarmOnMessage(params, grokHeaders);
}
