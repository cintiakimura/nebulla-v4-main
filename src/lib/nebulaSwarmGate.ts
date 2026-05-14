import type { SwarmPhase } from '@/types/swarm';

/**
 * Map Grok `planningPhase` (or similar free text) to execution phase for UI / heuristics.
 */

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

export type PhaseSyncInput = {
  current: SwarmPhase;
  planningPhaseRaw: string | undefined;
  rawAssistant: string;
};

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
