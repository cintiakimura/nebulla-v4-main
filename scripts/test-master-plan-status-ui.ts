/**
 * Friendly Master Plan status copy (no gap-code dumps).
 * Run: npm run test:master-plan-status
 */
import assert from "node:assert/strict";
import {
  formatGoBlockedByPlanMessage,
  summarizeMasterPlanStatus,
  type MasterPlanStatus,
} from "../src/lib/masterPlanStatus.ts";

function section(name: string) {
  console.log(`\n✓ ${name}`);
}

section("complete → ok tone");
{
  const s = summarizeMasterPlanStatus({
    mode: "warn",
    ok: true,
    allowGo: true,
    shape: "complete",
    gaps: [],
  });
  assert.equal(s.tone, "ok");
}

section("block gaps → friendly lines without codes");
{
  const status: MasterPlanStatus = {
    mode: "strict",
    ok: false,
    allowGo: false,
    shape: "incomplete",
    gaps: [
      {
        code: "SEC_RLS_MISSING",
        section: "2",
        severity: "block",
        message: "raw",
        remediation: "x",
      },
      {
        code: "PAGES_THIN",
        section: "4",
        severity: "block",
        message: "raw",
        remediation: "x",
      },
    ],
  };
  const s = summarizeMasterPlanStatus(status);
  assert.equal(s.tone, "block");
  assert.ok(s.lines.some((l) => /private data|security/i.test(l)));
  assert.ok(!s.lines.some((l) => /SEC_RLS/.test(l)));
}

section("Go blocked message is beginner-friendly");
{
  const msg = formatGoBlockedByPlanMessage({
    code: "MASTER_PLAN_INCOMPLETE",
    masterPlanCompleteness: {
      mode: "strict",
      gaps: [
        {
          code: "SEC_AUTH_MISSING",
          section: "2",
          severity: "block",
          message: "No auth",
          remediation: "Add auth",
        },
      ],
    },
  } as unknown as { error?: string; masterPlanCompleteness?: MasterPlanStatus });
  assert.match(msg, /Go is paused/i);
  assert.match(msg, /sign in/i);
  assert.doesNotMatch(msg, /SEC_AUTH/);
}

console.log("\nAll master-plan status UI tests passed.\n");
