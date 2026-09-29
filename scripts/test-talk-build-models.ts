/**
 * Talk vs Build model split + packet handoff.
 * Run: npx tsx scripts/test-talk-build-models.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveUpstreamChatModel } from "../lib/aiChatCompletion.ts";
import {
  applyApprovedWrapHandoff,
  applyFullBuildPlanFill,
  freezePlan,
  markTalkWrapAccepted,
  shouldStartGoAfterTalk,
  talkLockedRoutes,
  TALK_CLOSE_QUESTION,
  userAcceptedTalkClose,
} from "../lib/fullBuildContract.ts";
import {
  buildPacketIsStructuredHandoff,
  extractWrapFromAssistant,
  formatBuildPacketMarkdown,
  formatGoBuildUserPrompt,
  persistBuildPacketFromPlan,
  readBuildPacket,
} from "../lib/buildPacket.ts";
import { classifyGoFailure, GO_BLOCKED_MESSAGES } from "../lib/goBlockedReason.ts";
import {
  MODEL_BUILD,
  MODEL_BUILD_FALLBACK,
  MODEL_TALK,
  isCodingFamilyModelId,
  resolveBuildModel,
  resolveTalkModel,
  shouldFallbackBuildModel,
} from "../lib/talkBuildModels.ts";
import {
  listPaths,
  readPath,
  writePath,
  WORKSHOP_EXAM_TIMEOUT_MS,
} from "../lib/workshopFloor.ts";
import { workshopExamDecision, WORKSHOP_EXAM_MAX_RETRIES } from "../lib/workshopExamPolicy.ts";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function section(name: string) {
  console.log(`\n✓ ${name}`);
}

section("1 Talk turn uses MODEL_TALK / current chat id, not grok-build-0.1");
{
  const talk = resolveTalkModel(MODEL_TALK);
  assert.equal(isCodingFamilyModelId(talk), false);
  assert.notEqual(talk, MODEL_BUILD);
  const upstream = resolveUpstreamChatModel("xai", MODEL_TALK);
  assert.equal(isCodingFamilyModelId(upstream), false);
  assert.notEqual(upstream, MODEL_BUILD);
  assert.notEqual(resolveUpstreamChatModel("xai", "grok-code-fast-1"), MODEL_BUILD);
  assert.equal(isCodingFamilyModelId(resolveUpstreamChatModel("xai", "grok-code-fast-1")), false);
  const chatClient = fs.readFileSync(path.join(REPO, "src/lib/ideAssistantGrokChat.ts"), "utf8");
  assert.match(chatClient, /MODEL_TALK/);
  assert.doesNotMatch(chatClient, /grok-build-0\.1/);
  const chatApi = fs.readFileSync(path.join(REPO, "server.ts"), "utf8");
  assert.match(chatApi, /runAiChatCompletion\(\{[\s\S]*?stroke:\s*"chat"/);
  assert.match(chatApi, /const codeModel = resolveBuildModel\(\)/);
}

section("2 After wrap+start, Code pass model === grok-build-0.1");
{
  assert.equal(resolveBuildModel(), MODEL_BUILD);
  const server = fs.readFileSync(path.join(REPO, "server.ts"), "utf8");
  assert.match(server, /const codeModel = resolveBuildModel\(\)/);
  assert.match(server, /You are Grok Build \(\$\{MODEL_BUILD\}\)/);
  assert.doesNotMatch(server, /GROK_CODE_MODEL \?\.trim\(\) \|\| "grok-code-fast-1"/);
  const job = fs.readFileSync(path.join(REPO, "lib/nebulaGoCodeJob.ts"), "utf8");
  assert.match(job, /fetchBuildCompletion/);
  assert.match(job, /MODEL_BUILD_FALLBACK/);
  assert.match(job, /shouldFallbackBuildModel/);
  assert.doesNotMatch(job, /resolveTalkModel|GROK_CHAT_MODEL/);
}

section("3 Build request body is packet / wrap, not continue the conversation");
{
  const wrap =
    "Closed group share. Private link only. No public listing. Must-haves: upload, list, share.";
  const md = formatBuildPacketMarkdown({
    wrapText: wrap,
    goalSection: "Private share for a closed group via link.",
    pagesSection: "### Home `/`\n### Share `/share`",
    explicitOuts: "No public listing.",
    sliceName: "Foundation",
  });
  assert.equal(buildPacketIsStructuredHandoff(md), true);
  assert.match(md, /Closed group share/);
  assert.doesNotMatch(md, /continue the conversation/i);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "build-packet-"));
  persistBuildPacketFromPlan(
    tmp,
    {
      "1. Goal of the app": "Private share for a closed group via link.",
      "4. Pages and navigation": "### Home `/`",
    },
    wrap,
    "Foundation",
  );
  const disk = readBuildPacket(tmp);
  assert.equal(buildPacketIsStructuredHandoff(disk), true);
  fs.rmSync(tmp, { recursive: true, force: true });
  const server = fs.readFileSync(path.join(REPO, "server.ts"), "utf8");
  assert.match(server, /sessionFocus: "Implement only this packet\. Not a chat turn\."/);
  assert.match(server, /formatWorkshopFileList\(listPaths/);
  assert.match(md, /Approved wrap/);
  assert.match(server, /formatGoBuildUserPrompt\(buildPacket/);
  assert.match(server, /BUILD_PACKET_MISSING/);
  const seedTitle = "Music starter seed title only";
  const listenWrap =
    "Public listen `/listen` for anyone with the link. Artist login `/login`. Out of scope: NFT. No dashboard or settings.";
  const handoff = applyApprovedWrapHandoff(
    {
      "1. Goal of the app": seedTitle,
      "4. Pages and navigation": "### Dashboard `/dashboard`\n### Practice `/practice`",
    },
    listenWrap,
  );
  const pktDir = fs.mkdtempSync(path.join(os.tmpdir(), "start-packet-"));
  persistBuildPacketFromPlan(pktDir, handoff, listenWrap, "Foundation");
  const startPkt = readBuildPacket(pktDir);
  fs.rmSync(pktDir, { recursive: true, force: true });
  assert.equal(buildPacketIsStructuredHandoff(startPkt), true);
  assert.match(startPkt, /Implement only this packet/);
  assert.match(startPkt, /Approved wrap/);
  assert.match(startPkt, /Public listen/);
  assert.doesNotMatch(startPkt, /Music starter seed title only/);
  const s4start = startPkt.split("## §4")[1]?.split("## Explicit")[0] || "";
  const locked = talkLockedRoutes(listenWrap, "");
  assert.deepEqual(
    locked.map((r) => r.route).sort(),
    ["/listen", "/login"],
  );
  assert.match(s4start, /\/listen/);
  assert.match(s4start, /\/login/);
  assert.doesNotMatch(s4start, /`\/dashboard`/i);
  assert.doesNotMatch(s4start, /`\/practice`/i);
  assert.doesNotMatch(s4start, /`\/nft`/i);
  assert.doesNotMatch(s4start, /`\/`/);
  const goUser = formatGoBuildUserPrompt(startPkt, "## Existing app/src files\n- app/page.tsx");
  assert.match(goUser, /Approved wrap/);
  assert.match(goUser, /Existing app\/src files/);
  const frozenFill = applyFullBuildPlanFill(markTalkWrapAccepted(freezePlan(handoff), listenWrap));
  assert.doesNotMatch(String(frozenFill.plan["4. Pages and navigation"] || ""), /`\/dashboard`/i);
}

section("4 let’s keep talking → no Build call");
{
  assert.equal(
    userAcceptedTalkClose("let’s keep talking", { lastAssistantText: TALK_CLOSE_QUESTION }),
    false,
  );
  assert.equal(
    shouldStartGoAfterTalk({
      plan: { "1. Goal of the app": "Courier loop for pickup and pay." },
      userText: "let’s keep talking",
      lastAssistantText: TALK_CLOSE_QUESTION,
    }),
    false,
  );
  const chat = fs.readFileSync(path.join(REPO, "src/components/ide/AIChat.tsx"), "utf8");
  assert.match(chat, /isTalkKeepTalking\(rawText\)/);
  const startAt = chat.indexOf("if (startGoThisTurn)");
  assert.ok(startAt > 0);
  assert.ok(chat.indexOf("applyApprovedWrapHandoff", startAt) > startAt);
  const willCodeFreeze = chat.slice(chat.indexOf("if (willCode && foundationGate.ok)"));
  assert.match(willCodeFreeze.slice(0, 1800), /startGoThisTurn/);
  assert.match(willCodeFreeze.slice(0, 1800), /talkWrapAccepted: true/);
}

section("5 Talk gates — No I’m not saying like NFT is not Start");
{
  const nft =
    "No, I'm not saying like NFT. NFT was just an example… do you know if there's any solution regarding";
  assert.equal(userAcceptedTalkClose(nft, { lastAssistantText: TALK_CLOSE_QUESTION }), false);
  assert.equal(
    shouldStartGoAfterTalk({
      plan: { "1. Goal of the app": "Courier loop for pickup and pay." },
      userText: nft,
      lastAssistantText: "What do you think?",
    }),
    false,
  );
}

section("Talk cannot apply file: from chat handoff");
{
  const pipeline = fs.readFileSync(path.join(REPO, "src/lib/nebulaGrokCodingPipeline.ts"), "utf8");
  const handoff = pipeline.slice(pipeline.indexOf("export async function handlePostGrokCodingTurn"));
  assert.doesNotMatch(handoff.slice(0, 2200), /Applying app file blocks from Grok coding handoff/);
  assert.match(handoff, /Chat handoff was not a product shell — launching Foundation Go/);
  assert.match(pipeline, /Writing files…/);
}

section("grok-build-0.1 400/404 → fallback grok-code-fast-1, never Talk");
{
  assert.equal(MODEL_BUILD_FALLBACK, "grok-code-fast-1");
  assert.equal(shouldFallbackBuildModel(404, MODEL_BUILD), true);
  assert.equal(shouldFallbackBuildModel(400, MODEL_BUILD), true);
  assert.equal(shouldFallbackBuildModel(404, MODEL_BUILD_FALLBACK), false);
  assert.equal(shouldFallbackBuildModel(500, MODEL_BUILD), false);
  const missed = classifyGoFailure({
    httpStatus: 404,
    error: "model grok-build-0.1 not found",
  });
  assert.equal(missed.code, "GO_MODEL_REJECTED");
  assert.equal(missed.message, GO_BLOCKED_MESSAGES.GO_MODEL_REJECTED);
  assert.match(missed.message, /Build model unavailable/);
  const bad400 = classifyGoFailure({
    httpStatus: 400,
    error: '{"code":"invalid-argument","error":"unknown model"}',
  });
  assert.equal(bad400.code, "GO_MODEL_REJECTED");
  assert.match(bad400.message, /Build model unavailable/);
}

section("exam fail → exactly one retry then stop");
{
  assert.equal(WORKSHOP_EXAM_MAX_RETRIES, 1);
  assert.equal(WORKSHOP_EXAM_TIMEOUT_MS, 60_000);
  assert.equal(workshopExamDecision(true, 0), "pass");
  assert.equal(workshopExamDecision(false, 0), "retry");
  assert.equal(workshopExamDecision(false, 1), "stop");
  const pipeline = fs.readFileSync(path.join(REPO, "src/lib/nebulaGrokCodingPipeline.ts"), "utf8");
  assert.match(pipeline, /fetchWorkshopExam/);
  assert.match(pipeline, /examStderr: exam\.stderr/);
  assert.match(pipeline, /workshopExamDecision\(exam\.ok, examFails\)/);
  assert.match(pipeline, /GO_EXAM_FAILED/);
  const kicks = pipeline.match(/kickGoCodeJob\(/g) || [];
  assert.ok(kicks.length >= 2, "main Go + one exam repair kick");
  const examBlock = pipeline.slice(pipeline.indexOf("Exam — tsc --noEmit"));
  const repairKicks = examBlock.match(/kickGoCodeJob\(/g) || [];
  assert.equal(repairKicks.length, 1);
  assert.doesNotMatch(examBlock.slice(0, 1800), /\/api\/grok\/chat/);
}

section("Go-only listPaths / writePath gates");
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "workshop-floor-"));
  fs.mkdirSync(path.join(tmp, "app"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "app", "page.tsx"), "export default function Page() { return null }\n");
  assert.deepEqual(listPaths(tmp), ["app/page.tsx"]);
  assert.match(String(readPath(tmp, "app/page.tsx")), /export default/);
  const ok = writePath(tmp, "app/ok.tsx", "export const n = 1;\n");
  assert.equal(ok.ok, true);
  const denied = writePath(tmp, ".git/config", "nope");
  assert.equal(denied.ok, false);
  fs.rmSync(tmp, { recursive: true, force: true });
  const server = fs.readFileSync(path.join(REPO, "server.ts"), "utf8");
  assert.match(server, /writePath\(workspaceRoot, b\.relativePath, b\.body\)/);
  assert.match(server, /app\.post\("\/api\/workshop\/exam"/);
}

assert.equal(extractWrapFromAssistant(`Summary.\n\n${TALK_CLOSE_QUESTION}`).includes("say start"), false);

console.log("\n✓ talk-build-models tests passed\n");
