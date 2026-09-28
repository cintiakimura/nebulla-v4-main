/**
 * Chat mode detector — inference-first default + Guided opt-in.
 * Run: npm run test:chat-mode
 */
import assert from "node:assert/strict";
import {
  detectChatMode,
  describeChatMode,
  looksLikeBuildVsShapeCannedCloser,
  userNoteRequestsCompetitorResearch,
  userNoteRequestsShapeTurn,
  userNoteRequestsUiGeneration,
  userNoteSignalsFunctionalityOk,
} from "../src/lib/chatModeDetector.ts";
import {
  detectGuidedInterviewIntent,
  detectInferenceFirstIntent,
} from "../src/lib/ideStartMode.ts";
import { shouldHoldFirstSeedBeatA } from "../lib/newProductWorkspace.ts";
import { chatModeSystemAppendix } from "../src/lib/grokChatArtifacts.ts";
import { handleSmartChatMessage } from "../src/lib/smartChatHandler.ts";

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
  assert.equal(detectGuidedInterviewIntent("please interview me with architecture questions"), true);
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

section("functionality-ok unlocks one post-code UI Gen — not a broken-app complaint");
{
  assert.equal(userNoteSignalsFunctionalityOk("the app works"), true);
  assert.equal(userNoteSignalsFunctionalityOk("I'm happy with the functionality"), true);
  assert.equal(userNoteSignalsFunctionalityOk("functionality is good"), true);
  assert.equal(userNoteSignalsFunctionalityOk("it works well"), true);
  assert.equal(userNoteSignalsFunctionalityOk("doesn't work"), false);
  assert.equal(userNoteSignalsFunctionalityOk("make it work"), false);
  assert.equal(userNoteSignalsFunctionalityOk("generate ui"), false);
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
  assert.equal(detectGuidedInterviewIntent("brainstorm with me"), false);
  assert.equal(detectGuidedInterviewIntent("interview me"), true);
}

section("describeChatMode");
{
  const msg = describeChatMode("guided", true);
  assert.match(msg, /Guided|Discovery|interview/i);
}

section("suggest features + goal is shape — not the build-vs-shape canned closer");
{
  const CANNED =
    "I can build what you have in mind right now, or we can shape it together and land on something stronger. Which sounds better?";
  const userMsg =
    'build an app to build simple todo list using pomodoro method. suggest features / market / opinion';
  assert.equal(looksLikeBuildVsShapeCannedCloser(CANNED), true);
  assert.equal(looksLikeBuildVsShapeCannedCloser(userMsg), false);
  assert.equal(userNoteRequestsShapeTurn(userMsg), true);
  assert.equal(
    shouldHoldFirstSeedBeatA({ userText: userMsg, prior: [], isBootstrap: false }),
    false,
  );
  assert.equal(
    shouldHoldFirstSeedBeatA({
      userText: "suggest features",
      prior: [
        {
          role: "assistant",
          content: `That's a sharp Monday loop. If I understood correctly, this is what the app should do: a Pomodoro todo list. Is that right? ${CANNED}`,
        },
      ],
    }),
    false,
  );

  const shapeAppendix = chatModeSystemAppendix({
    interactionMode: "chat",
    codingHint: "brainstorm-shape-plan",
    discoveryRequired: true,
    mode: "free",
  });
  assert.match(shapeAppendix, /ACTIVE MODE: SHAPE TURN/);
  assert.match(shapeAppendix, /NEVER re-ask/);
  assert.match(shapeAppendix, /START_MASTERPLAN/);
  assert.match(shapeAppendix, /THIS TURN FORBIDDEN: START_CODING/);

  const smart = await handleSmartChatMessage(userMsg, {
    masterPlanComplete: false,
    interactionMode: "chat",
  });
  assert.equal(smart.codingHint, "brainstorm-shape-plan");
  assert.equal(smart.handledLocally, false);
}

console.log("\nAll chat-mode detector tests passed.\n");
