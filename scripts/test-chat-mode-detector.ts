/**
 * Chat mode detector — Discovery gate.
 * Run: npm run test:chat-mode
 */
import assert from "node:assert/strict";
import { detectChatMode, describeChatMode } from "../src/lib/chatModeDetector.ts";

function section(name: string) {
  console.log(`\n✓ ${name}`);
}

section("incomplete plan: build/coding/UI → Discovery");
{
  for (const msg of [
    "just build something",
    "implement the dashboard",
    "open UI Studio and generate ui",
    "refine the master plan architecture",
    "continue building the app",
  ]) {
    const r = detectChatMode(msg, { masterPlanComplete: false });
    assert.equal(r.mode, "guided", msg);
    assert.equal(r.discoveryRequired, true, msg);
  }
}

section("incomplete plan: debug may run with discoveryRequired");
{
  const r = detectChatMode("fix the login TypeError crash", { masterPlanComplete: false });
  assert.equal(r.mode, "debugging");
  assert.equal(r.discoveryRequired, true);
}

section("complete plan: coding and UI allowed");
{
  const coding = detectChatMode("implement the dashboard", { masterPlanComplete: true });
  assert.equal(coding.mode, "coding");
  assert.equal(coding.discoveryRequired, false);

  const ui = detectChatMode("generate ui from ui-brief", { masterPlanComplete: true });
  assert.equal(ui.mode, "ui");
}

section("describeChatMode honest about Discovery");
{
  const msg = describeChatMode("coding", true);
  assert.match(msg, /Discovery/i);
}

console.log("\nAll chat-mode detector tests passed.\n");
