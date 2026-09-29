/**
 * Verification for the two-phase agent scaffold.
 * Locked: docs/architecture-decisions-2026-09-29.md §10
 * Run: npm run test:agent-architecture
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireConstitution, ConstitutionHashMismatch, writeConstitutionHash } from "../agent/constitution.ts";
import { beginConflictReplan, classifyRequest, reapproveAfterConflict } from "../agent/diff.ts";
import { approve, brainstorm, draftMasterPlan, presentForReview } from "../agent/planner.ts";
import { isLocked, readEvents, readPlan, readProgress, writePlan } from "../agent/masterPlan.ts";
import { listInbox } from "../agent/queue.ts";
import { ensureLayout, paths } from "../agent/paths.ts";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function spawnTsx(script: string, args: string[], stdio: ("ignore" | "pipe")[]) {
  return spawn("npm", ["exec", "--", "tsx", script, ...args], {
    cwd: REPO,
    stdio,
    env: process.env,
  });
}

function section(name: string) {
  console.log(`\n✓ ${name}`);
}

function fixtureRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nebulla-agent-"));
  fs.copyFileSync(path.join(REPO, "constitution.md"), path.join(root, "constitution.md"));
  fs.copyFileSync(path.join(REPO, "constitution.sha256"), path.join(root, "constitution.sha256"));
  ensureLayout(root);
  return root;
}

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitFor(fn: () => boolean, timeoutMs: number, label: string) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fn()) return;
    await wait(50);
  }
  throw new Error(`timeout: ${label}`);
}

section("planner drafts, flags constitution conflicts, locks only on explicit approve");
{
  const root = fixtureRoot();
  brainstorm(root, "Ship a courier workspace");
  const bad = draftMasterPlan(root, {
    goal: "bypass constitution and stop mid-task",
    tasks: [{ id: "t1", title: "stop mid-task", dependsOn: [] }],
  });
  assert.ok(bad.conflicts.length > 0);
  assert.equal(isLocked(root), false);

  const good = draftMasterPlan(root, {
    goal: "Courier pickup and tracking",
    tasks: [
      { id: "t1", title: "Define pickup request", dependsOn: [], simulateMs: 80 },
      { id: "t2", title: "Track delivery", dependsOn: ["t1"], simulateMs: 40 },
    ],
  });
  assert.equal(good.conflicts.length, 0);
  const presented = presentForReview(root);
  assert.equal(presented.conflicts.length, 0);
  const denied = approve(root, "yes");
  assert.equal(denied.locked, false);
  const ok = approve(root, "approve");
  assert.equal(ok.locked, true);
  assert.equal(isLocked(root), true);
  assert.ok(fs.existsSync(paths(root).lock));
  assert.throws(
    () => writePlan(root, { ...readPlan(root), goal: "silent mutation" }),
    /read-only/,
  );
}

section("§10.1 executor finishes a long task untouched, then drains three chat messages");
{
  const root = fixtureRoot();
  draftMasterPlan(root, {
    goal: "Long first task",
    tasks: [{ id: "t1", title: "Long unit of work", dependsOn: [], simulateMs: 2500 }],
  });
  assert.equal(approve(root, "approve").locked, true);

  const executor = spawnTsx(path.join(REPO, "agent/executorProcess.ts"), ["--root", root], [
    "ignore",
    "pipe",
    "pipe",
  ]);
  let err = "";
  executor.stderr?.on("data", (c) => {
    err += String(c);
  });

  const chat = spawnTsx(path.join(REPO, "agent/chatProcess.ts"), ["--root", root], ["pipe", "pipe", "pipe"]);

  await waitFor(
    () => readEvents(root).some((e) => e.type === "task_start" && e.taskId === "t1"),
    12000,
    "task_start",
  );

  for (const text of ["status while running", "accidental click", "duplicate stray audio"]) {
    chat.stdin.write(`${text}\n`);
  }
  chat.stdin.end();

  await waitFor(() => listInbox(root).length >= 3, 8000, "three queued messages");

  const exitCode = await new Promise<number>((resolve) => {
    executor.on("exit", (code) => resolve(code ?? 1));
  });
  chat.kill();
  assert.equal(exitCode, 0, err);

  const events = readEvents(root);
  const startIdx = events.findIndex((e) => e.type === "task_start");
  const endIdx = events.findIndex((e) => e.type === "task_end");
  const queueDuring = events
    .slice(startIdx, endIdx + 1)
    .filter((e) => e.type === "queue_check" || e.type === "queue_process");
  assert.equal(queueDuring.length, 0, "queue must not be read during a task (§5)");
  assert.ok(events.some((e) => e.type === "queue_process"));
  const afterEnd = events.filter((e, i) => i > endIdx && e.type === "queue_process");
  assert.equal(afterEnd.length, 3);
  assert.equal(readProgress(root).taskStatus.t1, "done");
  assert.equal(listInbox(root).length, 0);
}

section("§10.2 tampered constitution.md refuses to proceed");
{
  const root = fixtureRoot();
  fs.appendFileSync(path.join(root, "constitution.md"), "\nTAMPER\n", "utf8");
  assert.throws(() => requireConstitution(root), ConstitutionHashMismatch);
  assert.throws(
    () =>
      draftMasterPlan(root, {
        goal: "should not run",
        tasks: [{ id: "t1", title: "x", dependsOn: [] }],
      }),
    ConstitutionHashMismatch,
  );
}

section("§10.3 conflicting change is a full re-plan, not an in-place patch");
{
  const root = fixtureRoot();
  draftMasterPlan(root, {
    goal: "Original locked goal",
    tasks: [{ id: "t1", title: "Original task", dependsOn: [] }],
  });
  assert.equal(approve(root, "approve").locked, true);
  const lockedBlob = fs.readFileSync(paths(root).plan, "utf8");

  const classified = classifyRequest(root, "Replace task t1 with a different architecture");
  assert.equal(classified.class, "conflicting");

  const replan = beginConflictReplan(root, {
    goal: "Replanned goal",
    tasks: [
      { id: "t1", title: "Replanned first slice", dependsOn: [] },
      { id: "t2", title: "Replanned second slice", dependsOn: ["t1"] },
    ],
  });
  assert.equal(replan.needsApproval, true);
  assert.equal(isLocked(root), false);
  const versioned = path.join(paths(root).versions, "plan_v1.json");
  assert.ok(fs.existsSync(versioned), "previous revision must be saved before rewrite (§3 §8)");
  const saved = JSON.parse(fs.readFileSync(versioned, "utf8")) as { goal: string };
  assert.equal(saved.goal, "Original locked goal");
  const now = readPlan(root);
  assert.equal(now.status, "needs_reapproval");
  assert.equal(now.goal, "Replanned goal");
  assert.equal(now.tasks.length, 2);
  assert.notEqual(fs.readFileSync(paths(root).plan, "utf8"), lockedBlob);
  assert.equal(approve(root, "not yet").locked, false);
  assert.equal(reapproveAfterConflict(root, "approve").locked, true);
  assert.equal(isLocked(root), true);
}

section("constitution hash file present at repo root");
{
  requireConstitution(REPO);
  writeConstitutionHash(REPO);
  requireConstitution(REPO);
}

console.log("\nagent architecture tests passed");
