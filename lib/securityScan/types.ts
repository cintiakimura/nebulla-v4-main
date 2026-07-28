/** Shared Security Scan types (server + mirrored lightly on the client). */

export type SecuritySeverity = "critical" | "high" | "medium" | "low" | "info";

export type SecurityCategory =
  | "credentials"
  | "auth"
  | "dependencies"
  | "headers"
  | "config"
  | "other";

export type SecurityFixKind = "open-file" | "open-secrets" | "manual" | "docs";

export type SecurityConfidence = "high" | "medium" | "low";

export type SecurityFinding = {
  id: string;
  severity: SecuritySeverity;
  category: SecurityCategory;
  title: string;
  description: string;
  evidence?: string;
  path?: string;
  line?: number;
  recommendation: string;
  fixKind: SecurityFixKind;
  confidence: SecurityConfidence;
};

export type SecurityScanSummary = {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
};

export type SecurityScanOptions = {
  includeNpmAudit?: boolean;
  includeAuthHeuristics?: boolean;
  includeHeadersConfig?: boolean;
  /** Soft wall-clock budget for the whole scan (ms). */
  timeoutMs?: number;
};

export type SecurityScanReport = {
  ok: true;
  scannedAt: string;
  projectKey: string;
  projectName?: string;
  durationMs: number;
  summary: SecurityScanSummary;
  findings: SecurityFinding[];
  warnings?: string[];
  disclaimer: string;
};

export const SECURITY_SCAN_DISCLAIMER =
  "Security Scan is a guided audit for AI-built apps. It is not a professional penetration test or compliance certification.";

export function emptySummary(): SecurityScanSummary {
  return { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
}

export function summarizeFindings(findings: SecurityFinding[]): SecurityScanSummary {
  const summary = emptySummary();
  for (const f of findings) {
    summary[f.severity] += 1;
  }
  return summary;
}
