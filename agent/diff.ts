/**
 * Diff: classify each request vs locked plan + constitution.
 * Locked: docs/architecture-decisions-2026-09-29.md §8
 */
import type { AgentRoot } from "./paths.ts";
import { requireConstitution, validateAgainstConstitution } from "./constitution.ts";
import {
  clearHalt,
  clearLock,
  isLocked,
  readPlan,
  requestHalt,
  snapshotPlan,
  writePlan,
  type MasterPlan,
  type PlanTask,
} from "./masterPlan.ts";
import { approve } from "./planner.ts";

export type ChangeClass = "additive" | "conflicting" | "ack";

export type ClassifyResult = {
  class: ChangeClass;
  flags: string[];
  task?: PlanTask;
};

const CONFLICT_RE =
  /\b(replace|rewrite|remove|delete|undo|instead of|change task|contradict|violate constitution|in-place patch)\b/i;
const ADD_RE = /\b(add(?:itive)?(?:\s+task)?|append|also include|also add)\b/i;

function existingTaskHit(plan: MasterPlan, text: string): boolean {
  return plan.tasks.some((t) => t.id && new RegExp(`\\b${t.id}\\b`, "i").test(text));
}

export function classifyRequest(root: AgentRoot, text: string): ClassifyResult {
  requireConstitution(root);
  const plan = readPlan(root);
  const flags: string[] = [];
  const against = validateAgainstConstitution(root, text);
  if (against.ok === false) flags.push(...against.flags);

  const touchesTask = existingTaskHit(plan, text);
  if (flags.length || CONFLICT_RE.test(text) || (touchesTask && /\b(replace|change|remove|rewrite)\b/i.test(text))) {
    return { class: "conflicting", flags: flags.length ? flags : ["request conflicts with locked plan"] };
  }
  if (ADD_RE.test(text)) {
    const idMatch = text.match(/\bid\s*[:=]\s*([A-Za-z0-9_-]+)/i);
    const titleMatch = text.match(/\btitle\s*[:=]\s*(.+)$/i);
    const id = idMatch?.[1] || `t-add-${Date.now()}`;
    const title = (titleMatch?.[1] || text).trim();
    return {
      class: "additive",
      flags: [],
      task: { id, title, dependsOn: [] },
    };
  }
  return { class: "ack", flags: [] };
}

function nextTaskId(plan: MasterPlan) {
  return `t-${plan.tasks.length + 1}`;
}

/** §8 additive — append a task. Allowed structural write: snapshot, then rewrite while lock is temporarily honored via allowWhileLocked after snapshot? 
 * Robust: snapshot, clear lock, write draft with extra task, require re-approval? Spec says append and continue — lock stays, append is the allowed additive mutation after snapshot.
 */
export function applyAdditive(root: AgentRoot, task: PlanTask) {
  requireConstitution(root);
  if (!isLocked(root)) throw new Error("additive apply requires a locked plan");
  snapshotPlan(root);
  const plan = readPlan(root);
  const id = task.id || nextTaskId(plan);
  plan.tasks.push({ ...task, id });
  plan.revision += 1;
  writePlan(root, plan, { allowWhileLocked: true });
}

/**
 * §8 conflict — full re-plan, not an in-place patch.
 * Stops executor (halt between tasks), versions current plan, rewrites as draft, waits for approve().
 */
export function beginConflictReplan(
  root: AgentRoot,
  nextDraft: { goal: string; tasks: PlanTask[] },
): { needsApproval: true; conflicts: string[] } {
  requireConstitution(root);
  requestHalt(root, "conflict-replan");
  snapshotPlan(root);
  clearLock(root);
  const prev = readPlan(root);
  const draft: MasterPlan = {
    revision: prev.revision + 1,
    status: "needs_reapproval",
    goal: nextDraft.goal,
    tasks: nextDraft.tasks,
    conversation: prev.conversation,
  };
  const check = validateAgainstConstitution(root, JSON.stringify(draft));
  const conflicts = check.ok === false ? check.flags : [];
  if (conflicts.length === 0) {
    writePlan(root, draft);
  }
  return { needsApproval: true, conflicts };
}

export function reapproveAfterConflict(root: AgentRoot, explicit: string) {
  const result = approve(root, explicit);
  if (result.locked) clearHalt(root);
  return result;
}
