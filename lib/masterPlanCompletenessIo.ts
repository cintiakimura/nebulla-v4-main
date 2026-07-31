/**
 * Node/IO helpers for Master Plan completeness (fs stays off the browser bundle).
 */
import fs from "fs";
import path from "path";
import {
  assessMasterPlanCompleteness,
  type AssessMasterPlanOptions,
  type MasterPlanCompletenessResult,
  type MasterPlanStrictMode,
} from "./masterPlanCompleteness";

export function readUiBriefLength(workspaceRoot: string): number {
  try {
    const briefPath = path.join(workspaceRoot, "nebula-ui-studio", "ui-brief.md");
    if (!fs.existsSync(briefPath)) return 0;
    return fs.readFileSync(briefPath, "utf8").trim().length;
  } catch {
    return 0;
  }
}

/** Assess with optional on-disk ui-brief length. */
export function assessMasterPlanCompletenessWithWorkspace(
  opts: Omit<AssessMasterPlanOptions, "uiBriefLength"> & { workspaceRoot?: string },
): MasterPlanCompletenessResult {
  const checkUiBrief =
    opts.checkUiBrief ?? Boolean(opts.workspaceRoot && opts.workspaceRoot.trim());
  const uiBriefLength =
    checkUiBrief && opts.workspaceRoot
      ? readUiBriefLength(opts.workspaceRoot)
      : undefined;
  return assessMasterPlanCompleteness({
    plan: opts.plan,
    mode: opts.mode,
    checkUiBrief,
    uiBriefLength,
  });
}

export function assessMasterPlanFile(
  masterPlanPath: string,
  opts?: { mode?: MasterPlanStrictMode; workspaceRoot?: string; checkUiBrief?: boolean },
): MasterPlanCompletenessResult {
  let raw: Record<string, unknown> = {};
  try {
    if (fs.existsSync(masterPlanPath)) {
      raw = JSON.parse(fs.readFileSync(masterPlanPath, "utf8")) as Record<string, unknown>;
    }
  } catch {
    raw = {};
  }
  const workspaceRoot = opts?.workspaceRoot ?? path.dirname(masterPlanPath);
  return assessMasterPlanCompletenessWithWorkspace({
    plan: raw,
    mode: opts?.mode,
    workspaceRoot,
    checkUiBrief: opts?.checkUiBrief,
  });
}
