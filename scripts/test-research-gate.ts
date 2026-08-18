/**
 * Gate R — research artifact minimum + Fast Prototype does not skip research.
 * Run: npx tsx scripts/test-research-gate.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  RESEARCH_ARTIFACT_REL,
  RESEARCH_STOPPED,
  assessResearchArtifact,
  writeResearchArtifact,
} from "../lib/researchArtifact.ts";
import { RESEARCH_STAGE_SEARCHING } from "../lib/researchStages.ts";
import { canStartUiMockup, readinessBlocksAutoFoundation } from "../src/lib/uiMockupGate.ts";
import { buildFastPrototypeBootstrap } from "../src/lib/ideChatBootstrap.ts";
import { formatGoBlockedByPlanMessage } from "../src/lib/masterPlanStatus.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function validResearchMd(opts?: { competitors?: string[] }): string {
  const names = opts?.competitors ?? [
    "Khan Academy",
    "Duolingo",
    "Prodigy Math",
    "Todoist",
    "Forest",
    "Focus@Will",
  ];
  return [
    "# Competitor research",
    "",
    "project_key: test-key",
    "goal_fingerprint: 123",
    `timestamp: ${new Date().toISOString()}`,
    "",
    "## Category",
    "",
    "Education / ADHD tutoring web app for kids, teachers, and parents.",
    "",
    "## Assumptions",
    "",
    "- INFERRED (before search): Education roles student + teacher.",
    "- CONFIRMED: Short sessions and low visual noise appear across ADHD tools.",
    "- CORRECTED: Not a generic LMS — closer to practice + timer apps.",
    "",
    "## Competitors",
    "",
    ...names.map((n, i) => `${i + 1}. ${n} — real product`),
    "",
    "## Feature map",
    "",
    "1. Timed practice sessions (6/6)",
    "2. Progress dashboard for adult (5/6)",
    "3. Streaks / rewards (4/6)",
    "4. Simple home with one next action (4/6)",
    "",
    "## UI/UX patterns",
    "",
    "Mobile-first or large tap targets; bottom or simple top nav; low density; calm tone; one primary CTA per screen; avoid dense tables on kid home.",
    "",
    "## Evidence",
    "",
    "No supporting studies found for this feature.",
    "",
  ].join("\n");
}

const prevSkip = process.env.NEBULLA_SKIP_RESEARCH;
delete process.env.NEBULLA_SKIP_RESEARCH;

try {
  section("missing artifact → Gate R fail");
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "research-missing-"));
    const gate = assessResearchArtifact(tmp);
    assert.equal(gate.ok, false);
    assert.equal(gate.skipped, false);
    assert.ok(gate.reasons.some((r) => /missing/i.test(r)));
    assert.equal(gate.path, RESEARCH_ARTIFACT_REL);
  }

  section("0 competitors → not Gate R");
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "research-zero-"));
    writeResearchArtifact(
      tmp,
      validResearchMd({ competitors: [] }).replace(/## Competitors[\s\S]*?## Feature map/, "## Competitors\n\n(none)\n\n## Feature map"),
    );
    const gate = assessResearchArtifact(tmp);
    assert.equal(gate.ok, false);
    assert.equal(gate.competitorCount, 0);
  }

  section("invented names do not count");
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "research-fake-"));
    writeResearchArtifact(tmp, validResearchMd({ competitors: ["Competitor 1", "Example 2", "Acme", "Foo", "Bar"] }));
    const gate = assessResearchArtifact(tmp);
    assert.equal(gate.ok, false);
    assert.ok(gate.competitorCount < 5);
  }

  section("valid research → Gate R ok");
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "research-ok-"));
    writeResearchArtifact(tmp, validResearchMd());
    const gate = assessResearchArtifact(tmp);
    assert.equal(gate.ok, true, gate.reasons.join("; "));
    assert.ok(gate.competitorCount >= 5);
    assert.ok(gate.competitorCount <= 10);
  }

  section("demo skip flag → ok skipped (not production default)");
  {
    process.env.NEBULLA_SKIP_RESEARCH = "1";
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "research-skip-"));
    const gate = assessResearchArtifact(tmp);
    assert.equal(gate.ok, true);
    assert.equal(gate.skipped, true);
    delete process.env.NEBULLA_SKIP_RESEARCH;
  }

  section("client gates: researchOk false blocks mockup and auto-foundation");
  assert.equal(
    canStartUiMockup({
      masterPlan: {
        "1. Goal of the app": "Tutor kids with ADHD using short practice sessions",
        "2. Tech stack and research": "Web App",
        "3. Features and success metrics": "Timer + dashboard",
        "4. Pages and navigation": "/home /practice /teacher",
        "5. UI/UX design": "Calm tokens",
      },
      uiBriefLength: 200,
      uiBriefPageCount: 3,
      researchOk: false,
    }),
    false,
  );
  assert.equal(
    readinessBlocksAutoFoundation({
      ok: false,
      planComplete: true,
      uiBriefLength: 200,
      uiBriefPageCount: 3,
      researchOk: false,
      reasons: ["research not complete"],
    }),
    true,
  );

  section("Go stop copy");
  assert.equal(RESEARCH_STOPPED, "Stopped: research not complete — Foundation will not start.");
  assert.equal(RESEARCH_STAGE_SEARCHING, "Researching competitors and patterns (Web Search)…");
  assert.equal(
    formatGoBlockedByPlanMessage({ error: RESEARCH_STOPPED }),
    RESEARCH_STOPPED,
  );

  section("Fast Prototype default path does not skip research");
  const fast = buildFastPrototypeBootstrap("tutor kids with ADHD", "Web App");
  assert.match(fast, /Web Search/);
  assert.match(fast, /Do not skip research/i);
  assert.equal(/skip-with-reason/i.test(fast), false);
  assert.equal(/invent competitor names/i.test(fast), true);
  const bootstrapSrc = fs.readFileSync(path.join(root, "src/lib/ideChatBootstrap.ts"), "utf8");
  assert.equal(/skip-with-reason/i.test(bootstrapSrc), false);

  section("server + client wire Gate R");
  const server = fs.readFileSync(path.join(root, "server.ts"), "utf8");
  const chat = fs.readFileSync(path.join(root, "src/components/ide/AIChat.tsx"), "utf8");
  const grokSearch = fs.readFileSync(path.join(root, "lib/grokWebSearch.ts"), "utf8");
  assert.match(server, /app\.post\("\/api\/grok\/research"/);
  assert.match(server, /tools: \[\{ type: "web_search" \}\]|callGrokWebSearch|runResearchStroke/);
  assert.match(grokSearch, /\/v1\/responses/);
  assert.match(grokSearch, /web_search/);
  assert.match(chat, /ensureResearchBeforeUiAndGo/);
  assert.match(chat, /research\.softAbort/);
  const researchClient = fs.readFileSync(path.join(root, "src/lib/nebulaResearchClient.ts"), "utf8");
  assert.match(researchClient, /softAbort: true/);
  assert.match(researchClient, /isAbortLikeError/);
  assert.match(server, /code: "RESEARCH_INCOMPLETE"/);
  assert.match(server, /inferGoalFromPlanRecord/);
  assert.match(chat, /goal:\s*projectName/);

  console.log("\n✓ research gate passed\n");
} finally {
  if (prevSkip === undefined) delete process.env.NEBULLA_SKIP_RESEARCH;
  else process.env.NEBULLA_SKIP_RESEARCH = prevSkip;
}

function section(name: string) {
  console.log(`\n▸ ${name}`);
}
