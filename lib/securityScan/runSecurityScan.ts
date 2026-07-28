import {
  SECURITY_SCAN_DISCLAIMER,
  summarizeFindings,
  type SecurityFinding,
  type SecurityScanOptions,
  type SecurityScanReport,
} from "./types";
import { walkWorkspaceFiles } from "./walkWorkspace";
import { scanCredentials } from "./checkers/credentials";
import { scanAuthHeuristics } from "./checkers/authHeuristics";
import { scanDependencies } from "./checkers/dependencies";
import { scanHeadersConfig } from "./checkers/headersConfig";

const SEVERITY_RANK: Record<SecurityFinding["severity"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

export async function runSecurityScan(params: {
  workspaceRoot: string;
  projectKey: string;
  projectName?: string;
  options?: SecurityScanOptions;
}): Promise<SecurityScanReport> {
  const started = Date.now();
  const options = params.options || {};
  const timeoutMs = options.timeoutMs ?? 12_000;
  const warnings: string[] = [];
  const findings: SecurityFinding[] = [];

  const deadline = started + timeoutMs;

  const { files, warnings: walkWarnings } = walkWorkspaceFiles(params.workspaceRoot);
  warnings.push(...walkWarnings);

  if (files.length === 0 && walkWarnings.length > 0) {
    return {
      ok: true,
      scannedAt: new Date().toISOString(),
      projectKey: params.projectKey,
      projectName: params.projectName,
      durationMs: Date.now() - started,
      summary: summarizeFindings([]),
      findings: [],
      warnings,
      disclaimer: SECURITY_SCAN_DISCLAIMER,
    };
  }

  // P0 — always
  findings.push(...scanCredentials(files));

  // P1 — auth heuristics (default on)
  if (options.includeAuthHeuristics !== false) {
    if (Date.now() < deadline) {
      findings.push(...scanAuthHeuristics(files));
    } else {
      warnings.push("Auth heuristics skipped — scan time budget reached.");
    }
  }

  // v1.1 headers (default on, cheap)
  if (options.includeHeadersConfig !== false) {
    if (Date.now() < deadline) {
      findings.push(...scanHeadersConfig(params.workspaceRoot, files));
    }
  }

  // P2 — npm audit only when requested (can be slow)
  if (options.includeNpmAudit === true) {
    if (Date.now() < deadline) {
      const dep = scanDependencies(params.workspaceRoot, params.projectKey);
      findings.push(...dep.findings);
      warnings.push(...dep.warnings);
    } else {
      warnings.push("Dependency audit skipped — scan time budget reached.");
    }
  }

  findings.sort((a, b) => {
    const dr = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (dr !== 0) return dr;
    return (a.path || "").localeCompare(b.path || "");
  });

  return {
    ok: true,
    scannedAt: new Date().toISOString(),
    projectKey: params.projectKey,
    projectName: params.projectName,
    durationMs: Date.now() - started,
    summary: summarizeFindings(findings),
    findings,
    warnings: warnings.length ? warnings : undefined,
    disclaimer: SECURITY_SCAN_DISCLAIMER,
  };
}
