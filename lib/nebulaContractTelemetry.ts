/**
 * Privacy-safe contract telemetry (Layer 0).
 * Counts / enums only — no prompts, PII, file contents, or gap codes.
 *
 * Append-only JSONL: data/contract-telemetry.jsonl
 * Summarize: npm run telemetry:contracts
 */
import fs from "fs";
import path from "path";

export type ContractTelemetryEvent =
  | {
      event: "master_plan_go_gate";
      mode: string;
      shape: string;
      allowGo: boolean;
      outcome: "blocked" | "warned" | "ok";
      gapCount: number;
    }
  | {
      event: "go_apply_result";
      applyKind: "planOnly" | "hasAppFiles" | "unknown";
      writtenCount: number;
      sliceLabel?: string;
    }
  | {
      event: "mindmap_fidelity";
      mode: string;
      extraRouteCount: number;
      allowWrite: boolean;
    }
  | {
      event: "app_status_fix_outcome";
      outcome: "reachedGreen" | "stillRed" | "unknown";
      reloadCycles: number;
    }
  | {
      event: "ui_gen_gate";
      gate: "pass" | "repair" | "weak" | "unknown";
    };

const REL = path.join("data", "contract-telemetry.jsonl");

function resolveLogPath(): string {
  return path.join(process.cwd(), REL);
}

/** Append one event (best-effort; never throws to callers). */
export function recordContractTelemetry(payload: ContractTelemetryEvent): void {
  const row = {
    ts: new Date().toISOString(),
    ...payload,
  };
  try {
    console.log(`[contract-telemetry] ${JSON.stringify(row)}`);
  } catch {
    /* ignore */
  }
  try {
    const abs = resolveLogPath();
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.appendFileSync(abs, `${JSON.stringify(row)}\n`, "utf8");
  } catch {
    /* disk optional in some deploys */
  }
}

export function contractTelemetryLogPath(): string {
  return resolveLogPath();
}

export type ContractTelemetrySummary = {
  path: string;
  total: number;
  byEvent: Record<string, number>;
  masterPlanGo: { ok: number; warned: number; blocked: number };
  goApply: { planOnly: number; hasAppFiles: number; unknown: number };
  mindMap: { writes: number; extras: number; blockedWrites: number };
  appStatus: { reachedGreen: number; stillRed: number; unknown: number };
  uiGen: { pass: number; repair: number; weak: number; unknown: number };
};

export function summarizeContractTelemetry(logPath?: string): ContractTelemetrySummary {
  const abs = logPath || resolveLogPath();
  const summary: ContractTelemetrySummary = {
    path: abs,
    total: 0,
    byEvent: {},
    masterPlanGo: { ok: 0, warned: 0, blocked: 0 },
    goApply: { planOnly: 0, hasAppFiles: 0, unknown: 0 },
    mindMap: { writes: 0, extras: 0, blockedWrites: 0 },
    appStatus: { reachedGreen: 0, stillRed: 0, unknown: 0 },
    uiGen: { pass: 0, repair: 0, weak: 0, unknown: 0 },
  };
  if (!fs.existsSync(abs)) return summary;
  const lines = fs.readFileSync(abs, "utf8").split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    let row: Record<string, unknown>;
    try {
      row = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    const event = String(row.event || "");
    if (!event) continue;
    summary.total += 1;
    summary.byEvent[event] = (summary.byEvent[event] || 0) + 1;
    if (event === "master_plan_go_gate") {
      const o = String(row.outcome);
      if (o === "blocked") summary.masterPlanGo.blocked += 1;
      else if (o === "warned") summary.masterPlanGo.warned += 1;
      else summary.masterPlanGo.ok += 1;
    } else if (event === "go_apply_result") {
      const k = String(row.applyKind);
      if (k === "planOnly") summary.goApply.planOnly += 1;
      else if (k === "hasAppFiles") summary.goApply.hasAppFiles += 1;
      else summary.goApply.unknown += 1;
    } else if (event === "mindmap_fidelity") {
      summary.mindMap.writes += 1;
      if (Number(row.extraRouteCount) > 0) summary.mindMap.extras += 1;
      if (row.allowWrite === false) summary.mindMap.blockedWrites += 1;
    } else if (event === "app_status_fix_outcome") {
      const o = String(row.outcome);
      if (o === "reachedGreen") summary.appStatus.reachedGreen += 1;
      else if (o === "stillRed") summary.appStatus.stillRed += 1;
      else summary.appStatus.unknown += 1;
    } else if (event === "ui_gen_gate") {
      const g = String(row.gate);
      if (g === "pass") summary.uiGen.pass += 1;
      else if (g === "repair") summary.uiGen.repair += 1;
      else if (g === "weak") summary.uiGen.weak += 1;
      else summary.uiGen.unknown += 1;
    }
  }
  return summary;
}
