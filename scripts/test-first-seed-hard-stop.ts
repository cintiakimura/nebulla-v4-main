/**
 * Pass 8 — first seed is Beat A only; stub plans do not skip chat.
 * Run: npx tsx scripts/test-first-seed-hard-stop.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isFoundationCloseGate,
  priorHasSpokenFork,
  shouldHoldFirstSeedBeatA,
} from "../lib/newProductWorkspace.ts";
import { planRecordReadyToSkipChat } from "../lib/masterPlanCompleteness.ts";
import { planRecordHasUsableGoal } from "../lib/spineSequenceClient.ts";
import { isNewProductSeedAgainstCurrent } from "../lib/productGoalFingerprint.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const chat = fs.readFileSync(path.join(root, "src/components/ide/AIChat.tsx"), "utf8");
const pipeline = fs.readFileSync(path.join(root, "src/lib/nebulaGrokCodingPipeline.ts"), "utf8");

const helioSeed =
  "Helio Hub — a solar dashboard for homeowners to track panels, handoff to the accountant.";
const fork =
  "That's a sharp Monday loop. If I understood correctly, this is what the app should do: homeowners track solar and hand off to the accountant. Is that right? I can build what you have in mind right now, or we can shape it together and land on something stronger. Which sounds better?";

assert.equal(
  shouldHoldFirstSeedBeatA({ userText: helioSeed, prior: [], isBootstrap: false }),
  true,
);
assert.equal(
  shouldHoldFirstSeedBeatA({
    userText: "FAST PROTOTYPE MODE. The user gave a product seed.",
    prior: [],
    isBootstrap: true,
  }),
  true,
);
assert.equal(priorHasSpokenFork([{ role: "assistant", content: fork }]), true);
assert.equal(
  shouldHoldFirstSeedBeatA({
    userText: "build",
    prior: [
      { role: "user", content: helioSeed },
      { role: "assistant", content: fork },
    ],
    closeGate: true,
    lockAndBuild: true,
  }),
  false,
);
assert.equal(isFoundationCloseGate("build"), true);
assert.equal(isFoundationCloseGate("go"), true);
assert.equal(isFoundationCloseGate("hellos"), true);

const stubPlan = {
  "1. Goal of the app": "Helio Hub solar dashboard for homeowners.",
  "2. Tech and Research": "",
  "3. Features and KPIs": "",
  "4. Pages and navigation": "",
  "5. UI/UX design": "",
};
assert.equal(planRecordHasUsableGoal(stubPlan), true, "stub still has a usable §1");
assert.equal(planRecordReadyToSkipChat(stubPlan), false, "stub must not skip chat");

assert.equal(
  isNewProductSeedAgainstCurrent({
    userText: "Taskwise — a task board for teams",
    chipName: "Helio Hub",
    diskGoal: "Helio Hub solar dashboard",
  }),
  true,
);

assert.match(
  fs.readFileSync(path.join(root, "src/lib/ideChatBootstrap.ts"), "utf8"),
  /NAME-ONLY/,
);
assert.match(chat, /shouldHoldFirstSeedBeatA/);
assert.match(chat, /planRecordReadyToSkipChat/);
assert.match(chat, /mpSaved = beatAHold/);
assert.match(chat, /let willCode =\s+agentAllowed &&\s+!beatAHold/);
assert.match(chat, /forceGoPipeline &&\s+!beatAHold/);
assert.equal(
  /blocked\.code === 'GO_EMPTY_OUTPUT' \|\| blocked\.code === 'GO_FAILED'/.test(pipeline),
  false,
  "do not relaunch empty Grok Code as success",
);

console.log("✓ first seed hard stop + stub plan does not skip chat");
