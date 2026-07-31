/**
 * Summarize data/contract-telemetry.jsonl
 * Run: npm run telemetry:contracts
 */
import { summarizeContractTelemetry } from "../lib/nebulaContractTelemetry.ts";

const s = summarizeContractTelemetry();
console.log(JSON.stringify(s, null, 2));
if (s.total === 0) {
  console.log("\nNo events yet. Use the IDE (Go / Mind Map / UI Gen / App Status fix) or wait for server logs.");
}
