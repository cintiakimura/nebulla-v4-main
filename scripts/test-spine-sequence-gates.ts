/**
 * Spine sequence gates A–G — IF/IF-NOT contracts.
 * Run: npx tsx scripts/test-spine-sequence-gates.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  GO_JOIN_LABEL,
  GO_PREPARING_LABEL,
  GO_SLICE_WAIT_LABEL,
  classifyGoPoll,
  goPollActivityMessage,
  isUsableProjectGoal,
  uiBriefTooShort,
  uiBriefUsable,
} from "../lib/spineSequenceGates.ts";
import {
  expireStaleGoCodePending,
  readGoCodePending,
  writeGoCodePending,
} from "../lib/nebulaGoCodePending.ts";
import { goCodePendingToPollResponse } from "../lib/nebulaGoCodeJob.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const pipeline = fs.readFileSync(path.join(root, "src/lib/nebulaGrokCodingPipeline.ts"), "utf8");
const chat = fs.readFileSync(path.join(root, "src/components/ide/AIChat.tsx"), "utf8");
const server = fs.readFileSync(path.join(root, "server.ts"), "utf8");
const studio = fs.readFileSync(path.join(root, "src/lib/uiStudioBetaEngine.ts"), "utf8");
const statusMenu = fs.readFileSync(path.join(root, "src/components/ide/IdeAppStatusMenu.tsx"), "utf8");

section("Gate C copy — never all files in one pass");
assert.equal(/generating all files in one pass/.test(pipeline), false);
assert.equal(/Grok Code running on server/.test(pipeline), false);
assert.match(pipeline, /GO_SLICE_WAIT_LABEL|Grok Code: Foundation slice \(up to ~3 min, no stream\)/);
assert.match(pipeline, /GO_PREPARING_LABEL|Preparing plan before Grok Code/);
assert.match(pipeline, /GO_JOIN_LABEL|Joining in-flight Foundation job/);
assert.equal(GO_SLICE_WAIT_LABEL, "Grok Code: Foundation slice (up to ~3 min, no stream)");
assert.equal(GO_PREPARING_LABEL, "Preparing plan before Grok Code…");
assert.equal(GO_JOIN_LABEL, "Joining in-flight Foundation job…");

section("Gate C poll classify");
assert.equal(classifyGoPoll({ idle: true }), "idle");
assert.equal(classifyGoPoll({ pending: true, preparing: true, coding: false }), "preparing");
assert.equal(classifyGoPoll({ pending: true, coding: true }), "coding");
assert.match(goPollActivityMessage("preparing"), /Preparing plan before Grok Code/);
assert.match(goPollActivityMessage("coding"), /Foundation slice/);
assert.equal(/all files/i.test(goPollActivityMessage("coding")), false);

section("Gate C preparing is not coding");
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "go-prep-"));
  writeGoCodePending(tmp, {
    status: "preparing",
    startedAt: Date.now() - 20_000,
    preCodingSummary: "SLICE: Foundation",
  });
  const poll = goCodePendingToPollResponse(readGoCodePending(tmp), false, tmp);
  assert.equal(poll.preparing, true);
  assert.equal(poll.coding, false);
  assert.equal(poll.pending, true);
  assert.match(String(poll.hint || ""), /Preparing plan before Grok Code/);

  expireStaleGoCodePending(tmp, { jobActive: false });
  assert.equal(readGoCodePending(tmp)?.status, "preparing");
}

section("Gate C preparing does not expire at 90s without job");
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "go-prep-90-"));
  writeGoCodePending(tmp, {
    status: "preparing",
    startedAt: Date.now() - 91_000,
    projectDisplayName: "tutor kids",
  });
  expireStaleGoCodePending(tmp, { jobActive: false });
  assert.equal(readGoCodePending(tmp)?.status, "preparing");
}

section("Gate A/B chat — no silent continue / false coding-ok");
assert.equal(/Foundation may still start/.test(chat), false);
assert.match(chat, /mockup deferred — coding Foundation/);
assert.match(chat, /Foundation will not start while mockup is waiting/);
assert.match(server, /syncUiArtifactsFromMasterPlan/);
assert.match(server, /status: "preparing"/);
assert.equal(uiBriefTooShort(79), true);
assert.equal(uiBriefTooShort(80), false);
assert.equal(uiBriefUsable("short"), false);
assert.equal(
  uiBriefUsable("### Home `/home`\n\nPractice for kids with ADHD — enough text for tokens and slots here.\n"),
  true,
);
assert.equal(isUsableProjectGoal(""), false);
assert.equal(isUsableProjectGoal("hi"), false);
assert.equal(isUsableProjectGoal("test"), false);
assert.equal(isUsableProjectGoal("tutor kids with ADHD"), true);
assert.match(chat, /ASK_FOR_SHORT_GOAL|Write a short goal for this app/);
assert.match(server, /UI_BRIEF_MISSING/);
assert.match(server, /isMasterPlanReadyForUiMockup/);

section("Gate R — research mandatory");
assert.match(chat, /ensureResearchBeforeUiAndGo/);
assert.match(chat, /RESEARCH_STOPPED/);
assert.match(server, /RESEARCH_INCOMPLETE/);
assert.match(server, /\/api\/grok\/research/);
assert.match(server, /runResearchStroke/);
assert.equal(/Foundation may still start/.test(chat), false);

section("Gate F — one heavy job");
assert.match(studio, /isFoundationGoInFlight/);
assert.match(server, /FOUNDATION_GO_IN_FLIGHT/);
assert.match(pipeline, /markFoundationGoInFlight/);

section("Gate E — App looks OK only on real_routes");
assert.match(statusMenu, /honesty === 'real_routes'/);
assert.equal(/honestSuccess = runtimeHealthy && honesty !==/.test(statusMenu), false);

section("Gate G — files/open rejects title-as-path");
assert.match(server, /path must be a workspace-relative file, not the project title/);

console.log("\n✓ spine sequence gates passed\n");

function section(name: string) {
  console.log(`\n▸ ${name}`);
}
