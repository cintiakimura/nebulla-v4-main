import type { SwarmPhase, SwarmIntensity } from '@/types/swarm';
import type { NebulaSwarmStateFile } from '@/lib/nebulaSwarmState';

/**
 * Nebula Swarm — **client** gate for `POST /api/nebula-swarm/handoff` on chat sends.
 *
 * Lean mode: chat never triggers support agents (no extra LLM round-trip). **Run and Test** uses
 * the same handoff endpoint with `manualRunAndTest: true` from the TopBar.
 */

/** Map Grok `planningPhase` (or similar free text) to our swarm phase enum. */
export function mapPlanningPhaseToSwarmPhase(raw: string | undefined | null): SwarmPhase | null {
  if (raw == null || typeof raw !== 'string') return null;
  const s = raw.toLowerCase().replace(/\s+/g, ' ');
  if (/pre[-\s]?phase[-\s]?0|\bpre[-\s]?0\b|\bgate\b|\bdiscovery\b/.test(s)) return 'pre_phase_0';
  if (/phase[-\s]?5|post[-\s]?gen|refinement/.test(s)) return 'phase_5';
  if (/phase[-\s]?4/.test(s)) return 'phase_4';
  if (/phase[-\s]?3/.test(s)) return 'phase_3';
  if (/phase[-\s]?2/.test(s)) return 'phase_2';
  if (/phase[-\s]?1/.test(s)) return 'phase_1';
  if (/phase[-\s]?0|\bfoundation\b/.test(s)) return 'phase_0';
  return null;
}

/** Compact prior-turn context for swarm user payload (not full chat). Max ~1.2k chars server-side. */
export function buildSwarmConversationSummary(
  messages: Array<{ role: string; text?: string }>,
  opts?: { maxBubbles?: number; maxCharsPerBubble?: number; maxTotal?: number }
): string {
  const maxBubbles = opts?.maxBubbles ?? 8;
  const maxCharsPerBubble = opts?.maxCharsPerBubble ?? 140;
  const maxTotal = opts?.maxTotal ?? 1_200;
  const tail = messages
    .filter((m) => m.role === 'user' || m.role === 'model')
    .slice(-maxBubbles);
  const parts: string[] = [];
  for (const m of tail) {
    const t = (m.text || '').replace(/\s+/g, ' ').trim().slice(0, maxCharsPerBubble);
    if (!t) continue;
    parts.push(m.role === 'user' ? `U:${t}` : `A:${t}`);
  }
  const s = parts.join('\n');
  return s.length <= maxTotal ? s : s.slice(-maxTotal);
}

export type NebulaSwarmHandoffGateInput = {
  swarmEnabled: boolean;
  onboardingAutopilot: boolean;
  skipSwarm?: boolean;
  forceSwarm?: boolean;
  executionPhase: SwarmPhase;
  userMessage: string;
  swarmIntensity: SwarmIntensity;
  /** From `nebula-project/nebula-swarm-state.json` via GET /api/nebula-swarm/state. */
  swarmPersisted: NebulaSwarmStateFile;
};

/**
 * Lean swarm: support agents **never** run on chat sends. Use **Run and Test** (manual) only.
 */
export function shouldPostSwarmHandoff(_ctx: NebulaSwarmHandoffGateInput): boolean {
  return false;
}

export type PhaseSyncInput = {
  current: SwarmPhase;
  planningPhaseRaw: string | undefined;
  rawAssistant: string;
};

/**
 * Derive next execution phase. Phase transitions **no longer** imply a swarm handoff — swarm is
 * trigger-only after bootstrap (see `shouldPostSwarmHandoff`).
 */
export function computePhaseSyncAfterResponse(input: PhaseSyncInput): {
  nextPhase: SwarmPhase;
  phaseChanged: boolean;
  pendingSwarmTransition: boolean;
} {
  const coding = /<\s*START_CODING\s*>|\bSTART_CODING\b/i.test(input.rawAssistant);
  let mapped = mapPlanningPhaseToSwarmPhase(input.planningPhaseRaw);
  if (!mapped && coding && input.current === 'pre_phase_0') {
    mapped = 'phase_0';
  }
  if (!mapped) {
    return { nextPhase: input.current, phaseChanged: false, pendingSwarmTransition: false };
  }
  const phaseChanged = mapped !== input.current;
  return { nextPhase: mapped, phaseChanged, pendingSwarmTransition: false };
}
