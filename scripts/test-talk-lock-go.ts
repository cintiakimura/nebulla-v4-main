/**
 * Talk until locked. Lock freezes the plan on the same workspace. Build reads that plan.
 * Run: npm run test:talk-lock-go
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyFullBuildPlanFill,
  assessFullBuildCompleteness,
  formatFullBuildFirstSpokenLine,
  freezePlan,
  isPlanFrozen,
  PLAN_FROZEN_KEY,
  PLAN_LOCKED_AT_KEY,
  shouldOpenTalkTurn,
  shouldSkipGrokChatForExistingPlan,
  shouldStartGoAfterTalk,
  TALK_CLOSE_QUESTION,
} from "../lib/fullBuildContract.ts";
import { ensureCodingSkeletonOnPlan } from "../lib/codingSkeleton.ts";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const COURIER_SEED =
  "City Courier: clients request pickup, drivers accept the job, track, pay, and rate.";

function completeCourierPlan(): Record<string, unknown> {
  const filled = applyFullBuildPlanFill({
    "1. Goal of the app": COURIER_SEED,
  });
  const sk = ensureCodingSkeletonOnPlan(filled.plan, {
    goal: COURIER_SEED,
    projectType: "Web App",
  });
  return sk.plan;
}

function section(name: string) {
  console.log(`\n✓ ${name}`);
}

section("talk first — fresh plan + rich seed, no accept phrase");
{
  const plan = {};
  assert.equal(isPlanFrozen(plan), false);
  assert.equal(shouldOpenTalkTurn({ plan, seedText: COURIER_SEED, userText: COURIER_SEED }), true);
  assert.equal(shouldSkipGrokChatForExistingPlan({ plan, seedText: COURIER_SEED }), false);
  assert.equal(
    shouldStartGoAfterTalk({ plan, userText: COURIER_SEED, seedText: COURIER_SEED }),
    false,
  );
}

section("close + freeze — complete plan + accept keeps workspace key");
{
  const workspaceKey = "guest-city-courier-same";
  const plan = { ...completeCourierPlan(), projectKey: workspaceKey };
  assert.equal(assessFullBuildCompleteness({ plan }).allowGo, true);
  assert.equal(
    shouldStartGoAfterTalk({ plan, userText: "no, build it", seedText: COURIER_SEED }),
    true,
  );
  const frozen = freezePlan(plan);
  assert.equal(frozen[PLAN_FROZEN_KEY], true);
  assert.ok(String(frozen[PLAN_LOCKED_AT_KEY] || "").trim());
  assert.equal(frozen.projectKey, workspaceKey);
  assert.equal(String(frozen["1. Goal of the app"]), String(plan["1. Goal of the app"]));
  assert.equal(
    String(frozen["4. Pages and navigation"]),
    String(plan["4. Pages and navigation"]),
  );
}

section("Go reads frozen plan — skip chat; replacement brief talks again");
{
  const frozen = freezePlan(completeCourierPlan());
  assert.equal(shouldSkipGrokChatForExistingPlan({ plan: frozen, seedText: COURIER_SEED }), true);
  assert.equal(shouldOpenTalkTurn({ plan: frozen, seedText: COURIER_SEED, userText: "add ratings" }), false);
  assert.equal(
    shouldStartGoAfterTalk({ plan: frozen, userText: "add ratings", seedText: COURIER_SEED }),
    true,
  );
  const pizza = "build me a pizza shop instead";
  assert.equal(shouldSkipGrokChatForExistingPlan({ plan: frozen, seedText: pizza }), false);
  assert.equal(shouldOpenTalkTurn({ plan: frozen, seedText: pizza, userText: pizza }), true);
  assert.equal(shouldStartGoAfterTalk({ plan: frozen, userText: pizza, seedText: pizza }), false);
}

section("canned first line is not the unfrozen talk door");
{
  const chat = fs.readFileSync(path.join(REPO, "src/components/ide/AIChat.tsx"), "utf8");
  assert.match(chat, /shouldOpenTalkTurn/);
  assert.match(chat, /TALK_CLOSE_QUESTION/);
  assert.match(chat, /sendIdeAssistantGrokTurn/);
  assert.doesNotMatch(chat, /formatFullBuildFirstSpokenLine\(seedForPlan\)/);
  const spoken = formatFullBuildFirstSpokenLine(COURIER_SEED);
  assert.ok(spoken.length > 20);
  assert.notEqual(spoken, TALK_CLOSE_QUESTION);
}

console.log("\n✓ talk-lock-go tests passed\n");
