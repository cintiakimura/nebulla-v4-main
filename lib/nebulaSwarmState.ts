/**
 * Per-project Nebula Swarm — **lean** durable state (optional audit only).
 * Planner / Researcher removed; no automatic support agents on chat.
 */

import fs from "fs";
import path from "path";

export const SWARM_STATE_FILENAME = "nebula-swarm-state.json";

export type NebulaSwarmStateFile = {
  schemaVersion: 2;
  /** ISO time of last successful manual "Run and Test" (Quality agent). */
  qualityLastRunAt?: string;
};

const DEFAULT_STATE: NebulaSwarmStateFile = {
  schemaVersion: 2,
};

function migrateFromV1(raw: Record<string, unknown>): NebulaSwarmStateFile {
  return {
    schemaVersion: 2,
    qualityLastRunAt: typeof raw.qualityLastRunAt === "string" ? raw.qualityLastRunAt : undefined,
  };
}

export function getNebulaSwarmStatePath(workspaceRoot: string): string {
  return path.join(workspaceRoot, "nebula-project", SWARM_STATE_FILENAME);
}

export function readNebulaSwarmState(workspaceRoot: string): NebulaSwarmStateFile {
  const fp = getNebulaSwarmStatePath(workspaceRoot);
  try {
    if (!fs.existsSync(fp)) return { ...DEFAULT_STATE };
    const raw = fs.readFileSync(fp, "utf8");
    const j = JSON.parse(raw) as Record<string, unknown>;
    const sv = j.schemaVersion;
    if (sv === 1 || j.plannerDone !== undefined || j.researcherDone !== undefined) {
      return migrateFromV1(j);
    }
    return {
      schemaVersion: 2,
      qualityLastRunAt: typeof j.qualityLastRunAt === "string" ? j.qualityLastRunAt : undefined,
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
    schemaVersion: 2,
  };
  fs.writeFileSync(fp, JSON.stringify(payload, null, 2), "utf8");
}
