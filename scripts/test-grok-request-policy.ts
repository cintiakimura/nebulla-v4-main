/**
 * Grok stroke policy — tools + reasoning_effort mapping.
 * Run: npx tsx scripts/test-grok-request-policy.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  grokChatCompletionsExtras,
  grokResponsesExtras,
  grokStrokePolicy,
  modelSupportsReasoningEffort,
  strokeHasSearchTools,
} from "../lib/grokRequestPolicy.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

section("Chat — no search, medium effort");
{
  const p = grokStrokePolicy("chat");
  assert.deepEqual(p.tools, []);
  assert.equal(p.reasoning_effort, "medium");
  assert.equal(strokeHasSearchTools("chat"), false);
  const extra = grokChatCompletionsExtras("chat");
  assert.equal(extra.reasoning_effort, "medium");
  assert.equal("tools" in extra, false);
}

section("Research — web_search + x_search, high effort");
{
  const p = grokStrokePolicy("research");
  assert.deepEqual(p.tools, [{ type: "web_search" }, { type: "x_search" }]);
  assert.equal(p.reasoning_effort, "high");
  assert.equal(strokeHasSearchTools("research"), true);
  const extra = grokResponsesExtras("research");
  assert.deepEqual(extra.reasoning, { effort: "high" });
  assert.deepEqual(extra.tools, [{ type: "web_search" }, { type: "x_search" }]);
}

section("Plan — no search, high effort");
{
  const p = grokStrokePolicy("plan");
  assert.deepEqual(p.tools, []);
  assert.equal(p.reasoning_effort, "high");
  assert.equal(strokeHasSearchTools("plan"), false);
}

section("Go — no search, no reasoning_effort on the wire");
{
  const p = grokStrokePolicy("go");
  assert.deepEqual(p.tools, []);
  assert.equal(p.reasoning_effort, null);
  assert.equal(strokeHasSearchTools("go"), false);
  assert.equal("reasoning_effort" in grokChatCompletionsExtras("go"), false);
  assert.equal("reasoning_effort" in grokChatCompletionsExtras("go", "grok-code-fast-1"), false);
  assert.equal("reasoning_effort" in grokChatCompletionsExtras("go", "grok-4"), false);
}

section("Go extras omit reasoning_effort on grok-code-fast-1");
{
  assert.equal(modelSupportsReasoningEffort("grok-code-fast-1"), false);
  assert.equal(modelSupportsReasoningEffort("grok-build-0.1"), false);
  assert.equal(modelSupportsReasoningEffort("grok-4"), true);
  assert.deepEqual(grokChatCompletionsExtras("go", "grok-code-fast-1"), {});
  assert.deepEqual(grokChatCompletionsExtras("go"), {});
  assert.equal("reasoning_effort" in grokChatCompletionsExtras("chat", "grok-code-fast-1"), false);
  assert.equal(grokChatCompletionsExtras("chat", "grok-4").reasoning_effort, "medium");
}

section("UI Gen — no search, no reasoning_effort");
{
  const p = grokStrokePolicy("ui_gen");
  assert.deepEqual(p.tools, []);
  assert.equal(p.reasoning_effort, null);
  assert.equal(strokeHasSearchTools("ui_gen"), false);
  assert.deepEqual(grokChatCompletionsExtras("ui_gen"), {});
  const resp = grokResponsesExtras("ui_gen");
  assert.deepEqual(resp.tools, []);
  assert.equal("reasoning" in resp, false);
}

section("Wiring — search tools only on research Responses call");
{
  const grokSearch = fs.readFileSync(path.join(root, "lib/grokWebSearch.ts"), "utf8");
  const goJob = fs.readFileSync(path.join(root, "lib/nebulaGoCodeJob.ts"), "utf8");
  const uiGrok = fs.readFileSync(path.join(root, "lib/nebulaUiStudioGrok.ts"), "utf8");
  const chat = fs.readFileSync(path.join(root, "lib/aiChatCompletion.ts"), "utf8");
  assert.match(grokSearch, /grokResponsesExtras\("research", model\)/);
  assert.match(grokSearch, /\/v1\/responses/);
  assert.match(goJob, /grokChatCompletionsExtras\("go", opts\.codeModel\)/);
  assert.equal(/web_search|x_search/.test(uiGrok), false);
  assert.equal(/web_search|x_search/.test(goJob), false);
  assert.match(chat, /grokChatCompletionsExtras\(stroke, model\)/);
}

section("Gate R unchanged");
{
  const artifact = fs.readFileSync(path.join(root, "lib/researchArtifact.ts"), "utf8");
  const server = fs.readFileSync(path.join(root, "server.ts"), "utf8");
  assert.match(artifact, /RESEARCH_MIN_COMPETITORS = 5/);
  assert.match(server, /RESEARCH_INCOMPLETE/);
  assert.match(server, /runResearchStroke/);
}

console.log("\n✓ grok request policy passed\n");

function section(name: string) {
  console.log(`\n▸ ${name}`);
}
