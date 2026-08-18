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
  GO_CODE_PASS1_LABEL,
  GO_JOIN_LABEL,
  GO_PREPARING_LABEL,
  GO_SLICE_WAIT_LABEL,
  classifyGoPoll,
  goPollActivityMessage,
  goPollBackoffMs,
  inferGoalFromPlanRecord,
  isUsableProjectGoal,
  planRecordHasUsableGoal,
  seedGoalOfTheAppSection,
  uiBriefTooShort,
  uiBriefUsable,
} from "../lib/spineSequenceGates.ts";
import { parseMasterPlanBlock } from "../lib/masterPlanSections.ts";
import {
  expireStaleGoCodePending,
  readGoCodePending,
  writeGoCodePending,
} from "../lib/nebulaGoCodePending.ts";
import {
  goCodePendingToPollResponse,
  isGoCodeJobActive,
  scheduleGoCodeJob,
} from "../lib/nebulaGoCodeJob.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const pipeline = fs.readFileSync(path.join(root, "src/lib/nebulaGrokCodingPipeline.ts"), "utf8");
const chat = fs.readFileSync(path.join(root, "src/components/ide/AIChat.tsx"), "utf8");
const server = fs.readFileSync(path.join(root, "server.ts"), "utf8");
const studio = fs.readFileSync(path.join(root, "src/lib/uiStudioBetaEngine.ts"), "utf8");
const statusMenu = fs.readFileSync(path.join(root, "src/components/ide/IdeAppStatusMenu.tsx"), "utf8");

section("Go job named exports — server boot import");
assert.equal(typeof isGoCodeJobActive, "function");
assert.equal(typeof scheduleGoCodeJob, "function");
assert.equal(typeof goCodePendingToPollResponse, "function");
assert.equal(isGoCodeJobActive("/no-such-go-job"), false);

section("Gate C copy — never all files in one pass");
assert.equal(/generating all files in one pass/.test(pipeline), false);
assert.equal(/Grok Code running on server/.test(pipeline), false);
assert.match(pipeline, /GO_CODE_PASS1_LABEL|Code pass 1/);
assert.match(pipeline, /GO_PREPARING_LABEL|Preparing plan before Grok Code/);
assert.match(pipeline, /GO_JOIN_LABEL|Joining in-flight Foundation job/);
assert.equal(GO_SLICE_WAIT_LABEL, "Grok Code: Foundation slice (up to ~3 min, no stream)");
assert.equal(GO_PREPARING_LABEL, "Preparing plan before Grok Code…");
assert.equal(GO_JOIN_LABEL, "Joining in-flight Foundation job…");
assert.equal(GO_CODE_PASS1_LABEL, "Code pass 1");

section("Gate C poll classify");
assert.equal(classifyGoPoll({ idle: true }), "idle");
assert.equal(classifyGoPoll({ pending: true, preparing: true, coding: false }), "preparing");
assert.equal(classifyGoPoll({ pending: true, coding: true }), "coding");
assert.match(goPollActivityMessage("preparing"), /Preparing plan before Grok Code/);
assert.match(goPollActivityMessage("coding"), /Code pass 1/);
assert.equal(/all files/i.test(goPollActivityMessage("coding")), false);
assert.equal(goPollBackoffMs(0), 0);
assert.equal(goPollBackoffMs(1), 2000);
assert.equal(goPollBackoffMs(2), 5000);
assert.match(pipeline, /goPollBackoffMs\(i\)/);
assert.match(pipeline, /clearCodingLocks\(projectName\)/);
assert.match(pipeline, /export function abortGoCodeWait/);
assert.match(chat, /abortGoCodeWait\(projectName\)/);
assert.match(chat, /APPLY_IN_FLIGHT_STALL_MS/);
assert.match(pipeline, /applyAbortByProject/);
assert.match(pipeline, /if \(isGoSessionAborted\(projectName\)\) break/);

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
assert.match(chat, /continuing Foundation anyway/);
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
assert.equal(planRecordHasUsableGoal(null), false);
assert.equal(planRecordHasUsableGoal({}), false);
assert.equal(planRecordHasUsableGoal({ "1. Goal of the app": "" }), false);
assert.equal(
  planRecordHasUsableGoal({ "1. Goal of the app": "tutor kids with ADHD" }),
  true,
);
assert.equal(
  planRecordHasUsableGoal({
    "1. Goal of the app": "",
    "4. Pages and navigation": "### Kid Home `/`\nPractice for ADHD kids with short sessions.\n",
  }),
  true,
);
assert.match(
  inferGoalFromPlanRecord(
    { "1. Goal of the app": "" },
    ["tutor kids with ADHD"],
  ),
  /tutor kids with ADHD/,
);
{
  const seeded = seedGoalOfTheAppSection(
    {
      "1. Goal of the app": "",
      "4. Pages and navigation": "### Kid Home `/`\nPractice for ADHD kids with short sessions.\n",
    },
    ["tutor kids with ADHD"],
  );
  assert.match(seeded, /tutor kids with ADHD|Kid Home/i);
  assert.ok(seeded.length >= 48);
}
{
  const parsed = parseMasterPlanBlock(
    [
      "A calm tutoring web app for kids with ADHD.",
      "",
      "### 2. Tech and Research",
      "Next.js App Router + Tailwind.",
      "",
      "### 3. Features and KPIs",
      "Short lessons and progress for teachers.",
    ].join("\n"),
  );
  assert.match(String(parsed[1] || ""), /calm tutoring web app/i);
  assert.match(String(parsed[2] || ""), /Next\.js/);
}
{
  const skippedGoal = parseMasterPlanBlock(
    ["### 2. Tech and Research", "Next.js stack for an ADHD tutor.", "### 3. Features and KPIs", "Timed practice."].join(
      "\n",
    ),
  );
  assert.equal(String(skippedGoal[1] || "").trim(), "");
  assert.match(String(skippedGoal[2] || ""), /Next\.js/);
}
assert.match(chat, /ASK_FOR_SHORT_GOAL|Write a short goal for this app/);
assert.match(chat, /No usable Master Plan goal yet/);
assert.match(chat, /lastResearchError/);
assert.equal(
  /Foundation coding waiting — finish UI mockup/.test(chat),
  false,
  'empty plan / research 409 must Stop, not wait forever on Generate UI',
);
assert.match(server, /UI_BRIEF_MISSING/);
assert.match(server, /isMasterPlanReadyForUiMockup/);

section("Gate R — research mandatory");
assert.match(chat, /ensureResearchBeforeUiAndGo/);
assert.match(chat, /goal:\s*projectName/);
assert.match(chat, /RESEARCH_STOPPED/);
assert.match(chat, /syncPlanViewsAfterResearch/);
assert.match(chat, /planTurnNoChatCode/);
assert.match(server, /RESEARCH_INCOMPLETE/);
assert.match(server, /\/api\/grok\/research/);
assert.match(server, /runResearchStroke/);
assert.match(server, /isResearchJobActive\(ppGo\.workspaceRoot\)/);
assert.match(server, /code: "RESEARCH_IN_FLIGHT"/);
assert.equal(/Foundation may still start/.test(chat), false);

section("Gate F — one heavy job");
assert.match(studio, /isFoundationGoInFlight/);
assert.match(server, /FOUNDATION_GO_IN_FLIGHT/);
assert.match(pipeline, /markFoundationGoInFlight/);
assert.match(pipeline, /RESEARCH_IN_FLIGHT/);

section("Gate E — App looks OK only on real_routes");
assert.match(statusMenu, /honesty === 'real_routes'/);
assert.equal(/honestSuccess = runtimeHealthy && honesty !==/.test(statusMenu), false);

section("Gate G — files/open rejects title-as-path");
assert.match(server, /path must be a workspace-relative file, not the project title/);

section("Go blockedReason — poll + chat (not App Preview)");
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "go-block-"));
  writeGoCodePending(tmp, {
    status: "error",
    startedAt: Date.now(),
    codeError: "Model grok-code-fast-1 does not support parameter reasoningEffort.",
    blockedReason: {
      code: "GO_MODEL_REJECTED",
      message: "Stopped: coding model rejected the request (invalid parameters). Retry Go — Foundation did not start.",
    },
  });
  const poll = goCodePendingToPollResponse(readGoCodePending(tmp), false, tmp);
  assert.equal(poll.ok, false);
  assert.equal(poll.code, "GO_MODEL_REJECTED");
  assert.equal((poll.blockedReason as { code?: string } | undefined)?.code, "GO_MODEL_REJECTED");
  assert.match(String(poll.error || ""), /GO_MODEL_REJECTED/);
  assert.equal(/preview hit a problem|source:\s*'build'/.test(String(poll.error || "")), false);
}
assert.match(chat, /do not call reportAppRuntimeIssue/);
assert.equal(/reportAppRuntimeIssue\(/.test(chat), false);
assert.match(pipeline, /assessFoundationGoExit/);
assert.match(pipeline, /blockedReason: blocked/);
assert.match(server, /blockedReason: blocked/);
assert.match(server, /gateWarnings/);
assert.match(server, /bypass RESEARCH_INCOMPLETE|bypass MASTER_PLAN_INCOMPLETE/);
assert.match(server, /inferGoalFromPlanRecord/);
assert.match(server, /seedGoalOfTheAppSection/);
assert.match(server, /coding continues without waiting for Gate R/);
assert.match(server, /coding continues/);
assert.match(server, /orphan preparing/);
assert.match(server, /scheduling Foundation without waiting on research/);
assert.match(pipeline, /nudging server to schedule Grok Code/);
assert.match(server, /buildCompactGoCodeUserPrompt/);
assert.match(server, /isUsablePreCodingSummary\(existingSummary\)/);
assert.equal(/withMem\.slice\(\s*-16\s*\)/.test(server), false);

console.log("\n✓ spine sequence gates passed\n");

function section(name: string) {
  console.log(`\n▸ ${name}`);
}
