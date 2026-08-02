import type express from "express";
import type { SecurityScanOptions, SecurityScanReport } from "./types";
import { runSecurityScan } from "./runSecurityScan";

type ProjectPaths = {
  workspaceRoot: string;
  projectKey: string;
};

const latestByProject = new Map<string, SecurityScanReport>();

export function registerSecurityScanRoutes(
  app: express.Application,
  deps: {
    projectPathsFor: (req: express.Request) => ProjectPaths;
    projectNameFromReq?: (req: express.Request) => string | undefined;
  },
): void {
  app.post("/api/security-scan", async (req, res) => {
    try {
      const pp = deps.projectPathsFor(req);
      const projectName =
        deps.projectNameFromReq?.(req) ||
        (typeof req.body?.projectName === "string" ? req.body.projectName.trim() : undefined) ||
        (typeof req.query.projectName === "string" ? String(req.query.projectName).trim() : undefined);

      const options: SecurityScanOptions = {
        includeNpmAudit: Boolean(req.body?.includeNpmAudit),
        includeAuthHeuristics: req.body?.includeAuthHeuristics === false ? false : true,
        includeHeadersConfig: req.body?.includeHeadersConfig === false ? false : true,
        timeoutMs: typeof req.body?.timeoutMs === "number" ? req.body.timeoutMs : 12_000,
      };

      const report = await runSecurityScan({
        workspaceRoot: pp.workspaceRoot,
        projectKey: pp.projectKey,
        projectName: projectName || undefined,
        options,
      });

      // Never persist raw evidence beyond memory cache of the report (already redacted).
      latestByProject.set(pp.projectKey, report);

      return res.json(report);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Security scan failed";
      console.error("[security-scan]", msg);
      return res.status(500).json({
        ok: false,
        error: msg,
        disclaimer:
          "Security Scan is a guided audit for AI-built apps. It is not a professional penetration test or compliance certification.",
      });
    }
  });

  app.get("/api/security-scan/latest", (req, res) => {
    try {
      const pp = deps.projectPathsFor(req);
      const report = latestByProject.get(pp.projectKey);
      if (!report) {
        // 200 + empty avoids noisy browser console 404s before the first scan.
        return res.status(200).json({
          ok: true,
          empty: true,
          projectKey: pp.projectKey,
          findings: [],
        });
      }
      return res.json(report);
    } catch (e) {
      return res.status(500).json({
        ok: false,
        error: e instanceof Error ? e.message : "Failed to load latest scan",
      });
    }
  });
}
