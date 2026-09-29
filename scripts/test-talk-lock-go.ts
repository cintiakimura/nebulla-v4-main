/**
 * Talk until locked. Lock freezes the plan on the same workspace. Build reads that plan.
 * Run: npm run test:talk-lock-go
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyApprovedWrapHandoff,
  applyFullBuildPlanFill,
  assessFullBuildCompleteness,
  fillMissingSection4PageFields,
  formatFullBuildFirstSpokenLine,
  freezePlan,
  isPlanFrozen,
  inferFullBuildRoutes,
  listMissingFullBuildRoutes,
  markTalkWrapAccepted,
  PLAN_FROZEN_KEY,
  PLAN_LOCKED_AT_KEY,
  TALK_WRAP_ACCEPTED_AT_KEY,
  TALK_WRAP_TEXT_KEY,
  shouldOpenTalkTurn,
  shouldSkipGrokChatForExistingPlan,
  shouldStartGoAfterTalk,
  lastAssistantOfferedTalkClose,
  TALK_CLOSE_QUESTION,
  userAcceptedTalkClose,
  applyTalkCloseDisplayPolicy,
  mayPersistMasterPlanFromChat,
  isTalkContinueNotLock,
  isTalkStayOpenUserTurn,
  isTalkRepairTurn,
  isPostFreezeTalkRequest,
  isTalkKeepTalking,
  lastTalkWrapFromThread,
  isTalkStartBuildingPhrase,
  isTalkStartRetryNudge,
  planAllowsGoAfterFill,
  talkLockedRoutes,
  looksLikeUnsafeTalkGoal,
  applyTalkSlotPersist,
  planAllowsGoCodeKick,
  isTalkPartnerStayOpen,
  fullBuildGoUserNote,
} from "../lib/fullBuildContract.ts";
import { persistBuildPacketFromPlan, readBuildPacket } from "../lib/buildPacket.ts";
import { ensureCodingSkeletonOnPlan } from "../lib/codingSkeleton.ts";
import { hydrateMasterPlanDerivedSections } from "../lib/nebulaIdeWorkspaceArtifacts.ts";
import { seedGoalOfTheAppSection, talkThreadGoalBrief, goalSectionFromTalkOnStart } from "../lib/spineSequenceClient.ts";

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

function frozenAfterWrap(plan?: Record<string, unknown>) {
  return markTalkWrapAccepted(freezePlan(plan || completeCourierPlan()));
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
    shouldStartGoAfterTalk({
      plan,
      userText: "Start",
      seedText: COURIER_SEED,
      lastAssistantText: TALK_CLOSE_QUESTION,
    }),
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

section("Go reads frozen plan — skip chat only after wrap+Start; replacement brief talks again");
{
  const frozen = frozenAfterWrap();
  assert.ok(String(frozen[TALK_WRAP_ACCEPTED_AT_KEY] || "").trim());
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

section("Start accept phrases after lock; coding/yes/ok are not Start");
{
  const lock = { lastAssistantText: TALK_CLOSE_QUESTION };
  assert.equal(userAcceptedTalkClose("start", lock), true);
  assert.equal(userAcceptedTalkClose("start building", lock), true);
  assert.equal(userAcceptedTalkClose("you can start building", lock), true);
  assert.equal(isTalkStartBuildingPhrase("You can start building"), true);
  assert.equal(isTalkStartBuildingPhrase("start coding"), false);
  assert.equal(userAcceptedTalkClose("go ahead and start", lock), true);
  assert.equal(userAcceptedTalkClose("Start.", lock), true);
  assert.equal(userAcceptedTalkClose("you can start coding", lock), false);
  assert.equal(userAcceptedTalkClose("Yes — you can start coding.", lock), false);
  assert.equal(userAcceptedTalkClose("start coding", lock), false);
  assert.equal(userAcceptedTalkClose("go ahead", lock), false);
  assert.equal(userAcceptedTalkClose("you can start"), true);
  assert.equal(userAcceptedTalkClose("yes"), false);
  assert.equal(userAcceptedTalkClose("ok"), false);
  assert.equal(userAcceptedTalkClose("perfect"), false);
  assert.equal(
    userAcceptedTalkClose("yes", { lastAssistantText: TALK_CLOSE_QUESTION }),
    false,
  );
  assert.equal(
    userAcceptedTalkClose("ok", { lastAssistantText: TALK_CLOSE_QUESTION }),
    false,
  );
  assert.equal(
    userAcceptedTalkClose("ok let's use blue", { lastAssistantText: TALK_CLOSE_QUESTION }),
    false,
  );
  assert.equal(
    userAcceptedTalkClose("it's good", { lastAssistantText: TALK_CLOSE_QUESTION }),
    false,
  );
  assert.equal(
    userAcceptedTalkClose("okay", { lastAssistantText: TALK_CLOSE_QUESTION }),
    false,
  );
  assert.equal(
    userAcceptedTalkClose("is good for me", { lastAssistantText: TALK_CLOSE_QUESTION }),
    false,
  );
  assert.equal(
    userAcceptedTalkClose("good for me", { lastAssistantText: TALK_CLOSE_QUESTION }),
    false,
  );
  assert.equal(lastAssistantOfferedTalkClose(`Done.\n\n${TALK_CLOSE_QUESTION}`), true);
  const frozenOnly = freezePlan(completeCourierPlan());
  assert.equal(
    shouldSkipGrokChatForExistingPlan({ plan: frozenOnly, seedText: COURIER_SEED }),
    false,
  );
  const frozen = frozenAfterWrap();
  assert.equal(
    shouldSkipGrokChatForExistingPlan({ plan: frozen, seedText: COURIER_SEED }),
    true,
  );
  assert.equal(
    shouldStartGoAfterTalk({
      plan: frozen,
      userText: "you can start",
      seedText: "you can start",
      lastAssistantText: TALK_CLOSE_QUESTION,
    }),
    true,
  );
}

section("canned first line is not the unfrozen talk door");
{
  const chat = fs.readFileSync(path.join(REPO, "src/components/ide/AIChat.tsx"), "utf8");
  assert.match(chat, /shouldOpenTalkTurn/);
  assert.match(chat, /TALK_CLOSE_QUESTION/);
  assert.match(chat, /sendIdeAssistantGrokTurn/);
  const iAccept = chat.indexOf("Plan frozen — one Go (no second interview)");
  const iGrok = chat.indexOf("await sendIdeAssistantGrokTurn");
  assert.ok(iAccept > 0 && iGrok > iAccept, "accept freeze+Go must run before Grok chat");
  assert.match(chat.slice(Math.max(0, iAccept - 2800), iAccept), /\/api\/master-plan\/freeze/);
  assert.match(chat.slice(iAccept, iGrok), /runGoCodeAndApply/);
  assert.match(chat, /Queued until this build step finishes/);
  assert.match(chat, /pendingTalkDuringGoRef/);
  const pipeline = fs.readFileSync(path.join(REPO, "src/lib/nebulaGrokCodingPipeline.ts"), "utf8");
  assert.match(pipeline, /Talk until the plan is locked/);
  assert.match(pipeline, /isPlanFrozen/);
  const prompt = fs.readFileSync(path.join(REPO, "src/lib/nebulaAssistantSystemPrompt.ts"), "utf8");
  assert.match(prompt, /TALK \/ DISCOVERY/);
  assert.match(prompt, /talkDiscovery/);
  assert.match(prompt, /CODING \/ GO/);
  const grokChat = fs.readFileSync(path.join(REPO, "src/lib/ideAssistantGrokChat.ts"), "utf8");
  assert.match(grokChat, /talkDiscovery = options.talkDiscovery/);
  assert.doesNotMatch(chat, /formatFullBuildFirstSpokenLine\(seedForPlan\)/);
  const spoken = formatFullBuildFirstSpokenLine(COURIER_SEED);
  assert.ok(spoken.length > 20);
  assert.notEqual(spoken, TALK_CLOSE_QUESTION);
}

section("frozen courier §4 is request/track/driver/account — not leftover education");
{
  const leftoverS4 = [
    "### Practice `/practice`",
    "### Parent `/parent`",
    "### Request `/request`",
    "### Track `/track`",
    "### Driver `/driver`",
    "### Account `/account`",
  ].join("\n");
  const mixed = inferFullBuildRoutes(COURIER_SEED, leftoverS4);
  const mixedPaths = mixed.map((r) => r.route);
  for (const r of ["/request", "/track", "/driver", "/account"]) {
    assert.ok(mixedPaths.includes(r), mixedPaths.join(","));
  }
  assert.equal(mixedPaths.includes("/practice"), false);
  assert.equal(mixedPaths.includes("/parent"), false);

  const frozen = freezePlan(completeCourierPlan());
  const allow = assessFullBuildCompleteness({ plan: frozen });
  assert.equal(allow.allowGo, true);
  const allowPaths = allow.routes.map((x) => x.route);
  for (const r of ["/request", "/track", "/driver", "/account"]) {
    assert.ok(allowPaths.includes(r), allowPaths.join(","));
  }
  assert.equal(allowPaths.includes("/practice"), false);
  assert.equal(allowPaths.includes("/parent"), false);
  const missing = listMissingFullBuildRoutes(allow.routes, ["app/page.tsx", "app/layout.tsx"]);
  assert.ok(missing.some((m) => m.route === "/request"));
  assert.ok(missing.some((m) => m.route === "/track"));
  assert.equal(
    shouldStartGoAfterTalk({
      plan: frozen,
      userText: "finish building",
      seedText: "finish building",
    }),
    false,
  );
  assert.equal(
    shouldStartGoAfterTalk({
      plan: frozenAfterWrap(frozen),
      userText: "finish building",
      seedText: "finish building",
    }),
    true,
  );
  assert.equal(userAcceptedTalkClose("Start", { lastAssistantText: TALK_CLOSE_QUESTION }), true);
}

section("frozen §§ stay — Go brief never becomes §1");
{
  const dump =
    "START_CODING — SLICE: Foundation. FIRST-SLICE APPLY: files. CODING_SKELETON: marketplace";
  const frozen = freezePlan({
    ...completeCourierPlan(),
    "1. Goal of the app": COURIER_SEED,
  });
  const { plan, changed } = hydrateMasterPlanDerivedSections("/tmp/unused-hydrate-frozen", {
    ...(frozen as Record<string, string>),
    planFrozen: "true",
    planLockedAt: String(frozen[PLAN_LOCKED_AT_KEY] || "2026-01-01"),
  });
  assert.equal(changed, false);
  assert.doesNotMatch(String(plan["1. Goal of the app"]), /SLICE:|CODING_SKELETON|FIRST-SLICE APPLY/);
  const seeded = seedGoalOfTheAppSection({ "1. Goal of the app": COURIER_SEED }, [dump]);
  assert.doesNotMatch(String(seeded), /SLICE:|CODING_SKELETON|FIRST-SLICE APPLY/);
}

section("first assistant reply must not contain the lock sentence");
{
  const locked = applyTalkCloseDisplayPolicy(
    `Nice idea.\n\n${TALK_CLOSE_QUESTION}`,
    {
      userText: COURIER_SEED,
      priorAssistantTexts: [],
      isFirstAssistantReply: true,
      planAllowsGo: true,
      planFrozen: false,
    },
  );
  assert.equal(lastAssistantOfferedTalkClose(locked), false);
  assert.doesNotMatch(locked, /say start/);
}

section("user question after first reply — no lock sentence, no Go");
{
  const plan = completeCourierPlan();
  const q = "Who are the competitors?";
  assert.equal(isTalkStayOpenUserTurn(q), true);
  assert.equal(userAcceptedTalkClose(q, { lastAssistantText: TALK_CLOSE_QUESTION }), false);
  assert.equal(shouldStartGoAfterTalk({ plan, userText: q, seedText: COURIER_SEED }), false);
  const shown = applyTalkCloseDisplayPolicy(`Here is a take.\n\n${TALK_CLOSE_QUESTION}`, {
    userText: q,
    priorAssistantTexts: ["Got it — city courier."],
    isFirstAssistantReply: false,
    planAllowsGo: true,
    planFrozen: false,
  });
  assert.equal(lastAssistantOfferedTalkClose(shown), false);
}

section("you're rushing / suggest features — no lock sentence");
{
  const rush = "you're rushing, stop rushing";
  const features = "suggest features we should ship";
  assert.equal(isTalkRepairTurn(rush), true);
  assert.equal(isTalkStayOpenUserTurn(features), true);
  for (const userText of [rush, features]) {
    const shown = applyTalkCloseDisplayPolicy(`Ok sorry.\n\n${TALK_CLOSE_QUESTION}`, {
      userText,
      priorAssistantTexts: ["Got it."],
      isFirstAssistantReply: false,
      planAllowsGo: true,
      planFrozen: false,
    });
    assert.equal(lastAssistantOfferedTalkClose(shown), false);
    assert.equal(
      shouldStartGoAfterTalk({
        plan: completeCourierPlan(),
        userText,
        seedText: COURIER_SEED,
        lastAssistantText: TALK_CLOSE_QUESTION,
      }),
      false,
    );
  }
}

section("alternate wrap + Start. / You can start. — Go; keep talking stays Talk");
{
  const plan = completeCourierPlan();
  const altWrap = "Here's what I heard — tell me if this is right.";
  assert.equal(lastAssistantOfferedTalkClose(altWrap), true);
  assert.equal(lastAssistantOfferedTalkClose("Got it — I’m with you on this. What do you think?"), false);
  assert.equal(
    shouldStartGoAfterTalk({
      plan,
      userText: "Start.",
      seedText: COURIER_SEED,
      lastAssistantText: altWrap,
    }),
    true,
  );
  assert.equal(
    shouldStartGoAfterTalk({
      plan,
      userText: "You can start.",
      seedText: COURIER_SEED,
      lastAssistantText: altWrap,
    }),
    true,
  );
  assert.equal(
    shouldStartGoAfterTalk({
      plan,
      userText: "let’s keep talking",
      seedText: COURIER_SEED,
      lastAssistantText: altWrap,
    }),
    false,
  );
  const afterWrap = applyTalkCloseDisplayPolicy("Got it — I’m with you on this. What do you think?", {
    userText: "Start.",
    priorAssistantTexts: [altWrap],
    isFirstAssistantReply: false,
    planAllowsGo: true,
    planFrozen: false,
  });
  assert.doesNotMatch(afterWrap, /I['’]m with you on this/);
  assert.equal(
    shouldStartGoAfterTalk({
      plan,
      userText: "start",
      seedText: COURIER_SEED,
      lastAssistantText: TALK_CLOSE_QUESTION,
    }),
    true,
  );
}

section("after wrap + Start / you can start / go ahead and start — freeze + Go allowed");
{
  const plan = completeCourierPlan();
  const wrapShown = applyTalkCloseDisplayPolicy("Short summary of the courier loop.", {
    userText: "wrap this up",
    priorAssistantTexts: ["What do you think?"],
    isFirstAssistantReply: false,
    planAllowsGo: true,
    planFrozen: false,
  });
  assert.equal(lastAssistantOfferedTalkClose(wrapShown), true);
  assert.match(wrapShown, /Would you like me to start building, or would you like to keep talking\?/);
  for (const userText of [
    "Start",
    "start building",
    "you can start",
    "go ahead and start",
    "yes, start building",
  ]) {
    assert.equal(userAcceptedTalkClose(userText, { lastAssistantText: TALK_CLOSE_QUESTION }), true);
    assert.equal(
      shouldStartGoAfterTalk({
        plan,
        userText,
        seedText: COURIER_SEED,
        lastAssistantText: TALK_CLOSE_QUESTION,
      }),
      true,
    );
  }
  assert.equal(
    userAcceptedTalkClose("nothing to add", { lastAssistantText: TALK_CLOSE_QUESTION }),
    false,
  );
}

section("after freeze, improve the UI/UX must not skip-chat Full Build");
{
  const frozen = frozenAfterWrap();
  const improve = "improve the UI/UX";
  assert.equal(isPostFreezeTalkRequest(improve), true);
  assert.equal(
    shouldSkipGrokChatForExistingPlan({
      plan: frozen,
      seedText: COURIER_SEED,
      userText: improve,
    }),
    false,
  );
  assert.equal(shouldOpenTalkTurn({ plan: frozen, seedText: COURIER_SEED, userText: improve }), true);
  assert.equal(
    shouldStartGoAfterTalk({ plan: frozen, userText: improve, seedText: COURIER_SEED }),
    false,
  );
  const chat = fs.readFileSync(path.join(REPO, "src/components/ide/AIChat.tsx"), "utf8");
  assert.match(chat, /applyTalkCloseDisplayPolicy/);
  assert.match(chat, /userText: rawText/);
  assert.match(chat, /talkDiscovery: openTalk/);
  assert.doesNotMatch(
    chat,
    /allowGo &&\s*\n\s*!isPlanFrozen\(planOnDisk\) &&\s*\n\s*!displayText.includes\(TALK_CLOSE_QUESTION\)/,
  );
}

section("wrap body + What do you think? → two-option close only");
{
  const wrapBody = [
    "SoundSeed is locked as the name.",
    "Artists upload songs and albums. Listeners open a public link with no account.",
    "Optional signup later. Mark ownership without NFT wallets.",
    "Anything else you want to add or tweak before we wrap this up? What do you think?",
  ].join("\n");
  const shown = applyTalkCloseDisplayPolicy(wrapBody, {
    userText: "sounds right",
    priorAssistantTexts: ["A private album toggle could wait."],
    isFirstAssistantReply: false,
    planAllowsGo: false,
    planFrozen: false,
  });
  assert.equal(shown.trim().endsWith(TALK_CLOSE_QUESTION), true);
  assert.doesNotMatch(shown, /What do you think\?/);
  assert.doesNotMatch(shown, /Anything else you want to add/);
  const mid = applyTalkCloseDisplayPolicy("A private album toggle could wait.\n\nWhat do you think?", {
    userText: "what about private albums",
    priorAssistantTexts: ["Got it — SoundSeed."],
    isFirstAssistantReply: false,
    planAllowsGo: true,
    planFrozen: false,
  });
  assert.match(mid, /What do you think\?/);
  assert.equal(mid.includes(TALK_CLOSE_QUESTION), false);
}
{
  const plan = completeCourierPlan();
  const twoOpt = TALK_CLOSE_QUESTION;
  assert.equal(twoOpt, "Would you like me to start building, or would you like to keep talking?");
  assert.equal(
    shouldStartGoAfterTalk({
      plan,
      userText: "start building",
      seedText: COURIER_SEED,
      lastAssistantText: twoOpt,
    }),
    true,
  );
  assert.equal(
    shouldStartGoAfterTalk({
      plan,
      userText: "keep talking",
      seedText: COURIER_SEED,
      lastAssistantText: twoOpt,
    }),
    false,
  );
  assert.equal(isTalkKeepTalking("let’s keep talking"), true);
  assert.equal(isTalkKeepTalking("talk"), true);
  assert.equal(
    shouldStartGoAfterTalk({
      plan,
      userText: "Start.",
      seedText: COURIER_SEED,
      lastAssistantText: "What do you think?",
    }),
    true,
  );
  const afterStart = applyTalkCloseDisplayPolicy("Got it — I’m with you on this. What do you think?", {
    userText: "start building",
    priorAssistantTexts: [twoOpt],
    isFirstAssistantReply: false,
    planAllowsGo: true,
    planFrozen: false,
  });
  assert.doesNotMatch(afterStart, /I['’]m with you on this/);
  assert.doesNotMatch(afterStart, /What do you think\?/);
  const forgotClose = applyTalkCloseDisplayPolicy("I think we've got what we need. Here's the courier loop.", {
    userText: "wrap this up",
    priorAssistantTexts: ["What do you think?"],
    isFirstAssistantReply: false,
    planAllowsGo: true,
    planFrozen: false,
  });
  assert.match(forgotClose, /Would you like me to start building, or would you like to keep talking\?/);
  assert.equal(forgotClose.trim().endsWith(twoOpt), true);
}

section("1 lock not shown + shaping no → shouldStartGo false");
{
  const nft =
    "No, I'm not saying like NFT. NFT was just an example… do you know if there's any solution regarding";
  const plan = completeCourierPlan();
  assert.equal(isTalkContinueNotLock(nft), true);
  assert.equal(userAcceptedTalkClose(nft, { lastAssistantText: "What do you think?" }), false);
  assert.equal(
    shouldStartGoAfterTalk({
      plan,
      userText: nft,
      seedText: COURIER_SEED,
      lastAssistantText: "What do you think?",
    }),
    false,
  );
  assert.equal(mayPersistMasterPlanFromChat({ userText: nft, lastAssistantText: "What do you think?" }), false);
}

section("2 lock shown + start → shouldStartGo true");
{
  assert.equal(
    shouldStartGoAfterTalk({
      plan: completeCourierPlan(),
      userText: "start",
      seedText: COURIER_SEED,
      lastAssistantText: TALK_CLOSE_QUESTION,
    }),
    true,
  );
}

section("3 lock shown + let’s keep talking → shouldStartGo false");
{
  const keep = "let’s keep talking";
  assert.equal(userAcceptedTalkClose(keep, { lastAssistantText: TALK_CLOSE_QUESTION }), false);
  assert.equal(
    shouldStartGoAfterTalk({
      plan: completeCourierPlan(),
      userText: keep,
      seedText: COURIER_SEED,
      lastAssistantText: TALK_CLOSE_QUESTION,
    }),
    false,
  );
}

section("4 frozen seed-only plan without wrapAccepted → skip-chat Full Build false");
{
  const filled = applyFullBuildPlanFill({ "1. Goal of the app": COURIER_SEED });
  const sk = ensureCodingSkeletonOnPlan(filled.plan, { goal: COURIER_SEED, projectType: "Web App" });
  const frozen = freezePlan(sk.plan);
  assert.equal(Boolean(String(frozen[TALK_WRAP_ACCEPTED_AT_KEY] || "").trim()), false);
  assert.equal(shouldSkipGrokChatForExistingPlan({ plan: frozen, seedText: COURIER_SEED }), false);
}

section("5 after wrapAccepted + start → §1 is not the raw first seed");
{
  const seed = "build an app help music artists can upload their own songs and albums";
  const nft =
    "No, I'm not saying like NFT. NFT was just an example… do you know if there's any solution regarding";
  const brief = talkThreadGoalBrief(
    [
      { role: "user", content: seed },
      {
        role: "assistant",
        content: "Mom and independent artists upload songs. Public listeners use a link or QR with no account. Optional signup later. Mark ownership without NFT wallets. What do you think?",
      },
      { role: "user", content: nft },
    ],
    "start",
  );
  const goal = goalSectionFromTalkOnStart({ plan: { "1. Goal of the app": seed }, threadBrief: brief });
  assert.notEqual(goal.replace(/\s+/g, " ").trim(), seed.replace(/\s+/g, " ").trim());
  assert.match(goal, /QR|link|mom|independent|watermark|ownership|no account|listener/i);
  assert.equal(
    shouldStartGoAfterTalk({
      plan: completeCourierPlan(),
      userText: "start",
      seedText: seed,
      lastAssistantText: TALK_CLOSE_QUESTION,
    }),
    true,
  );
}

section("wrap+start packet/§4 are Talk names only — not seed dashboard/practice/NFT");
{
  const seed = "Music starter seed title only";
  const wrap =
    "Public listen `/listen` for anyone with the link. Artist login `/login`. Out of scope: NFT. No dashboard or settings.";
  const seeded = {
    "1. Goal of the app": seed,
    "4. Pages and navigation":
      "### Dashboard `/dashboard`\n### Settings `/settings`\n### Practice `/practice`",
  };
  const handoff = applyApprovedWrapHandoff(seeded, wrap);
  assert.equal(String(handoff[TALK_WRAP_TEXT_KEY] || "").includes("Public listen"), true);
  assert.match(String(handoff["1. Goal of the app"]), /Public listen/);
  assert.doesNotMatch(String(handoff["1. Goal of the app"]), /^Music starter seed title only$/);
  const s4 = String(handoff["4. Pages and navigation"] || "");
  assert.match(s4, /\/listen/);
  assert.match(s4, /\/login/);
  assert.doesNotMatch(s4, /`\/dashboard`/i);
  assert.doesNotMatch(s4, /`\/settings`/i);
  assert.doesNotMatch(s4, /`\/practice`/i);
  assert.doesNotMatch(s4, /`\/nft`/i);
  assert.deepEqual(
    talkLockedRoutes(wrap, "").map((r) => r.route).sort(),
    ["/listen", "/login"],
  );
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wrap-packet-"));
  persistBuildPacketFromPlan(tmp, handoff, wrap, "Foundation");
  const packet = readBuildPacket(tmp);
  fs.rmSync(tmp, { recursive: true, force: true });
  const s4pkt = packet.split("## §4")[1]?.split("## Explicit")[0] || "";
  assert.match(packet, /Public listen/);
  assert.doesNotMatch(packet, /Music starter seed title only/);
  assert.match(s4pkt, /\/listen/);
  assert.match(s4pkt, /\/login/);
  assert.doesNotMatch(s4pkt, /`\/dashboard`/i);
  assert.doesNotMatch(s4pkt, /`\/practice`/i);
  assert.doesNotMatch(s4pkt, /`\/nft`/i);

  const frozen = markTalkWrapAccepted(freezePlan(handoff), wrap);
  const afterFill = applyFullBuildPlanFill(frozen);
  const s4b = String(afterFill.plan["4. Pages and navigation"] || "");
  assert.match(s4b, /\/listen/);
  assert.doesNotMatch(s4b, /`\/dashboard`/i);
  assert.doesNotMatch(s4b, /`\/practice`/i);
  const lockedFill = fillMissingSection4PageFields({
    section4: s4b,
    goal: String(afterFill.plan["1. Goal of the app"] || ""),
    lockToNamedOnly: true,
    wrapText: wrap,
  });
  assert.doesNotMatch(lockedFill.section, /\/practice/i);
  assert.doesNotMatch(lockedFill.section, /\/teacher/i);
  const fb = assessFullBuildCompleteness({ plan: afterFill.plan });
  assert.equal(fb.gaps.some((g) => g.code === "PAGES_ROLES"), false, fb.gaps.map((g) => g.code).join(","));
  assert.equal(fb.routes.some((r) => r.route === "/practice"), false);
  assert.equal(fb.routes.some((r) => r.route === "/teacher"), false);

  assert.equal(isTalkKeepTalking("let’s keep talking"), true);
  assert.equal(
    shouldStartGoAfterTalk({
      plan: handoff,
      userText: "let’s keep talking",
      lastAssistantText: TALK_CLOSE_QUESTION,
    }),
    false,
  );
  const server = fs.readFileSync(path.join(REPO, "server.ts"), "utf8");
  assert.match(server, /BUILD_PACKET_MISSING/);
  assert.match(server, /formatGoBuildUserPrompt\(buildPacket/);
  const freezeAt = server.indexOf('app.post("/api/master-plan/freeze"');
  const freezeBody = server.slice(freezeAt, freezeAt + 1800);
  assert.ok(
    freezeBody.indexOf("persistBuildPacketFromPlan") < freezeBody.indexOf("freezePlan(filled.plan)"),
    "packet persist must run after wrap rewrite and before freezePlan",
  );
  const chat = fs.readFileSync(path.join(REPO, "src/components/ide/AIChat.tsx"), "utf8");
  assert.match(chat, /applyApprovedWrapHandoff/);
  const startAt = chat.indexOf("if (startGoThisTurn)");
  const startBlock = chat.slice(startAt, startAt + 6500);
  assert.match(startBlock, /packetHandoff/);
  assert.match(startBlock, /runGoCodeAndApply/);
  assert.match(startBlock, /applyApprovedWrapHandoff\(/);
  const goAt = startBlock.indexOf("runGoCodeAndApply");
  const afterGo = startBlock.slice(goAt);
  assert.ok(goAt >= 0);
  assert.match(afterGo, /\breturn;/);
}

section("empty plan + wrap + You can start building → §1 + packet; Start skips Talk");
{
  const wrap =
    "SoundSeed is for independent artists who upload songs and albums. Listeners open a public link with no account. Optional signup later. Mark ownership without NFT wallets.";
  assert.equal(planAllowsGoAfterFill({}), false);
  assert.equal(planAllowsGoAfterFill(null), false);
  assert.equal(
    shouldStartGoAfterTalk({
      plan: null,
      userText: "You can start building",
      lastAssistantText: wrap,
    }),
    true,
  );
  const handed = applyApprovedWrapHandoff({}, wrap);
  assert.match(String(handed["1. Goal of the app"] || ""), /SoundSeed|independent artists/i);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "talk-start-empty-"));
  persistBuildPacketFromPlan(tmp, handed, wrap, "Foundation");
  const pkt = readBuildPacket(tmp);
  assert.match(pkt, /Approved wrap/);
  assert.match(pkt, /SoundSeed|independent artists/i);
  fs.rmSync(tmp, { recursive: true, force: true });
  assert.equal(
    lastTalkWrapFromThread([wrap, "Understood — locking the plan… starting the build now."]),
    wrap,
  );
  const quiet = applyTalkCloseDisplayPolicy("I’ve updated the project quietly. Got it.", {
    userText: "You can start building",
    priorAssistantTexts: [wrap],
    isFirstAssistantReply: false,
    planAllowsGo: true,
    planFrozen: false,
  });
  assert.doesNotMatch(quiet, /updated the project quietly/i);
  assert.doesNotMatch(quiet, /^Got it\.?$/i);
  const canned = applyTalkCloseDisplayPolicy("Got it.", {
    userText: "start building",
    priorAssistantTexts: [TALK_CLOSE_QUESTION],
    isFirstAssistantReply: false,
    planAllowsGo: true,
    planFrozen: false,
  });
  assert.doesNotMatch(canned, /^Got it\.?$/i);
  assert.equal(
    shouldStartGoAfterTalk({
      plan: null,
      userText: "start coding",
      lastAssistantText: wrap,
    }),
    false,
  );
  assert.equal(shouldOpenTalkTurn({ plan: null, userText: "start coding", lastAssistantText: wrap }), true);
  assert.equal(
    shouldStartGoAfterTalk({
      plan: null,
      userText: "go",
      lastAssistantText: "Understood — locking the plan… starting the build now.",
      priorAssistantTexts: [wrap],
    }),
    true,
  );
  assert.equal(
    shouldStartGoAfterTalk({
      plan: null,
      userText: "go",
      lastAssistantText: "What do you think?",
    }),
    false,
  );
  assert.equal(isTalkStartRetryNudge("go"), true);
  const chat = fs.readFileSync(path.join(REPO, "src/components/ide/AIChat.tsx"), "utf8");
  const startAt = chat.indexOf("if (startGoThisTurn)");
  const startBlock = chat.slice(startAt, chat.indexOf("await sendIdeAssistantGrokTurn"));
  assert.match(startBlock, /runGoCodeAndApply/);
  assert.doesNotMatch(startBlock, /sendIdeAssistantGrokTurn/);
}

section("Talk persist vs Build kick — wrap+Start empty tabs; name dump; I agree");
{
  const wrap =
    "Quiet Cues is a calm check-in. Aqua Bell is the tone. People get a gentle daily cue. No Practice or Teacher leftover screens.";
  assert.equal(looksLikeUnsafeTalkGoal(wrap), false);
  let plan = applyApprovedWrapHandoff({}, wrap);
  assert.match(String(plan["1. Goal of the app"] || ""), /Quiet Cues/);
  plan = applyFullBuildPlanFill(plan).plan;
  plan = markTalkWrapAccepted(freezePlan(plan), wrap);
  assert.equal(isPlanFrozen(plan), true);
  assert.equal(assessFullBuildCompleteness({ plan }).allowGo, true);
  const compactGo = fullBuildGoUserNote(plan, []);
  assert.equal(planAllowsGoCodeKick(plan, compactGo), true);
  assert.equal(shouldStartGoAfterTalk({ plan, userText: compactGo, seedText: compactGo }), false);
  const names =
    "Here are some names: Lumen Learn, Quill Path, Quiet Cues. What do you think?";
  assert.equal(looksLikeUnsafeTalkGoal(names), true);
  const dumped = applyApprovedWrapHandoff({}, names);
  assert.equal(String(dumped["1. Goal of the app"] || "").includes("Lumen Learn"), false);
  const slot = applyTalkSlotPersist({}, { userText: "yes", assistantText: names });
  assert.equal(String(slot["1. Goal of the app"] || "").includes("Lumen Learn"), false);
  assert.equal(isTalkPartnerStayOpen("I agree"), true);
  assert.equal(shouldStartGoAfterTalk({ plan, userText: "I agree", lastAssistantText: wrap }), false);
  assert.equal(shouldOpenTalkTurn({ plan: completeCourierPlan(), userText: "I agree" }), true);
  assert.equal(
    shouldSkipGrokChatForExistingPlan({
      plan,
      seedText: wrap,
      userText: "I agree",
    }),
    false,
  );
  const server = fs.readFileSync(path.join(REPO, "server.ts"), "utf8");
  assert.match(server, /planAllowsGoCodeKick\(planRaw, note\)/);
  assert.match(server, /!fullBuildGate\.allowGo && !isTalkWrapAccepted\(planForGate\)/);
  const chat = fs.readFileSync(path.join(REPO, "src/components/ide/AIChat.tsx"), "utf8");
  assert.match(chat, /isTalkPartnerStayOpen\(rawText\)/);
  assert.match(chat, /isTalkSlotLockTurn\(rawText\)/);
}

console.log("\n✓ talk-lock-go tests passed\n");
