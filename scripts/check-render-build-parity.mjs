#!/usr/bin/env node
/**
 * Render build parity gate (Layer 0).
 * Docker on Render runs `npm run build` (Vite). Catch client resolve errors before deploy.
 *
 * Usage: npm run check:render-build
 */
import { spawnSync } from "node:child_process";

function run(label, cmd, args) {
  console.log(`\n→ ${label}: ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) {
    console.error(`\nFAIL: ${label}`);
    process.exit(r.status || 1);
  }
}

run("Vite production build (Render Docker)", "npm", ["run", "build"]);
run("ui-brief primary prompt guard", "npm", ["run", "check:ui-brief-primary"]);
run("Master Plan completeness", "npm", ["run", "test:master-plan"]);
run("UI brief", "npm", ["run", "test:ui-brief"]);
run("Mind Map fidelity", "npm", ["run", "test:mind-map"]);
run("Chat mode", "npm", ["run", "test:chat-mode"]);
run("Master Plan status UI", "npm", ["run", "test:master-plan-status"]);
run("Methodology pilots", "npm", ["run", "test:methodology-pilots"]);
run("Go slice + security propose", "npm", ["run", "test:go-slice"]);
run("Next action + strict policy", "npm", ["run", "test:ide-next-action"]);
run("Contract telemetry", "npm", ["run", "test:contract-telemetry"]);
run("App Status", "npm", ["run", "test:app-status"]);
run("App Status smoke", "npm", ["run", "test:app-status-smoke"]);
run("UI Gen smoke", "npm", ["run", "test:ui-gen"]);

console.log("\n✓ Render build parity + contract tests passed.\n");
