/**
 * Dev/admin endpoints for Figma side-ingest status/run.
 * Gated: enabled when FIGMA_INGEST_API=1, or when NODE_ENV !== "production".
 * Does not affect Generate UI / workflow.
 */
import type { Express, Request, Response } from "express";
import { spawn } from "node:child_process";
import path from "node:path";
import {
  defaultFigmaLibraryRoot,
  describeStuckHint,
  ingestStatusPath,
  readStatusFile,
  recoverStaleRunning,
  rollDayIfNeeded,
  writeStatusFile,
} from "./figmaIngestStatus";

function ingestApiEnabled(): boolean {
  if (process.env.FIGMA_INGEST_API === "1" || process.env.FIGMA_INGEST_API === "true") {
    return true;
  }
  return (process.env.NODE_ENV || "development") !== "production";
}

export function registerFigmaIngestAdminRoutes(app: Express, repoRoot: string = process.cwd()): void {
  const libraryRoot = defaultFigmaLibraryRoot(repoRoot);
  const statusFile = ingestStatusPath(libraryRoot);

  app.get("/api/admin/figma-ingest/status", (_req: Request, res: Response) => {
    if (!ingestApiEnabled()) {
      return res.status(404).json({ error: "figma_ingest_api_disabled" });
    }
    const now = new Date();
    let status = recoverStaleRunning(rollDayIfNeeded(readStatusFile(statusFile, now), now), now);
    const stuckHint = describeStuckHint(status, now);
    return res.json({
      ...status,
      stuckHint,
      libraryRoot: path.relative(repoRoot, libraryRoot),
      statusFile: path.relative(repoRoot, statusFile),
    });
  });

  app.post("/api/admin/figma-ingest/run", (_req: Request, res: Response) => {
    if (!ingestApiEnabled()) {
      return res.status(404).json({ error: "figma_ingest_api_disabled" });
    }
    const now = new Date();
    let status = recoverStaleRunning(rollDayIfNeeded(readStatusFile(statusFile, now), now), now);
    if (status.state === "running" && !describeStuckHint(status, now)) {
      return res.status(409).json({ error: "already_running", status });
    }
    if (status.state === "running" && describeStuckHint(status, now)) {
      status = recoverStaleRunning(status, now);
      writeStatusFile(statusFile, status);
    }

    const script = path.join(repoRoot, "scripts", "figma-ingest-daily.ts");
    const child = spawn("npx", ["tsx", script], {
      cwd: repoRoot,
      env: process.env,
      detached: true,
      stdio: "ignore",
      shell: process.platform === "win32",
    });
    child.unref();

    return res.status(202).json({
      ok: true,
      message: "figma ingest started (side job)",
      pid: child.pid ?? null,
      statusFile: path.relative(repoRoot, statusFile),
    });
  });
}
