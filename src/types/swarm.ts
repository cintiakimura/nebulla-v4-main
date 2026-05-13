export type SwarmPhase = 'pre_phase_0' | 'phase_0' | 'phase_1' | 'phase_2' | 'phase_3' | 'phase_4' | 'phase_5';

/** Sub-agents before Grok 4.1 main reply. Default: full_quality. */
export type SwarmIntensity = 'light' | 'balanced' | 'full_quality';

export interface SwarmAgentOutput {
  agent: 'planner' | 'researcher' | 'tester' | 'reviewer';
  status: 'running' | 'completed' | 'error';
  output: any;
  durationMs?: number;
}

export interface SwarmHandoffPacket {
  schemaVersion: string;
  intensity?: SwarmIntensity;
  phase: SwarmPhase;
  runId: string;
  projectName: string;
  planner: any;
  researcher: any;
  tester: any;
  reviewer?: any;
  notesForGrok: string;
  timestamp: string;
  /** Mirrors `nebula-project/nebula-swarm-state.json` after this response. */
  swarmStateSnapshot?: { plannerDone: boolean; researcherDone: boolean };
  /** Server returned stubs only — no xAI support-agent calls (token savings). */
  agentsSkipped?: boolean;
  agentRun?: {
    reasons: string[];
    runPlanner: boolean;
    runResearcher: boolean;
    runTester: boolean;
    runReviewer: boolean;
  };
}

export interface SwarmState {
  isEnabled: boolean;
  /** Planner+Researcher / +Tester / +Reviewer(Grok4.1). */
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
