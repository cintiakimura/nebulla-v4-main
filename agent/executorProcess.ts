/**
 * Executor OS process entry. No imports from chat.
 * Locked: docs/architecture-decisions-2026-09-29.md §5 §7
 */
import { runExecutorLoop } from "./executor.ts";
import { ensureLayout } from "./paths.ts";

const root = process.argv.includes("--root")
  ? process.argv[process.argv.indexOf("--root") + 1]
  : process.cwd();

ensureLayout(root);
runExecutorLoop(root).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
