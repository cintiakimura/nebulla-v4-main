/**
 * Master Plan completeness fixtures (Phase C).
 * Run: npm run test:master-plan
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assessMasterPlanCompleteness,
  isMasterPlanCompleteForDiscovery,
  type MasterPlanStrictMode,
} from "../lib/masterPlanCompleteness.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, "../nebula-project/fixtures/master-plan");

function loadFixture(name: string): Record<string, unknown> {
  const p = path.join(FIXTURE_DIR, name);
  return JSON.parse(fs.readFileSync(p, "utf8")) as Record<string, unknown>;
}

function section(name: string) {
  console.log(`\n✓ ${name}`);
}

function blockCodes(plan: Record<string, unknown>, mode: MasterPlanStrictMode) {
  const r = assessMasterPlanCompleteness({ plan, mode, checkUiBrief: false });
  return {
    result: r,
    blocks: r.gaps.filter((g) => g.severity === "block").map((g) => g.code),
  };
}

section("good-crud-auth: pass in off/warn/strict (plan body)");
{
  const plan = loadFixture("good-crud-auth.json");
  for (const mode of ["off", "warn", "strict"] as MasterPlanStrictMode[]) {
    const { result, blocks } = blockCodes(plan, mode);
    assert.equal(blocks.length, 0, `good fixture unexpected blocks in ${mode}: ${blocks.join(",")}`);
    assert.equal(result.allowGo, true);
    assert.equal(result.shape, "complete");
  }
  assert.equal(isMasterPlanCompleteForDiscovery(plan), true);
}

section("thin-legacy: allowGo in off/warn; block in strict");
{
  const plan = loadFixture("thin-legacy.json");
  const off = blockCodes(plan, "off");
  assert.equal(off.result.allowGo, true);
  assert.ok(off.blocks.length > 0, "thin-legacy should have block gaps");

  const warn = blockCodes(plan, "warn");
  assert.equal(warn.result.allowGo, true);
  assert.ok(warn.result.gaps.length > 0);

  const strict = blockCodes(plan, "strict");
  assert.equal(strict.result.allowGo, false);
  assert.equal(strict.result.ok, false);
  assert.ok(
    strict.blocks.includes("PAGES_EMPTY") || strict.blocks.includes("PAGES_THIN"),
    `expected pages gap, got ${strict.blocks.join(",")}`,
  );
  assert.equal(isMasterPlanCompleteForDiscovery(plan), false);
}

section("naive-insecure: security gaps are warn-only (MVP — never hard-block Go)");
{
  const plan = loadFixture("naive-insecure.json");
  const warn = blockCodes(plan, "warn");
  assert.equal(warn.result.allowGo, true);
  const sec = warn.result.gaps.filter((g) => g.code.startsWith("SEC_"));
  assert.ok(sec.length > 0, "expected SEC_* gaps");
  assert.ok(sec.every((g) => g.severity === "warn"), "SEC_* must be warn, not block");

  const strict = blockCodes(plan, "strict");
  // Structural page gaps may still block; SEC alone must not.
  assert.ok(
    !strict.blocks.some((c) => c.startsWith("SEC_")),
    `SEC must not be block severity, got ${strict.blocks.join(",")}`,
  );
  const secStrict = strict.result.gaps.filter((g) => g.code.startsWith("SEC_"));
  assert.ok(secStrict.every((g) => g.severity === "warn"));
}

section("ui-brief missing blocks Go only when checkUiBrief + strict");
{
  const plan = loadFixture("good-crud-auth.json");
  const withBriefCheck = assessMasterPlanCompleteness({
    plan,
    mode: "strict",
    checkUiBrief: true,
    uiBriefLength: 0,
  });
  assert.ok(
    withBriefCheck.gaps.some((g) => g.code === "UI_BRIEF_MISSING"),
    "expected UI_BRIEF_MISSING",
  );
  assert.equal(withBriefCheck.allowGo, false);
}

console.log("\nAll master-plan completeness tests passed.\n");
