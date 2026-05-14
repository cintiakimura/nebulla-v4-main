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
 * Quality **handoff** — `POST /api/nebula-swarm/handoff` with `manualRunAndTest: true` from **Inspect** (TopBar).
 * Main chat does not call this.
 */
export async function runNebulaSwarm(
  params: RunNebulaSwarmParams,
  grokHeaders: Record<string, string>
): Promise<SwarmHandoffPacket> {
  return triggerSwarmOnMessage(params, grokHeaders);
}
