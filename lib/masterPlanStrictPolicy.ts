/**
 * Resolve MASTER_PLAN_STRICT with optional "new projects" override.
 *
 * Env:
 * - MASTER_PLAN_STRICT=off|warn|strict (base)
 * - MASTER_PLAN_STRICT_NEW_PROJECTS=strict|warn (optional override for new workspaces)
 * - MASTER_PLAN_STRICT_AFTER=ISO-8601 (cutoff; workspace mtime/birth >= after → new)
 */
import fs from "fs";
import path from "path";
import {
  readMasterPlanStrictMode,
  type MasterPlanStrictMode,
} from "./masterPlanCompleteness";

const CREATED_MARKER = ".nebula-created-at";

export function ensureWorkspaceCreatedMarker(workspaceRoot: string): string {
  const marker = path.join(workspaceRoot, CREATED_MARKER);
  try {
    if (!fs.existsSync(marker)) {
      fs.writeFileSync(marker, new Date().toISOString(), "utf8");
    }
    return fs.readFileSync(marker, "utf8").trim();
  } catch {
    return "";
  }
}

export function readWorkspaceCreatedAt(workspaceRoot: string): string | null {
  try {
    const marker = path.join(workspaceRoot, CREATED_MARKER);
    if (fs.existsSync(marker)) {
      const t = fs.readFileSync(marker, "utf8").trim();
      if (t) return t;
    }
    const st = fs.statSync(workspaceRoot);
    const ms = Number(st.birthtimeMs) > 0 ? st.birthtimeMs : st.ctimeMs;
    return new Date(ms).toISOString();
  } catch {
    return null;
  }
}

export function resolveMasterPlanStrictMode(
  workspaceRoot?: string,
  env: NodeJS.ProcessEnv = process.env,
): MasterPlanStrictMode {
  const base = readMasterPlanStrictMode(env);
  const newModeRaw = String(env.MASTER_PLAN_STRICT_NEW_PROJECTS || "")
    .trim()
    .toLowerCase();
  const newMode =
    newModeRaw === "strict" || newModeRaw === "warn" || newModeRaw === "off"
      ? (newModeRaw as MasterPlanStrictMode)
      : null;
  if (!newMode || !workspaceRoot) return base;

  const afterRaw = String(env.MASTER_PLAN_STRICT_AFTER || "").trim();
  if (!afterRaw) return base;
  const after = Date.parse(afterRaw);
  if (!Number.isFinite(after)) return base;

  const createdIso = readWorkspaceCreatedAt(workspaceRoot);
  if (!createdIso) return base;
  const created = Date.parse(createdIso);
  if (!Number.isFinite(created)) return base;
  return created >= after ? newMode : base;
}
