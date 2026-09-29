/**
 * Master plan persistence. Disk is the source of truth.
 * Locked: docs/architecture-decisions-2026-09-29.md §3
 */
import fs from "node:fs";
import type { AgentRoot } from "./paths.ts";
import { ensureLayout, paths } from "./paths.ts";
import { requireConstitution, validateAgainstConstitution, ConstitutionConflict } from "./constitution.ts";

export type TaskStatus = "pending" | "running" | "done";

export type PlanTask = {
  id: string;
  title: string;
  dependsOn: string[];
  /** Plan-driven duration for scaffolding only — never hardcoded in the executor. */
  simulateMs?: number;
};

export type MasterPlan = {
  revision: number;
  status: "draft" | "locked" | "needs_reapproval" | "complete";
  goal: string;
  tasks: PlanTask[];
  conversation: { at: string; role: "user" | "planner"; text: string }[];
};

export type PlanLock = {
  lockedAt: string;
  revision: number;
  approved: true;
};

export type Progress = {
  taskStatus: Record<string, TaskStatus>;
};

export function emptyPlan(): MasterPlan {
  return { revision: 0, status: "draft", goal: "", tasks: [], conversation: [] };
}

export function readPlan(root: AgentRoot): MasterPlan {
  requireConstitution(root);
  const p = paths(root);
  if (!fs.existsSync(p.plan)) return emptyPlan();
  return JSON.parse(fs.readFileSync(p.plan, "utf8")) as MasterPlan;
}

export function isLocked(root: AgentRoot): boolean {
  return fs.existsSync(paths(root).lock);
}

export function readLock(root: AgentRoot): PlanLock | null {
  const p = paths(root);
  if (!fs.existsSync(p.lock)) return null;
  return JSON.parse(fs.readFileSync(p.lock, "utf8")) as PlanLock;
}

export function readProgress(root: AgentRoot): Progress {
  const p = ensureLayout(root);
  if (!fs.existsSync(p.progress)) return { taskStatus: {} };
  return JSON.parse(fs.readFileSync(p.progress, "utf8")) as Progress;
}

export function writeProgress(root: AgentRoot, progress: Progress) {
  requireConstitution(root);
  const p = ensureLayout(root);
  fs.writeFileSync(p.progress, JSON.stringify(progress, null, 2) + "\n", "utf8");
}

function nextVersionName(root: AgentRoot, revision: number) {
  return `plan_v${revision}.json`;
}

/** §3 — save versions/plan_vN.json before any edit. */
export function snapshotPlan(root: AgentRoot) {
  requireConstitution(root);
  const p = ensureLayout(root);
  if (!fs.existsSync(p.plan)) return;
  const plan = JSON.parse(fs.readFileSync(p.plan, "utf8")) as MasterPlan;
  const dest = `${p.versions}/${nextVersionName(root, plan.revision)}`;
  fs.copyFileSync(p.plan, dest);
}

/**
 * §3 — plan.lock makes plan.json read-only.
 * Allowed writes: drafts (no lock) and re-plan after snapshot (caller must clear lock).
 */
export function writePlan(root: AgentRoot, plan: MasterPlan, opts: { allowWhileLocked?: boolean } = {}) {
  requireConstitution(root);
  const p = ensureLayout(root);
  if (fs.existsSync(p.lock) && !opts.allowWhileLocked) {
    throw new Error("plan.json is read-only while plan.lock exists (§3)");
  }
  const blob = JSON.stringify(plan, null, 2) + "\n";
  const check = validateAgainstConstitution(root, blob);
  if (check.ok === false) throw new ConstitutionConflict(check.flags);
  fs.writeFileSync(p.plan, blob, "utf8");
}

export function writeLock(root: AgentRoot) {
  requireConstitution(root);
  const plan = readPlan(root);
  const p = paths(root);
  const lock: PlanLock = {
    lockedAt: new Date().toISOString(),
    revision: plan.revision,
    approved: true,
  };
  fs.writeFileSync(p.lock, JSON.stringify(lock, null, 2) + "\n", "utf8");
  plan.status = "locked";
  // Status flag on the locked document is part of finalization, not a structural edit.
  fs.writeFileSync(p.plan, JSON.stringify(plan, null, 2) + "\n", "utf8");
}

export function clearLock(root: AgentRoot) {
  requireConstitution(root);
  const p = paths(root);
  if (fs.existsSync(p.lock)) fs.unlinkSync(p.lock);
}

export function requestHalt(root: AgentRoot, reason: string) {
  requireConstitution(root);
  const p = ensureLayout(root);
  fs.writeFileSync(
    p.halt,
    JSON.stringify({ reason, at: new Date().toISOString() }, null, 2) + "\n",
    "utf8",
  );
}

export function peekHalt(root: AgentRoot): { reason: string } | null {
  const p = paths(root);
  if (!fs.existsSync(p.halt)) return null;
  return JSON.parse(fs.readFileSync(p.halt, "utf8")) as { reason: string };
}

export function clearHalt(root: AgentRoot) {
  const p = paths(root);
  if (fs.existsSync(p.halt)) fs.unlinkSync(p.halt);
}

export function appendEvent(root: AgentRoot, event: Record<string, unknown>) {
  const p = ensureLayout(root);
  fs.appendFileSync(p.events, JSON.stringify({ at: new Date().toISOString(), ...event }) + "\n", "utf8");
}

export function readEvents(root: AgentRoot): Record<string, unknown>[] {
  const p = paths(root);
  if (!fs.existsSync(p.events)) return [];
  return fs
    .readFileSync(p.events, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}
