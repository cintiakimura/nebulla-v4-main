/**
 * Single source of truth for server-side path anchors (cwd = Node process working directory).
 * Import this from server.ts, conversationLog, guardian, and asset loaders so paths stay aligned.
 */

import fs from "fs";
import path from "path";

/** Persisted data: conversation logs, guardian store — always the resolved cwd, never a parent. */
export function getNebullaPersistRoot(cwd: string = process.cwd()): string {
  return path.resolve(cwd);
}

/**
 * Orchestration docs (`master-plan.json`, UI studio markdown, etc.).
 * Prefer `./nebula-project` when it contains `master-plan.json` (matches server layout).
 */
export function getNebulaProjectDocsRoot(cwd: string = process.cwd()): string {
  const r = path.resolve(cwd);
  if (fs.existsSync(path.join(r, "nebula-project", "master-plan.json"))) {
    return path.join(r, "nebula-project");
  }
  return r;
}

/**
 * Product tree for bundled assets when the repo uses `nebula-product/server.ts` (nested app).
 */
export function getNebullaProductLayoutRoot(cwd: string = process.cwd()): string {
  const r = path.resolve(cwd);
  if (fs.existsSync(path.join(r, "nebula-product", "server.ts"))) {
    return path.join(r, "nebula-product");
  }
  return r;
}
