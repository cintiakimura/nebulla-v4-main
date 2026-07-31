#!/usr/bin/env node
/**
 * Fail if critical prompts reintroduce "V0 mandatory / NON-NEGOTIABLE" product law.
 * Historical CHANGELOG inventory lines are excluded.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const FILES = [
  "src/lib/nebulaAssistantSystemPrompt.ts",
  "lib/nebulaMasterPlanSynthesis.ts",
  "src/lib/grokChatArtifacts.ts",
  "nebula-project/project-execution-rules.md",
  "nebula-project/ui-studio.md",
];

const BAD = [
  /V0\s+auto-trigger\s+is\s+NON-NEGOTIABLE/i,
  /v0\s+API\s+Key\s*\(required/i,
  /mandatory\s+V0/i,
  /V0\s+is\s+required\s+for\s+a\s+valid\s+project/i,
  /Primary stack today:.*\+\s*\*\*v0\*\*\s+for UI generation/i,
];

let failed = false;
for (const rel of FILES) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) continue;
  const text = fs.readFileSync(abs, "utf8");
  for (const re of BAD) {
    if (re.test(text)) {
      console.error(`FAIL ${rel}: matches ${re}`);
      failed = true;
    }
  }
}

if (failed) process.exit(1);
console.log("✓ ui-brief-primary prompt check passed\n");
