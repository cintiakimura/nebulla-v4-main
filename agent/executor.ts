/**
 * Executor process. Reads locked plan only. Never inspects the queue during a task.
 * Locked: docs/architecture-decisions-2026-09-29.md §5
 */
import { requireConstitution } from "./constitution.ts";
import {
  appendEvent,
  isLocked,
  peekHalt,
  readPlan,
  readProgress,
  requestHalt,
  writeProgress,
  type PlanTask,
} from "./masterPlan.ts";
import { applyAdditive, classifyRequest } from "./diff.ts";
import { listInbox, markProcessed } from "./queue.ts";
import type { AgentRoot } from "./paths.ts";
import fs from "node:fs";
import { paths } from "./paths.ts";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function nextTask(tasks: PlanTask[], status: Record<string, string>): PlanTask | null {
  for (const t of tasks) {
    const st = status[t.id] || "pending";
    if (st !== "pending") continue;
    const depsOk = (t.dependsOn || []).every((d) => status[d] === "done");
    if (depsOk) return t;
  }
  return null;
}

/** §5 — run to completion. No queue reads in this function. */
async function runTaskToCompletion(root: AgentRoot, task: PlanTask) {
  appendEvent(root, { type: "task_start", taskId: task.id });
  const ms = Math.max(0, Number(task.simulateMs || 0));
  if (ms) await sleep(ms);
  appendEvent(root, { type: "task_end", taskId: task.id });
}

/** §5 — queue only between tasks. */
function processQueueBetweenTasks(root: AgentRoot) {
  appendEvent(root, { type: "queue_check" });
  const items = listInbox(root);
  const logPath = paths(root).processedMessages;
  const prev = fs.existsSync(logPath)
    ? (JSON.parse(fs.readFileSync(logPath, "utf8")) as unknown[])
    : [];
  for (const item of items) {
    const classified = classifyRequest(root, item.msg.text);
    appendEvent(root, {
      type: "queue_process",
      messageId: item.msg.id,
      class: classified.class,
    });
    prev.push({ ...item.msg, class: classified.class });
    if (classified.class === "additive" && classified.task) {
      applyAdditive(root, classified.task);
    }
    if (classified.class === "conflicting") {
      // Halt only. Rewrite is the diff/planner re-plan cycle, not an in-place patch (§8).
      requestHalt(root, "conflict-from-queue");
    }
    markProcessed(root, item.file);
  }
  fs.writeFileSync(logPath, JSON.stringify(prev, null, 2) + "\n", "utf8");
}

export async function runExecutorLoop(root: AgentRoot) {
  requireConstitution(root);
  if (!isLocked(root)) {
    throw new Error("executor reads tasks exclusively from a locked plan.json (§5)");
  }
  appendEvent(root, { type: "executor_start" });

  while (true) {
    requireConstitution(root);
    if (peekHalt(root)) {
      appendEvent(root, { type: "executor_halt", reason: peekHalt(root)?.reason });
      break;
    }
    if (!isLocked(root)) {
      appendEvent(root, { type: "executor_halt", reason: "plan unlocked" });
      break;
    }

    const plan = readPlan(root);
    const progress = readProgress(root);
    const task = nextTask(plan.tasks, progress.taskStatus);
    if (!task) {
      processQueueBetweenTasks(root);
      const again = nextTask(readPlan(root).tasks, readProgress(root).taskStatus);
      if (!again) {
        appendEvent(root, { type: "executor_complete" });
        break;
      }
      continue;
    }

    progress.taskStatus[task.id] = "running";
    writeProgress(root, progress);
    await runTaskToCompletion(root, task);
    const after = readProgress(root);
    after.taskStatus[task.id] = "done";
    writeProgress(root, after);

    processQueueBetweenTasks(root);
  }
}
