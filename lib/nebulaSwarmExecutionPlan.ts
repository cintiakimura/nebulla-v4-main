/**
 * **Which** swarm support agents may run this handoff — **minimal** token policy.
 *
 * - **Planner + Researcher:** once per project, **only** when execution phase is Pre–Phase 0
 *   (`pre_phase_0`) and `nebula-project/nebula-swarm-state.json` has not yet recorded completion.
 * - **Tester:** explicit test / run-tests language, **or** explicit final-validation / ship-check phrasing.
 * - **Reviewer** (Full Quality only): user asks for a **review**, **or** user language signals a
 *   **big / major feature** completed (not every coding turn).
 *
 * All other turns → no agents (client gate + server `anyAgentRuns` short-circuit).
 */

import type { NebulaSwarmStateFile } from "./nebulaSwarmState";

export type SwarmIntensity = "light" | "balanced" | "full_quality";

/** Optional extension point; triggers are currently message + phase + state only. */
export type SwarmHandoffHints = Record<string, unknown>;

export type SwarmAgentRunPlan = {
  runPlanner: boolean;
  runResearcher: boolean;
  runTester: boolean;
  runReviewer: boolean;
  /** Human-readable codes for logs / packet metadata. */
  reasons: string[];
};

/**
 * User explicitly wants tests run or fixed — narrow patterns (not generic “testing” mentions).
 */
export function userRequestsTestSwarm(userMessage: string): boolean {
  const t = userMessage.trim();
  if (!t) return false;
  if (/\b(run tests?\b|run the tests?\b|run my tests)\b/i.test(t)) return true;
  if (/^\s*tests?\s*\.{0,3}\s*$/i.test(t)) return true;
  if (/^\s*test\s*[,:.\-–]\s+\S/i.test(t)) return true;
  if (/\b(fix tests?\b|failing tests?\b)\b/i.test(t)) return true;
  return false;
}

/**
 * Ship / gate language — Tester only when the user clearly asks for a validation pass (not phase-only).
 */
export function userRequestsFinalValidationTester(userMessage: string): boolean {
  const t = userMessage.trim();
  if (!t) return false;
  return /\b(final validation|last validation|validate before (ship|release)|pre[-\s]?flight|sign[-\s]?off|ready to ship|production[-\s]?ready check)\b/i.test(
    t
  );
}

/** User asks for a code review (explicit “review” / “code review”). */
export function userRequestsReviewSwarm(userMessage: string): boolean {
  return /\b(review|code review)\b/i.test(userMessage.trim());
}

/** User signals a large feature is finished — Reviewer trigger only (not every small edit). */
export function userSignalsBigFeatureComplete(userMessage: string): boolean {
  const t = userMessage.trim();
  if (!t) return false;
  return /\b(feature (is )?(done|complete|ready)|finished (the|this) (big |major )?feature|done with (the|this) (big |major )?feature|big feature (done|complete|shipped)|major feature (done|complete)|this feature (is )?(done|complete))\b/i.test(
    t
  );
}

/** One-time P+R: **Pre–Phase 0 only** (never again after state is written). */
function shouldBootstrapPlannerResearch(state: NebulaSwarmStateFile, phase: string): boolean {
  if (state.plannerDone || state.researcherDone) return false;
  return phase === "pre_phase_0";
}

export function buildSwarmAgentRunPlan(args: {
  state: NebulaSwarmStateFile;
  phase: string;
  userMessage: string;
  intensity: SwarmIntensity;
  hints?: SwarmHandoffHints;
}): SwarmAgentRunPlan {
  const { state, phase, userMessage, intensity } = args;
  const reasons: string[] = [];

  let runPlanner = false;
  let runResearcher = false;
  let runTester = false;
  let runReviewer = false;

  if (shouldBootstrapPlannerResearch(state, phase)) {
    runPlanner = true;
    runResearcher = true;
    reasons.push("bootstrap_pr_pre_phase_0_once");
  }

  const planningComplete = state.plannerDone && state.researcherDone;

  if (planningComplete) {
    const wantsTest = userRequestsTestSwarm(userMessage);
    const wantsFinalVal = userRequestsFinalValidationTester(userMessage);
    if (wantsTest || wantsFinalVal) {
      runTester = true;
      if (wantsTest) reasons.push("tester_explicit");
      if (wantsFinalVal) reasons.push("tester_final_validation");
    }

    const wantsReview = userRequestsReviewSwarm(userMessage);
    const bigFeatureDone = userSignalsBigFeatureComplete(userMessage);
    if (intensity === "full_quality" && (wantsReview || bigFeatureDone)) {
      runReviewer = true;
      if (wantsReview) reasons.push("reviewer_explicit");
      if (bigFeatureDone) reasons.push("reviewer_big_feature_done");
    }
  }

  return { runPlanner, runResearcher, runTester, runReviewer, reasons };
}

export function anyAgentRuns(plan: SwarmAgentRunPlan): boolean {
  return plan.runPlanner || plan.runResearcher || plan.runTester || plan.runReviewer;
}
