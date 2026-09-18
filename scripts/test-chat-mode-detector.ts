/**
 * Chat mode detector — inference-first default + Guided opt-in.
 * Run: npm run test:chat-mode
 */
import assert from "node:assert/strict";
import { detectChatMode, describeChatMode, userNoteRequestsCompetitorResearch, userNoteRequestsUiGeneration } from "../src/lib/chatModeDetector.ts";
import {
  detectGuidedInterviewIntent,
  detectInferenceFirstIntent,
} from "../src/lib/ideStartMode.ts";

function section(name: string) {
  console.log(`\n✓ ${name}`);
}

section("incomplete plan: seed / build → conversation loop (not a plan job)");
{
  for (const msg of [
    "just build something",
    "implement the dashboard",
    "open UI Studio and generate ui",
    "refine the master plan architecture",
    "Education app for kids to practice reading; teachers track progress",
    "Build a mobile education app for kids to practice reading",
  ]) {
    const r = detectChatMode(msg, { masterPlanComplete: false });
    assert.equal(r.mode, "free", msg);
    assert.equal(r.discoveryRequired, true, msg);
    assert.equal(r.inferenceFirst, false, msg);
  }
}

section("incomplete plan: continue the app → coding path");
{
  const r = detectChatMode("continue building the app", { masterPlanComplete: false });
  assert.equal(r.mode, "coding");
  assert.equal(r.discoveryRequired, false);
  assert.equal(r.inferenceFirst, true);
}

section("incomplete plan: explicit interview → Guided");
{
  const r = detectChatMode("interview me with full architecture interview questions", {
    masterPlanComplete: false,
  });
  assert.equal(r.mode, "guided");
  assert.equal(r.discoveryRequired, true);
  assert.equal(r.inferenceFirst, false);
  assert.equal(detectGuidedInterviewIntent("please brainstorm options with me"), true);
}

section("incomplete plan: debug may run without Guided lock");
{
  const r = detectChatMode("fix the login TypeError crash", { masterPlanComplete: false });
  assert.equal(r.mode, "debugging");
  assert.equal(r.discoveryRequired, false);
}

section("complete plan: coding and UI allowed");
{
  const coding = detectChatMode("implement the dashboard", { masterPlanComplete: true });
  assert.equal(coding.mode, "coding");
  assert.equal(coding.discoveryRequired, false);

  const ui = detectChatMode("generate ui from ui-brief", { masterPlanComplete: true });
  assert.equal(ui.mode, "ui");
  assert.equal(userNoteRequestsUiGeneration("generate ui"), true);
  assert.equal(userNoteRequestsUiGeneration("please generate UI"), true);
  assert.equal(userNoteRequestsUiGeneration("continue"), false);
assert.equal(userNoteRequestsCompetitorResearch("research competitors"), true);
assert.equal(userNoteRequestsCompetitorResearch("compare similar products"), true);
assert.equal(userNoteRequestsCompetitorResearch("A bakery app for pickup orders"), false);
  assert.equal(userNoteRequestsUiGeneration("continue building"), false);
}

section("inference intent helpers");
{
  assert.equal(
    detectInferenceFirstIntent(
      "Education app for kids to practice reading; teachers track progress",
    ),
    true,
  );
  assert.equal(detectInferenceFirstIntent("fix this bug"), false);
  assert.equal(detectGuidedInterviewIntent("brainstorm with me"), true);
}

section("describeChatMode");
{
  const msg = describeChatMode("guided", true);
  assert.match(msg, /Guided|Discovery|interview/i);
}

console.log("\nAll chat-mode detector tests passed.\n");
