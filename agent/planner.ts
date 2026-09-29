/**
 * Planning phase: brainstorm, draft, present, explicit approval, then lock.
 * Locked: docs/architecture-decisions-2026-09-29.md §4
 */
import type { AgentRoot } from "./paths.ts";
import { requireConstitution, validateAgainstConstitution, writeConstitutionHash } from "./constitution.ts";
import { paths } from "./paths.ts";
import fs from "node:fs";
import {
  emptyPlan,
  isLocked,
  readPlan,
  snapshotPlan,
  writeLock,
  writePlan,
  type MasterPlan,
  type PlanTask,
} from "./masterPlan.ts";

export type Presentation = {
  constitution: string;
  plan: MasterPlan;
  conflicts: string[];
};

export function brainstorm(root: AgentRoot, userText: string): MasterPlan {
  requireConstitution(root);
  if (isLocked(root)) {
    throw new Error("planning conversation is closed while plan.lock exists (§4)");
  }
  const plan = readPlan(root);
  plan.conversation.push({ at: new Date().toISOString(), role: "user", text: userText });
  plan.conversation.push({
    at: new Date().toISOString(),
    role: "planner",
    text: "Noted for architecture. Draft is not locked until explicit approval.",
  });
  if (!plan.goal.trim()) plan.goal = userText;
  snapshotPlan(root);
  writePlan(root, plan);
  return readPlan(root);
}

export function draftMasterPlan(
  root: AgentRoot,
  input: { goal: string; tasks: PlanTask[] },
): Presentation {
  requireConstitution(root);
  if (isLocked(root)) {
    throw new Error("locked plan is read-only; conflicting changes must re-plan (§3 §8)");
  }
  const constitution = requireConstitution(root);
  const prev = readPlan(root);
  const draft: MasterPlan = {
    revision: prev.revision + 1,
    status: "draft",
    goal: input.goal,
    tasks: input.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      dependsOn: [...(t.dependsOn || [])],
      simulateMs: t.simulateMs,
    })),
    conversation: prev.conversation,
  };
  const check = validateAgainstConstitution(root, JSON.stringify(draft));
  const conflicts = check.ok === false ? check.flags : [];
  if (conflicts.length === 0) {
    snapshotPlan(root);
    writePlan(root, draft);
  }
  return { constitution, plan: draft, conflicts };
}

/** §4 — present only after validation; conflicts are returned, not swallowed. */
export function presentForReview(root: AgentRoot): Presentation {
  const constitution = requireConstitution(root);
  const plan = readPlan(root);
  const check = validateAgainstConstitution(root, JSON.stringify(plan));
  return { constitution, plan, conflicts: check.ok === false ? check.flags : [] };
}

/**
 * §4 — plan.lock only after explicit user approval.
 * Approval token must be the exact string "approve".
 */
export function approve(root: AgentRoot, explicit: string): { locked: boolean; reason?: string } {
  requireConstitution(root);
  if (explicit.trim().toLowerCase() !== "approve") {
    return { locked: false, reason: "approval must be the explicit token \"approve\" (§4)" };
  }
  const presented = presentForReview(root);
  if (presented.conflicts.length) {
    return { locked: false, reason: presented.conflicts.join("; ") };
  }
  if (!presented.plan.tasks.length) {
    return { locked: false, reason: "empty plan cannot lock" };
  }
  writeLock(root);
  return { locked: true };
}

/** Used when the planner drafts constitution contents; hash must be updated (§2). */
export function replaceConstitution(root: AgentRoot, markdown: string) {
  const check = { body: markdown };
  fs.writeFileSync(paths(root).constitution, check.body, "utf8");
  writeConstitutionHash(root);
  requireConstitution(root);
}

export function seedEmptyIfMissing(root: AgentRoot) {
  requireConstitution(root);
  const p = paths(root);
  if (!fs.existsSync(p.plan)) writePlan(root, emptyPlan());
}
