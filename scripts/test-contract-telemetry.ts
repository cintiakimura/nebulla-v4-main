import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  recordContractTelemetry,
  summarizeContractTelemetry,
} from "../lib/nebulaContractTelemetry.ts";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nebulla-telemetry-"));
const logPath = path.join(tmp, "contract-telemetry.jsonl");
const prev = process.cwd();
process.chdir(tmp);
fs.mkdirSync("data", { recursive: true });

recordContractTelemetry({
  event: "master_plan_go_gate",
  mode: "warn",
  shape: "legacy",
  allowGo: true,
  outcome: "warned",
  gapCount: 2,
});
recordContractTelemetry({
  event: "ui_gen_gate",
  gate: "pass",
});
recordContractTelemetry({
  event: "app_status_fix_outcome",
  outcome: "reachedGreen",
  reloadCycles: 1,
});

const s = summarizeContractTelemetry(path.join(tmp, "data", "contract-telemetry.jsonl"));
assert.equal(s.total, 3);
assert.equal(s.masterPlanGo.warned, 1);
assert.equal(s.uiGen.pass, 1);
assert.equal(s.appStatus.reachedGreen, 1);
assert.ok(fs.existsSync(path.join(tmp, "data", "contract-telemetry.jsonl")));

process.chdir(prev);
console.log("\n✓ contract telemetry tests passed\n");
void logPath;
