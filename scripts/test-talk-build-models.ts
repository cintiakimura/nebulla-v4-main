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
  buildPacketIsStructuredHandoff,
  extractWrapFromAssistant,
  formatBuildPacketMarkdown,
  persistBuildPacketFromPlan,
  readBuildPacket,
} from "../lib/buildPacket.ts";
import {
  shouldStartGoAfterTalk,
  TALK_CLOSE_QUESTION,
  userAcceptedTalkClose,
} from "../lib/fullBuildContract.ts";
import { classifyGoFailure } from "../lib/goBlockedReason.ts";
import {
  MODEL_BUILD,
  MODEL_TALK,
  isCodingFamilyModelId,
  resolveBuildModel,
  resolveTalkModel,
} from "../lib/talkBuildModels.ts";

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
  assert.match(job, /model: opts\.codeModel/);
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
  assert.match(server, /buildPacket\.trim\(\)/);
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

section("grok-build-0.1 unavailable → GO_MODEL_REJECTED, no Talk fallback");
{
  const missed = classifyGoFailure({
    httpStatus: 404,
    error: "model grok-build-0.1 not found",
  });
  assert.equal(missed.code, "GO_MODEL_REJECTED");
  assert.match(missed.message, /grok-build-0\.1/);
  assert.match(missed.message, /Not falling back to Talk Grok/);
  const job = fs.readFileSync(path.join(REPO, "lib/nebulaGoCodeJob.ts"), "utf8");
  assert.doesNotMatch(job, /resolveTalkModel|GROK_CHAT_MODEL/);
}

assert.equal(extractWrapFromAssistant(`Summary.\n\n${TALK_CLOSE_QUESTION}`).includes("say start"), false);

console.log("\n✓ talk-build-models tests passed\n");
