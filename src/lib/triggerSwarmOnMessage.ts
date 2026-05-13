import { withProjectBody, withProjectQuery } from './nebulaProjectApi';
import { fetchJson } from './apiFetch';
import type { SwarmHandoffPacket, SwarmPhase, SwarmIntensity } from '@/types/swarm';

export type TriggerSwarmParams = {
  userMessage: string;
  phase: SwarmPhase;
  projectName: string;
  runId: string;
  swarmIntensity: SwarmIntensity;
};

/**
 * Calls the server swarm orchestrator (intensity controls which support agents run; Full Quality
 * adds a Grok 4.1 Reviewer pass on the server), merged into one handoff packet.
 */
export async function triggerSwarmOnMessage(
  params: TriggerSwarmParams,
  grokHeaders: Record<string, string>
): Promise<SwarmHandoffPacket> {
  const data = await fetchJson<{ handoff?: SwarmHandoffPacket; error?: string }>(
    withProjectQuery('/api/nebula-swarm/handoff'),
    {
      method: 'POST',
      headers: { ...grokHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(
        withProjectBody({
          userMessage: params.userMessage,
          phase: params.phase,
          projectName: params.projectName,
          runId: params.runId,
          swarmIntensity: params.swarmIntensity,
        })
      ),
    }
  );
  if (data.error) throw new Error(data.error);
  if (!data.handoff) throw new Error('Swarm handoff missing in server response');
  return data.handoff;
}
