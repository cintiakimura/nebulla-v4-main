/**
 * Path layout for the two-phase agent scaffold.
 * Locked: docs/architecture-decisions-2026-09-29.md §2 §3 §7
 */
import fs from "node:fs";
import path from "node:path";

export type AgentRoot = string;

export function paths(root: AgentRoot) {
  const master = path.join(root, "master_plan");
  return {
    root,
    constitution: path.join(root, "constitution.md"),
    constitutionHash: path.join(root, "constitution.sha256"),
    decisions: path.join(root, "docs", "architecture-decisions-2026-09-29.md"),
    master,
    plan: path.join(master, "plan.json"),
    lock: path.join(master, "plan.lock"),
    versions: path.join(master, "versions"),
    inbox: path.join(master, "inbox"),
    inboxProcessed: path.join(master, "inbox", "processed"),
    runtime: path.join(master, "runtime"),
    events: path.join(master, "runtime", "events.jsonl"),
    progress: path.join(master, "runtime", "progress.json"),
    halt: path.join(master, "runtime", "halt.json"),
    processedMessages: path.join(master, "runtime", "processed-messages.json"),
  };
}

export function ensureLayout(root: AgentRoot) {
  const p = paths(root);
  fs.mkdirSync(p.versions, { recursive: true });
  fs.mkdirSync(p.inbox, { recursive: true });
  fs.mkdirSync(p.inboxProcessed, { recursive: true });
  fs.mkdirSync(p.runtime, { recursive: true });
  return p;
}
