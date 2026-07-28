/**
 * Fixture tests for Security Scan.
 * Run: npx tsx scripts/test-security-scan.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runSecurityScan } from "../lib/securityScan/runSecurityScan.ts";

function mkFixture(name, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `nebula-sec-${name}-`));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, "utf8");
  }
  return root;
}

console.log("✓ planted secret detected");
{
  const root = mkFixture("planted", {
    "src/app.ts": 'const KEY = "xai-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcd";\n',
  });
  const report = await runSecurityScan({
    workspaceRoot: root,
    projectKey: "test-planted",
    options: { includeAuthHeuristics: false, includeHeadersConfig: false, includeNpmAudit: false },
  });
  assert.equal(report.ok, true);
  assert.ok(report.summary.critical + report.summary.high >= 1, "expected critical/high finding");
  for (const f of report.findings) {
    if (f.evidence) {
      assert.ok(!f.evidence.includes("ABCDEFGHIJKLMNOPQRSTUVWXYZ"), "must redact full secret");
      assert.ok(f.evidence.includes("…") || f.evidence.includes("[REDACTED]"), "redacted form");
    }
  }
  fs.rmSync(root, { recursive: true, force: true });
}

console.log("✓ .env.example does not flood critical");
{
  const root = mkFixture("example", {
    ".env.example": "XAI_API_KEY=YOUR_API_KEY_HERE\nOPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxx\n",
  });
  const report = await runSecurityScan({
    workspaceRoot: root,
    projectKey: "test-example",
    options: { includeAuthHeuristics: false, includeHeadersConfig: false, includeNpmAudit: false },
  });
  assert.equal(report.summary.critical, 0, "example env must not be critical");
  fs.rmSync(root, { recursive: true, force: true });
}

console.log("✓ clean project stays quiet");
{
  const root = mkFixture("clean", {
    "src/index.ts": "export const hello = 'world';\n",
    "README.md": "# App\n",
  });
  const report = await runSecurityScan({
    workspaceRoot: root,
    projectKey: "test-clean",
    options: { includeAuthHeuristics: false, includeHeadersConfig: false, includeNpmAudit: false },
  });
  assert.equal(report.summary.critical, 0);
  assert.equal(report.summary.high, 0);
  assert.ok(report.disclaimer.toLowerCase().includes("not a professional"));
  fs.rmSync(root, { recursive: true, force: true });
}

console.log("\nAll security scan fixture tests passed.");
