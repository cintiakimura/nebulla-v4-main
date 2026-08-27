/**
 * Lightweight cycle policy + user-visible stage status for UI Studio Beta.
 * Written beside ui-generation-context.md for reliable regen limits + polling.
 */

import fs from "fs";
import path from "path";
import { isLoadableStudioModel } from "../uiMockupArtifactHonesty";
import { readEnginePreviewModel } from "./previewModelIO";

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
  /** v2 template family used for this cycle (optional). */
  template_id?: string;
  /** precode mockup vs post-apply Final UI restyle */
  ui_pass?: "precode" | "final";
  final_ui_ran_at?: string | null;
  final_ui_grounded_paths?: string[];
  /** Autopilot Final UI runs (max 2: Foundation + last slice). */
  final_ui_session_count?: number;
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
    ui_pass: undefined,
    final_ui_ran_at: null,
    final_ui_grounded_paths: [],
    final_ui_session_count: 0,
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

/** True when Studio can load a real engine preview model from disk (not Waiting / IDE shell). */
export function workspaceHasLoadableMockup(workspaceRoot: string): boolean {
  if (!workspaceRoot) return false;
  try {
    const { model } = readEnginePreviewModel(workspaceRoot);
    return isLoadableStudioModel(model);
  } catch {
    return false;
  }
}

/**
 * Phase 7.4: empty/failed cycles must not keep a false regen budget or preference-recovery lock.
 * Call before auto/regenerate — if nothing loadable is on disk, reset counters so seed can succeed.
 */
export function clearFalseRegenBudgetIfEmptyMockup(workspaceRoot: string): UiGenCyclePolicy {
  const policy = readCyclePolicy(workspaceRoot);
  if (workspaceHasLoadableMockup(workspaceRoot)) return policy;
  const locked =
    policy.regeneration_count > 0 ||
    policy.final_status === "failed" ||
    policy.final_status === "rejected" ||
    /preference recovery|regeneration limit|blocked/i.test(policy.user_visible_stage || "");
  if (!locked) return policy;
  const cleared = defaultCyclePolicy({
    ...policy,
    regeneration_count: 0,
    final_status: "pending",
    recovery_path: "none",
    preference_feedback: "",
    user_visible_stage: "Empty mockup — resetting cycle for seed generate",
  });
  writeCyclePolicy(workspaceRoot, cleared);
  return cleared;
}

/** App Preview chrome: coded app plus honest Final UI restyle note. */
export function withFinalUiPreviewLabel(workspaceRoot: string, statusLabel: string): string {
  const policy = readCyclePolicy(workspaceRoot);
  if (policy.ui_pass === "final" && policy.final_ui_ran_at) {
    if (/Final UI/i.test(statusLabel)) return statusLabel;
    return `${statusLabel} · Final UI (offline catalog)`;
  }
  return statusLabel;
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
