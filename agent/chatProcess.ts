/**
 * Chat OS process entry. Never contacts the executor — enqueue only.
 * Locked: docs/architecture-decisions-2026-09-29.md §6 §7
 */
import { chatEnqueue, runChatDaemon } from "./chat.ts";
import { ensureLayout } from "./paths.ts";

const root = process.argv.includes("--root")
  ? process.argv[process.argv.indexOf("--root") + 1]
  : process.cwd();

ensureLayout(root);

const enqIdx = process.argv.indexOf("--enqueue");
if (enqIdx >= 0) {
  const text = process.argv.slice(enqIdx + 1).join(" ");
  const msg = chatEnqueue(root, text);
  console.log(msg.id);
  process.exit(0);
}

runChatDaemon(root, process.stdin).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
