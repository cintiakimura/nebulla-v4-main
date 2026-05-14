export type SwarmPhase = 'pre_phase_0' | 'phase_0' | 'phase_1' | 'phase_2' | 'phase_3' | 'phase_4' | 'phase_5';

/** Passed through Inspect handoff payloads; Quality uses Grok 4.1 on the server. */
export type SwarmIntensity = 'light' | 'balanced' | 'full_quality';

export interface SwarmAgentOutput {
  agent: 'quality';
  status: 'running' | 'completed' | 'error';
  output: unknown;
  durationMs?: number;
}

export interface SwarmHandoffPacket {
  schemaVersion: string;
  intensity?: SwarmIntensity;
  phase: SwarmPhase;
  runId: string;
  projectName: string;
  /** Legacy packet shape — stubs; Inspect (Quality) output is in `quality`. */
  planner: unknown;
  researcher: unknown;
  tester: unknown;
  reviewer?: unknown;
  quality?: unknown;
  notesForGrok: string;
  timestamp: string;
  swarmStateSnapshot?: { schemaVersion: 2; qualityLastRunAt?: string };
  agentsSkipped?: boolean;
  agentRun?: {
    reasons: string[];
    runQuality: boolean;
  };
}

export interface SwarmState {
  /** Fixed for Inspect handoff API compatibility. */
  intensity: SwarmIntensity;
  isRunning: boolean;
  currentPhase: SwarmPhase;
  activeAgents: string[];
  lastHandoff?: SwarmHandoffPacket;
  activityLog: Array<{
    timestamp: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error';
  }>;
}
