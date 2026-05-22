/**
 * Inspect (Quality) handoff plan — **no** Planner, Researcher, Tester, or Reviewer on chat turns.
 * Grok 4 handles planning in the main chat. **Quality** runs **only** when
 * `manualRunAndTest` is true (see `POST /api/nebula-swarm/handoff` + TopBar **Inspect**).
 */

import type { NebulaSwarmStateFile } from "./nebulaSwarmState";

export type SwarmIntensity = "light" | "balanced" | "full_quality";

export type SwarmHandoffHints = Record<string, unknown>;

export type SwarmAgentRunPlan = {
  runQuality: boolean;
  reasons: string[];
};

export function buildSwarmAgentRunPlan(args: {
  state: NebulaSwarmStateFile;
  phase: string;
  userMessage: string;
  intensity: SwarmIntensity;
  hints?: SwarmHandoffHints;
  /** Set by server only for manual Run and Test. */
  manualRunAndTest?: boolean;
}): SwarmAgentRunPlan {
  const reasons: string[] = [];
  if (args.manualRunAndTest) {
    reasons.push("manual_run_and_test");
    return { runQuality: true, reasons };
  }
  reasons.push("lean_mode_no_chat_support_agents");
  return { runQuality: false, reasons };
}

export function anyAgentRuns(plan: SwarmAgentRunPlan): boolean {
  return plan.runQuality;
}
