/**
 * Ensure sidecar keys fall back to MAIN_API_KEY_GROK.
 * Run: npx tsx scripts/test-grok-key-consolidate.ts
 */
import assert from "node:assert/strict";
import {
  readPlatformSwarmApiKey,
  readPlatformTtsApiKey,
  readPlatformWriterApiKey,
  readMainAiApiKeyFromEnv,
} from "../lib/nebulaMainGrokResolver";

const saved = { ...process.env };

function reset() {
  delete process.env.MAIN_API_KEY_GROK;
  delete process.env.MAIN_AI_API_KEY;
  delete process.env.GROK_API_KEY_LUMEN;
  delete process.env.GROK_SWARM_API_KEY;
  delete process.env.GROK_TTS_NEW_API_KEY;
  delete process.env.GROK_3_API_KEY;
}

try {
  reset();
  process.env.MAIN_API_KEY_GROK = "xai-" + "m".repeat(40);
  assert.equal(readMainAiApiKeyFromEnv().startsWith("xai-"), true);
  assert.equal(readPlatformSwarmApiKey(), readMainAiApiKeyFromEnv());
  assert.equal(readPlatformTtsApiKey(), readMainAiApiKeyFromEnv());
  assert.equal(readPlatformWriterApiKey(), readMainAiApiKeyFromEnv());
  console.log("✓ sidecars fall back to MAIN_API_KEY_GROK");

  process.env.GROK_SWARM_API_KEY = "xai-" + "s".repeat(40);
  assert.equal(readPlatformSwarmApiKey(), process.env.GROK_SWARM_API_KEY);
  assert.equal(readPlatformTtsApiKey(), readMainAiApiKeyFromEnv());
  console.log("✓ dedicated GROK_SWARM_API_KEY overrides main");

  reset();
  process.env.MAIN_API_KEY_GROK = "sk-ant-" + "a".repeat(40);
  assert.equal(readPlatformSwarmApiKey(), "");
  assert.equal(readPlatformTtsApiKey(), "");
  console.log("✓ Anthropic MAIN does not feed xAI sidecars");
} finally {
  process.env = saved as NodeJS.ProcessEnv;
}

console.log("\nAll grok key consolidate checks passed.\n");
