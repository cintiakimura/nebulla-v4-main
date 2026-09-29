/**
 * On-disk message queue. The only channel between chat and executor processes.
 * Locked: docs/architecture-decisions-2026-09-29.md §6 §7
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { AgentRoot } from "./paths.ts";
import { ensureLayout, paths } from "./paths.ts";
import { requireConstitution } from "./constitution.ts";

export type QueueMessage = {
  id: string;
  at: string;
  text: string;
  source: "chat";
};

export function enqueue(root: AgentRoot, text: string): QueueMessage {
  requireConstitution(root);
  const p = ensureLayout(root);
  const msg: QueueMessage = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    text,
    source: "chat",
  };
  const file = path.join(p.inbox, `${Date.now()}-${msg.id}.json`);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(msg, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, file);
  return msg;
}

export function listInbox(root: AgentRoot): { file: string; msg: QueueMessage }[] {
  requireConstitution(root);
  const p = ensureLayout(root);
  const names = fs.readdirSync(p.inbox).filter((n) => n.endsWith(".json"));
  names.sort();
  const out: { file: string; msg: QueueMessage }[] = [];
  for (const name of names) {
    const file = path.join(p.inbox, name);
    try {
      const msg = JSON.parse(fs.readFileSync(file, "utf8")) as QueueMessage;
      if (msg && typeof msg.text === "string") out.push({ file, msg });
    } catch {
      /* stray / partial files are harmless — leave them */
    }
  }
  return out;
}

export function markProcessed(root: AgentRoot, file: string) {
  const p = ensureLayout(root);
  const dest = path.join(p.inboxProcessed, path.basename(file));
  if (fs.existsSync(file)) fs.renameSync(file, dest);
}
