/**
 * Per-project Nebula Swarm durable flags (token / call discipline).
 *
 * **Philosophy (project-execution-rules.md):** Planner + Researcher run **once** in **Pre–Phase 0**
 * only; Tester and Reviewer run only on **explicit** user phrasing — not routine coding turns.
 *
 * Stored under the **isolated workspace** `nebula-project/nebula-swarm-state.json` (not in
 * `master-plan.json` tab content) so Master Plan UI stays unchanged.
 */

import fs from "fs";
import path from "path";

export const SWARM_STATE_FILENAME = "nebula-swarm-state.json";

export type NebulaSwarmStateFile = {
  schemaVersion: 1;
  /** Planner support agent has completed its one allowed run for this project. */
  plannerDone: boolean;
  /** Researcher support agent has completed its one allowed run (always with Planner). */
  researcherDone: boolean;
  updatedAt?: string;
};

const DEFAULT_STATE: NebulaSwarmStateFile = {
  schemaVersion: 1,
  plannerDone: false,
  researcherDone: false,
};

export function getNebulaSwarmStatePath(workspaceRoot: string): string {
  return path.join(workspaceRoot, "nebula-project", SWARM_STATE_FILENAME);
}

export function readNebulaSwarmState(workspaceRoot: string): NebulaSwarmStateFile {
  const fp = getNebulaSwarmStatePath(workspaceRoot);
  try {
    if (!fs.existsSync(fp)) return { ...DEFAULT_STATE };
    const raw = fs.readFileSync(fp, "utf8");
    const j = JSON.parse(raw) as Partial<NebulaSwarmStateFile>;
    return {
      schemaVersion: 1,
      plannerDone: Boolean(j.plannerDone),
      researcherDone: Boolean(j.researcherDone),
      updatedAt: typeof j.updatedAt === "string" ? j.updatedAt : undefined,
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function writeNebulaSwarmState(workspaceRoot: string, next: NebulaSwarmStateFile): void {
  const fp = getNebulaSwarmStatePath(workspaceRoot);
  const dir = path.dirname(fp);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const payload: NebulaSwarmStateFile = {
    ...next,
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(fp, JSON.stringify(payload, null, 2), "utf8");
}
