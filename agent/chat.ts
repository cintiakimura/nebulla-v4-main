/**
 * Chat process. Accepts input at any time; only enqueues.
 * Locked: docs/architecture-decisions-2026-09-29.md §6
 */
import readline from "node:readline";
import { requireConstitution } from "./constitution.ts";
import { enqueue } from "./queue.ts";
import type { AgentRoot } from "./paths.ts";

export function chatEnqueue(root: AgentRoot, text: string) {
  requireConstitution(root);
  return enqueue(root, text);
}

export async function runChatDaemon(root: AgentRoot, input: NodeJS.ReadableStream) {
  requireConstitution(root);
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of rl) {
    const text = line.trim();
    if (!text) continue;
    chatEnqueue(root, text);
  }
}
