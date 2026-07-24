/**
 * Lightweight cycle policy + user-visible stage status for UI Studio Beta.
 * Written beside ui-generation-context.md for reliable regen limits + polling.
 */

import fs from "fs";
import path from "path";

export type RecoveryPath =
  | "guided_improvement"
  | "manual_refinement"
  | "partial_redesign"
  | "none";

export type UiGenCyclePolicy = {
  auto_triggered: "yes" | "no";
  regeneration_count: number;
  max_regenerations: number;
  preference_feedback: string;
  recovery_path: RecoveryPath;
  final_status: "generated" | "refined" | "accepted" | "rejected" | "failed" | "pending";
  user_visible_stage: string;
  page_key: string;
  updated_at: string;
};

export const CYCLE_POLICY_REL = path.join("nebulla-project", "ui-generation-cycle.json");

export function cyclePolicyAbsPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, CYCLE_POLICY_REL);
}

export function defaultCyclePolicy(partial?: Partial<UiGenCyclePolicy>): UiGenCyclePolicy {
  return {
    auto_triggered: "no",
    regeneration_count: 0,
    max_regenerations: 3,
    preference_feedback: "",
    recovery_path: "none",
    final_status: "pending",
    user_visible_stage: "",
    page_key: "",
    updated_at: new Date().toISOString(),
    ...partial,
  };
}

export function readCyclePolicy(workspaceRoot: string): UiGenCyclePolicy {
  const abs = cyclePolicyAbsPath(workspaceRoot);
  try {
    if (!fs.existsSync(abs)) return defaultCyclePolicy();
    const raw = JSON.parse(fs.readFileSync(abs, "utf8")) as Partial<UiGenCyclePolicy>;
    return defaultCyclePolicy({
      ...raw,
      regeneration_count: Number(raw.regeneration_count) || 0,
      max_regenerations: Number(raw.max_regenerations) || 3,
    });
  } catch {
    return defaultCyclePolicy();
  }
}

export function writeCyclePolicy(workspaceRoot: string, policy: UiGenCyclePolicy): void {
  const abs = cyclePolicyAbsPath(workspaceRoot);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  policy.updated_at = new Date().toISOString();
  fs.writeFileSync(abs, JSON.stringify(policy, null, 2), "utf8");
}

export function setUserVisibleStage(
  workspaceRoot: string,
  stage: string,
  patch?: Partial<UiGenCyclePolicy>,
): UiGenCyclePolicy {
  const policy = { ...readCyclePolicy(workspaceRoot), ...patch, user_visible_stage: stage };
  writeCyclePolicy(workspaceRoot, policy);
  return policy;
}
