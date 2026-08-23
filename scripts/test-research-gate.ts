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
  goalFingerprint,
  legacyGoalFingerprint,
  parseCompetitorNames,
  parseCompetitorNamesFromPlan,
  writeResearchArtifact,
} from "../lib/researchArtifact.ts";
import { seedGoalOfTheAppSection } from "../lib/spineSequenceClient.ts";
import { RESEARCH_STAGE_SEARCHING } from "../lib/researchStages.ts";
import { canStartUiMockup, readinessBlocksAutoFoundation } from "../src/lib/uiMockupGate.ts";
import { buildFastPrototypeBootstrap } from "../src/lib/ideChatBootstrap.ts";
import { finishGrokActivityWithProblems } from "../src/lib/ideGrokActivityStatus.ts";
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
  section("Master Plan §2 competitors satisfy Gate R");
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "research-plan-"));
    const gateMissing = assessResearchArtifact(tmp);
    assert.equal(gateMissing.ok, false);
    const plan = {
      "2. Tech and Research": [
        "**Research (Web Search — Gate R):**",
        "- **Competitors:** Khan Academy Kids, ABCmouse, Beast Academy, DoodleMaths, Nessy Learning, BrainPOP Jr., Epic!, Jotit.",
      ].join("\n"),
    };
    const names = parseCompetitorNamesFromPlan(plan);
    assert.ok(names.length >= 5, names.join(", "));
    assert.ok(names.includes("Khan Academy Kids"));
    const gate = assessResearchArtifact(tmp, { plan });
    assert.equal(gate.ok, true, gate.reasons.join("; "));
    assert.ok(gate.competitorCount >= 5);
  }

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

  section("table / bold competitor names still count");
  {
    const md = [
      "# Competitor research",
      "## Category",
      "ADHD tutor",
      "## Assumptions",
      "- CONFIRMED: short sessions.",
      "## Competitors",
      "| Name | URL |",
      "| --- | --- |",
      "| Khan Academy | https://khanacademy.org |",
      "| Duolingo | https://duolingo.com |",
      "| Prodigy Math | https://prodigygame.com |",
      "**Todoist** — tasks",
      "5. Forest — focus timer",
      "6. Focus@Will — audio",
      "## Feature map",
      "| Feature | Count |",
      "| --- | --- |",
      "| Timed practice | 6 |",
      "| Adult progress | 5 |",
      "| One next action | 4 |",
      "## UI/UX patterns",
      "Low density kid home with one primary CTA and large tap targets for ADHD.",
      "## Evidence",
      "No supporting studies found for this feature.",
    ].join("\n");
    const names = parseCompetitorNames(md);
    assert.ok(names.length >= 5, names.join(", "));
    assert.ok(names.includes("Khan Academy"));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "research-table-"));
    writeResearchArtifact(tmp, md);
    const gate = assessResearchArtifact(tmp);
    assert.equal(gate.ok, true, gate.reasons.join("; "));
  }

  section("seeded §1 does not stale research for the same project");
  {
    const short = "tutor kids with ADHD";
    const seeded = seedGoalOfTheAppSection(
      {
        "1. Goal of the app": "",
        "4. Pages and navigation": "### Kid Home `/`\nPractice for ADHD kids.",
      },
      [short],
    );
    assert.match(seeded, /Project Type/i);
    assert.equal(goalFingerprint(short), goalFingerprint(seeded));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "research-seed-fp-"));
    writeResearchArtifact(
      tmp,
      validResearchMd().replace(/goal_fingerprint:\s*\S+/, `goal_fingerprint: ${goalFingerprint(short)}`),
    );
    const gate = assessResearchArtifact(tmp, { goal: seeded, goalCandidates: [short] });
    assert.equal(gate.ok, true, gate.reasons.join("; "));
    const tmpLegacy = fs.mkdtempSync(path.join(os.tmpdir(), "research-legacy-fp-"));
    writeResearchArtifact(
      tmpLegacy,
      validResearchMd().replace(
        /goal_fingerprint:\s*\S+/,
        `goal_fingerprint: ${legacyGoalFingerprint(seeded)}`,
      ),
    );
    const legacyGate = assessResearchArtifact(tmpLegacy, { goal: seeded });
    assert.equal(legacyGate.ok, true, legacyGate.reasons.join("; "));
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
  assert.match(researchClient, /softAbort:/);
  assert.match(researchClient, /isAbortLikeError/);
  assert.match(researchClient, /stillPending/);
  assert.match(researchClient, /RESEARCH_IN_FLIGHT_WAIT_LOOPS = 36/);
  assert.match(server, /code: "RESEARCH_INCOMPLETE"/);
  assert.match(server, /inferGoalFromPlanRecord/);
  assert.match(chat, /goal:\s*projectName/);
  assert.equal(/continuing Foundation anyway/.test(chat), false);
  assert.equal(
    /foundationGate = \{ ok: true, reason: 'explicit_skip' \}/.test(chat),
    false,
    'failed Gate R must not start Foundation',
  );
  assert.match(server, /parseCompetitorNamesFromPlan|plan: planSnapshot/);
  assert.match(server, /inferGoalFromPlanRecord\(plan, \[qGoal, qName\]\)/);
  assert.match(researchClient, /competitorCount >= 5/);
  assert.match(researchClient, /formatResearchStopMessage/);
  assert.match(researchClient, /skipped \|\| competitorCount >= 5/);
  {
    const goPost = server.slice(server.indexOf('app.post("/api/grok/go-code"'));
    const pollAt = goPost.indexOf('app.post("/api/grok/go-code/poll"');
    const goBody = goPost.slice(0, pollAt > 0 ? pollAt : 12000);
    const assessAt = goBody.indexOf('assessResearchArtifact');
    const pendingAt = goBody.indexOf('writeGoCodePending');
    assert.ok(
      assessAt >= 0 && assessAt < pendingAt,
      'Gate R must 409 before writeGoCodePending',
    );
    assert.equal(/bypass RESEARCH_INCOMPLETE/.test(goBody), false);
  }
  {
    const pipeline = fs.readFileSync(path.join(root, "src/lib/nebulaGrokCodingPipeline.ts"), "utf8");
    const goFn = pipeline.slice(pipeline.indexOf('export async function runGoCodeAndApply'));
    const ensureAt = goFn.indexOf('blockGoIfResearchIncomplete');
    const inflightAt = goFn.indexOf('markFoundationGoInFlight(projectName, true)');
    assert.ok(ensureAt >= 0 && ensureAt < inflightAt, 'client must not mark Go in-flight before Gate R');
    assert.ok(
      goFn.indexOf("Code pass 1 (waiting for generated files)") > ensureAt,
      'pipeline must not emit Code pass 1 before Gate R',
    );
    assert.match(pipeline, /START_CODING detected/);
    const handoff = pipeline.slice(pipeline.indexOf('export async function handlePostGrokCodingTurn'));
    assert.ok(
      handoff.indexOf('blockGoIfResearchIncomplete') < handoff.indexOf('START_CODING detected'),
      'must not log START_CODING detected before Gate R',
    );
    assert.equal(/Go — \$\{goCodePassWaitLabel\(1/.test(goFn.slice(0, inflightAt + 80)), false);
  }
  assert.match(chat, /if \(!research\.ok\)/);
  assert.match(chat, /willCode = false/);
  assert.match(chat, /Retry research/);
  {
    const idxPass1 = chat.indexOf("currentAction: 'Grok Code — Code pass 1");
    const idxGateR = chat.indexOf('const st = await fetchResearchStatus(projectName)');
    assert.ok(idxGateR >= 0 && idxPass1 > idxGateR, 'do not show Code pass 1 before Gate R re-check');
    assert.match(chat, /FOUNDATION_RETRY_ACTIVITY|Retry Go for Foundation/);
    assert.equal(/continuing Foundation anyway/.test(chat), false);
  }
  assert.match(chat, /planningPhase = 'PLAN_READY'/);
  assert.equal(/planningPhase = 'START_CODING'/.test(chat), false);
  assert.match(chat, /isOrchestrationOnlyPlanSource\(planningPhase\)/);
  assert.match(chat, /Foundation already on disk — send Continue/);
  {
    const idxLanded = chat.indexOf('const foundationAlreadyLanded');
    const idxHandoff = chat.lastIndexOf('await handlePostGrokCodingTurn');
    const idxPass1 = chat.indexOf("currentAction: 'Grok Code — Code pass 1");
    assert.ok(idxLanded >= 0 && idxHandoff > idxLanded, 'stop Go before START_CODING handoff when Foundation exists');
    assert.ok(idxPass1 > idxLanded, 'do not show Code pass 1 before Foundation-on-disk check');
    const idxEarlyGo = chat.indexOf("beginCodingActivity(\n        'Build mode");
    assert.equal(idxEarlyGo, -1, 'build/Fast Prototype must not start coding chrome before research');
    assert.match(chat, /beginPlanActivity/);
    const idxEnsure = chat.indexOf('ensureResearchBeforeUiAndGo');
    const idxGoApply = chat.lastIndexOf('await runGoCodeAndApply');
    assert.ok(idxEnsure >= 0 && idxPass1 > idxEnsure, 'Code pass 1 UI only after research helper');
    assert.ok(idxGoApply > idxPass1, 'Code pass 1 UI immediately before runGoCodeAndApply');
  }
  const artifacts = fs.readFileSync(path.join(root, "src/lib/grokChatArtifacts.ts"), "utf8");
  assert.match(artifacts, /export function isOrchestrationOnlyPlanSource/);
  assert.match(artifacts, /if \(isOrchestrationOnlyPlanSource\(source\)\) return 0/);
  assert.match(chat, /blockedCode: coding\.blockedReason\?\.code/);
  assert.match(
    fs.readFileSync(path.join(root, "lib/nebulaResearchStroke.ts"), "utf8"),
    /Rewrite the draft below so ## Competitors is a numbered list/,
  );
  assert.match(chat, /nebula-preview-wait-status/);
  {
    const done = finishGrokActivityWithProblems(null, [
      "Architecture incomplete: research not complete (need ≥5 real competitors + rankings)",
      "Stopped: research not complete — Foundation will not start.",
    ]);
    const banner = String(done.currentAction || done.steps?.[0]?.detail || done.steps?.[0]?.label || "");
    assert.match(banner, /Stopped: research not complete/);
    assert.equal(/Architecture incomplete:.*Stopped:/.test(banner), false);
  }

  console.log("\n✓ research gate passed\n");
} finally {
  if (prevSkip === undefined) delete process.env.NEBULLA_SKIP_RESEARCH;
  else process.env.NEBULLA_SKIP_RESEARCH = prevSkip;
}

function section(name: string) {
  console.log(`\n▸ ${name}`);
}
