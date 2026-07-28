import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { SecurityFinding } from "../types";
import { withId } from "../findingId";

const AUDIT_CACHE = new Map<string, { at: number; findings: SecurityFinding[]; warnings: string[] }>();
const CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * Optional npm audit. Returns findings + warnings; never fabricates a clean bill on failure.
 */
export function scanDependencies(
  workspaceRoot: string,
  projectKey: string,
): { findings: SecurityFinding[]; warnings: string[] } {
  const pkg = path.join(workspaceRoot, "package.json");
  if (!fs.existsSync(pkg)) {
    return { findings: [], warnings: ["Dependency audit skipped — no package.json in project."] };
  }

  const cached = AUDIT_CACHE.get(projectKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return { findings: cached.findings, warnings: [...cached.warnings, "Dependency audit served from short cache."] };
  }

  const hasNpmLock = fs.existsSync(path.join(workspaceRoot, "package-lock.json"));
  const hasPnpm = fs.existsSync(path.join(workspaceRoot, "pnpm-lock.yaml"));
  const hasYarn = fs.existsSync(path.join(workspaceRoot, "yarn.lock"));
  if (!hasNpmLock && !hasPnpm && !hasYarn) {
    return {
      findings: [],
      warnings: ["Dependency audit skipped — no lockfile (package-lock.json / pnpm-lock.yaml / yarn.lock)."],
    };
  }

  const cmd = hasPnpm ? "pnpm" : hasYarn ? "yarn" : "npm";
  const args =
    cmd === "yarn"
      ? ["npm", "audit", "--json"]
      : cmd === "pnpm"
        ? ["audit", "--json"]
        : ["audit", "--json"];

  let result: ReturnType<typeof spawnSync>;
  try {
    result = spawnSync(cmd, args, {
      cwd: workspaceRoot,
      encoding: "utf8",
      timeout: 45_000,
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch (e) {
    return {
      findings: [],
      warnings: [`Dependency audit failed to start: ${e instanceof Error ? e.message : String(e)}`],
    };
  }

  const stdout = String(result.stdout || "");
  if (!stdout.trim()) {
    return {
      findings: [],
      warnings: [
        `Dependency audit produced no JSON (exit ${result.status ?? "?"}). Install dependencies in the project workspace, then re-run.`,
      ],
    };
  }

  let data: unknown;
  try {
    data = JSON.parse(stdout);
  } catch {
    return { findings: [], warnings: ["Dependency audit output was not valid JSON."] };
  }

  const findings = mapNpmAuditJson(data);
  const warnings: string[] = [];
  if (findings.length === 0 && result.status !== 0) {
    warnings.push("npm audit exited non-zero but no actionable advisories were parsed.");
  }

  AUDIT_CACHE.set(projectKey, { at: Date.now(), findings, warnings });
  return { findings, warnings };
}

function mapNpmAuditJson(data: unknown): SecurityFinding[] {
  const out: SecurityFinding[] = [];
  if (!data || typeof data !== "object") return out;
  const root = data as Record<string, unknown>;

  // npm v7+ advisories map
  const vulns = root.vulnerabilities;
  if (vulns && typeof vulns === "object") {
    for (const [name, meta] of Object.entries(vulns as Record<string, unknown>)) {
      if (!meta || typeof meta !== "object") continue;
      const m = meta as Record<string, unknown>;
      const severity = mapNpmSeverity(String(m.severity || "moderate"));
      const via = Array.isArray(m.via) ? m.via : [];
      let title = `Vulnerable dependency: ${name}`;
      let cve = "";
      for (const v of via) {
        if (v && typeof v === "object") {
          const o = v as Record<string, unknown>;
          if (typeof o.title === "string") title = o.title;
          if (typeof o.url === "string" && /GHSA|CVE/i.test(o.url)) cve = o.url;
          break;
        }
      }
      const fixAvailable = m.fixAvailable;
      const fixHint =
        fixAvailable && typeof fixAvailable === "object"
          ? `Upgrade ${name} (fix available per npm audit).`
          : `Review and upgrade ${name} to a non-vulnerable version.`;

      out.push(
        withId({
          rule: "deps.npm_audit",
          path: "package.json",
          severity,
          category: "dependencies",
          title,
          description: cve
            ? `npm audit reported an issue in ${name}. Advisory: ${cve}`
            : `npm audit reported a ${String(m.severity || "moderate")} issue in ${name}.`,
          recommendation: fixHint,
          fixKind: "manual",
          confidence: "medium",
          fingerprint: `${name}:${String(m.severity || "")}:${cve}`,
        }),
      );
      if (out.length >= 40) break;
    }
  }

  return out;
}

function mapNpmSeverity(s: string): SecurityFinding["severity"] {
  const v = s.toLowerCase();
  if (v === "critical") return "critical";
  if (v === "high") return "high";
  if (v === "moderate" || v === "medium") return "medium";
  if (v === "low") return "low";
  return "info";
}
