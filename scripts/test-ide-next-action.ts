import assert from "node:assert/strict";
import { computeIdeNextAction } from "../src/lib/ideNextAction.ts";
import { shouldApplyUiToPreview } from "../lib/uiGenerationEngine/applyPreviewShell.ts";
import {
  ensureWorkspaceCreatedMarker,
  resolveMasterPlanStrictMode,
} from "../lib/masterPlanStrictPolicy.ts";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

assert.equal(shouldApplyUiToPreview("pass"), true);
assert.equal(shouldApplyUiToPreview("repair"), false);
assert.equal(shouldApplyUiToPreview("weak"), false);

const pending = computeIdeNextAction({
  masterPlanStatus: null,
  appRuntime: {
    issues: [],
    unreadCount: 0,
    lastSeenId: null,
    pendingValidation: true,
  },
  interactionMode: "agent",
});
assert.equal(pending.id, "validate-slice");

const incomplete = computeIdeNextAction({
  masterPlanStatus: {
    mode: "warn",
    ok: true,
    allowGo: true,
    shape: "incomplete",
    gaps: [{ code: "PAGES_EMPTY", section: "4", severity: "block", message: "x", remediation: "y" }],
  },
  appRuntime: { issues: [], unreadCount: 0, lastSeenId: null, pendingValidation: false },
  interactionMode: "chat",
});
assert.equal(incomplete.id, "discovery");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nebulla-strict-"));
const created = ensureWorkspaceCreatedMarker(tmp);
assert.ok(created);
const env = {
  MASTER_PLAN_STRICT: "warn",
  MASTER_PLAN_STRICT_NEW_PROJECTS: "strict",
  MASTER_PLAN_STRICT_AFTER: "2000-01-01T00:00:00.000Z",
} as unknown as NodeJS.ProcessEnv;
assert.equal(resolveMasterPlanStrictMode(tmp, env), "strict");
const envOld = {
  ...env,
  MASTER_PLAN_STRICT_AFTER: "2099-01-01T00:00:00.000Z",
} as unknown as NodeJS.ProcessEnv;
assert.equal(resolveMasterPlanStrictMode(tmp, envOld), "warn");

console.log("\n✓ next-action + weak-gate + strict policy tests passed\n");
