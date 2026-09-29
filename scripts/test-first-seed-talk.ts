/**
 * First seed is Talk only until Start. STT follows chat language, not OS locale.
 * Run: npx tsx scripts/test-first-seed-talk.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyTalkCloseDisplayPolicy,
  applyFullBuildPlanFill,
  freezePlan,
  mayPersistMasterPlanFromChat,
  shouldStartGoAfterTalk,
  TALK_CLOSE_QUESTION,
  userAcceptedTalkClose,
} from "../lib/fullBuildContract.ts";
import { formatFirstSeedTalkDisplay, persistMasterPlanFromAssistantSource } from "../src/lib/grokChatArtifacts.ts";
import {
  buildFullBuildBootstrap,
  buildIdeaDiscoveryBootstrap,
  FIRST_SEED_TALK_ONLY_RULE,
} from "../src/lib/ideChatBootstrap.ts";
import { resolveSttRequestLanguage } from "../lib/grokVoiceStt.ts";
import { ensureCodingSkeletonOnPlan } from "../lib/codingSkeleton.ts";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SEED =
  "build an app help music artists can upload their own songs and albums so they can have a portfolio that can be private or public to listen no login required from listener if song is public";

const DUMP = `Artists uploading songs for a public or private listen — nice, that loop is clear.

What do you think?

<START_MASTERPLAN>
1. Goal of the app
Music portfolio for artists.
2. Tech and Research
x
3. Features and KPIs
x
4. Pages and navigation
Home /
5. UI/UX design
x
</END_MASTERPLAN>`;

section("first seed START_MASTERPLAN does not persist; Talk display stays");
{
  assert.equal(mayPersistMasterPlanFromChat({ userText: SEED }), false);
  const saved = await persistMasterPlanFromAssistantSource(DUMP, undefined, [SEED], {
    userText: SEED,
  });
  assert.equal(saved, 0);
  const shown = applyTalkCloseDisplayPolicy(formatFirstSeedTalkDisplay(DUMP), {
    userText: SEED,
    priorAssistantTexts: [],
    isFirstAssistantReply: true,
    planAllowsGo: true,
    planFrozen: false,
  });
  assert.ok(shown.trim().length > 20, shown);
  assert.doesNotMatch(shown, /START_MASTERPLAN/);
  assert.equal(shown.includes(TALK_CLOSE_QUESTION), false);
}

section("first visible assistant text must not include the lock sentence");
{
  const shown = applyTalkCloseDisplayPolicy(`${formatFirstSeedTalkDisplay(DUMP)}\n\n${TALK_CLOSE_QUESTION}`, {
    userText: SEED,
    priorAssistantTexts: [],
    isFirstAssistantReply: true,
    planAllowsGo: true,
    planFrozen: false,
  });
  assert.equal(shown.includes(TALK_CLOSE_QUESTION), false);
}

section("user Start after wrap → persist + Go allowed");
{
  const filled = applyFullBuildPlanFill({ "1. Goal of the app": SEED });
  const sk = ensureCodingSkeletonOnPlan(filled.plan, { goal: SEED, projectType: "Web App" });
  assert.equal(
    userAcceptedTalkClose("Start", { lastAssistantText: TALK_CLOSE_QUESTION }),
    true,
  );
  assert.equal(mayPersistMasterPlanFromChat({ userText: "Start", lastAssistantText: TALK_CLOSE_QUESTION }), true);
  assert.equal(
    shouldStartGoAfterTalk({
      plan: sk.plan,
      userText: "Start",
      seedText: SEED,
      lastAssistantText: TALK_CLOSE_QUESTION,
    }),
    true,
  );
  const frozen = freezePlan(sk.plan);
  assert.equal(
    shouldStartGoAfterTalk({
      plan: frozen,
      userText: "improve the UI/UX",
      seedText: SEED,
    }),
    false,
  );
}

section("STT locale helper: content locale en + OS zh → request language en");
{
  assert.equal(
    resolveSttRequestLanguage({
      contentLocale: "en",
      lastTypedText: "",
      osLocale: "zh-CN",
    }),
    "en",
  );
}

section("bootstrap turn 1 is Talk only");
{
  assert.match(FIRST_SEED_TALK_ONLY_RULE, /TURN 1 \(no close yet\): Talk only/);
  const full = buildFullBuildBootstrap(SEED, "Mobile App");
  assert.match(full, /TURN 1 \(no close yet\): Talk only/);
  assert.equal(/Infer a COMPLETE Master Plan/.test(full), false);
  const idea = buildIdeaDiscoveryBootstrap(SEED, "Web App");
  assert.match(idea, /TURN 1 \(no close yet\): Talk only/);
  const chat = fs.readFileSync(path.join(REPO, "src/components/ide/AIChat.tsx"), "utf8");
  assert.match(chat, /Talk first — plan not saved yet/);
  assert.match(chat, /formatFirstSeedTalkDisplay/);
  assert.match(chat, /allowCanned/);
  const cannedOff = formatFirstSeedTalkDisplay("<START_MASTERPLAN>x</START_MASTERPLAN>", { allowCanned: false });
  assert.doesNotMatch(cannedOff, /I['’]m with you on this/);
  const wrapShown = applyTalkCloseDisplayPolicy("Short wrap of the music loop.", {
    userText: "wrap this up",
    priorAssistantTexts: ["What do you think?"],
    isFirstAssistantReply: false,
    planAllowsGo: true,
    planFrozen: false,
  });
  assert.equal(wrapShown.trim().endsWith(TALK_CLOSE_QUESTION), true);
  const afterStart = applyTalkCloseDisplayPolicy("Got it — I’m with you on this. What do you think?", {
    userText: "Start.",
    priorAssistantTexts: [TALK_CLOSE_QUESTION],
    isFirstAssistantReply: false,
    planAllowsGo: true,
    planFrozen: false,
  });
  assert.doesNotMatch(afterStart, /I['’]m with you on this/);
}

function section(name: string) {
  console.log(`\n✓ ${name}`);
}

console.log("\n✓ first-seed-talk tests passed\n");
