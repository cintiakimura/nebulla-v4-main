/**
 * Nebula Swarm — server-side handoff builder.
 *
 * **Strict agent rules (usage policy):**
 * - **Planner** — at most **once** per project, **only** in Pre–Phase 0 (`pre_phase_0`).
 * - **Researcher** — same single turn as Planner.
 * - **Tester** — explicit “run tests” / “test” / fix-failing-tests language, or explicit final-validation / ship-check phrasing.
 * - **Reviewer** — user says “review” / “code review”, or message signals a **big feature** completed; Full Quality only.
 * - State file: `nebula-project/nebula-swarm-state.json` (see `nebulaSwarmState.ts`).
 * - Payload caps + JSON mode keep tokens low; agents never receive the full codebase.
 *
 * **API keys:** `GROK_SWARM_API_KEY` (Grok 3) + optional Reviewer on `GROK_API_KEY` (Grok 4.1).
 * Project Isolator: swarm pack + rules excerpt only — no repo reads.
 */

import fs from "fs";
import path from "path";
import {
  anyAgentRuns,
  buildSwarmAgentRunPlan,
  type SwarmHandoffHints,
  type SwarmIntensity,
} from "./nebulaSwarmExecutionPlan";
import { readNebulaSwarmState, writeNebulaSwarmState } from "./nebulaSwarmState";

export type { SwarmIntensity };

const SWARM_PHASES = new Set([
  "pre_phase_0",
  "phase_0",
  "phase_1",
  "phase_2",
  "phase_3",
  "phase_4",
  "phase_5",
]);

/** Caps — tuned to reduce average tokens per swarm invocation. */
const CAP = {
  userMessage: 4_000,
  contextSummary: 1_200,
  focusPathList: 3,
  focusPathChars: 200,
  focusSnippetPerFile: 1_800,
  focusSnippetTotal: 4_500,
  orchestratorRead: 4_000,
  orchestratorInject: 1_800,
  rulesRead: 4_500,
  rulesInject: 3_000,
  plannerRoleRead: 3_000,
  plannerRoleInject: 2_000,
  researcherRoleRead: 2_800,
  researcherRoleInject: 1_800,
  testerRoleRead: 2_800,
  testerRoleInject: 1_800,
  reviewerRoleRead: 2_800,
  reviewerRoleInject: 2_200,
  reviewerDraftJson: 14_000,
  reviewerUserMsg: 2_500,
  safeJsonMarkdownFallback: 4_000,
} as const;

function readTextFile(fp: string, maxChars: number): string {
  try {
    const s = fs.readFileSync(fp, "utf8");
    if (s.length <= maxChars) return s;
    return `${s.slice(0, maxChars)}\n…[truncated]`;
  } catch {
    return "";
  }
}

function safeJsonObject(content: string): Record<string, unknown> {
  const t = content.trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start < 0 || end <= start) return { markdown: t.slice(0, CAP.safeJsonMarkdownFallback) };
  try {
    const parsed = JSON.parse(t.slice(start, end + 1)) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* fall through */
  }
  return { markdown: t.slice(0, CAP.safeJsonMarkdownFallback) };
}

async function grokChatCompletionJson(
  label: string,
  apiKey: string,
  model: string,
  system: string,
  user: string,
  useJsonObjectMode: boolean
): Promise<{ text: string; ms: number }> {
  const t0 = Date.now();
  const payload: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    stream: false,
  };
  if (useJsonObjectMode) {
    payload.response_format = { type: "json_object" };
  }
  const doFetch = () =>
    fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

  let res = await doFetch();
  if (!res.ok && useJsonObjectMode && payload.response_format) {
    const errText = await res.text();
    if (res.status === 400 && /json|response_format|unsupported|invalid/i.test(errText)) {
      delete payload.response_format;
      res = await doFetch();
    } else {
      throw new Error(`${label} (${model}) failed (${res.status}): ${errText.slice(0, 500)}`);
    }
  }
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`${label} (${model}) failed (${res.status}): ${errText.slice(0, 500)}`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content?.trim() ?? "";
  const ms = Date.now() - t0;
  return { text, ms };
}

/**
 * Bearer tokens for swarm support agents on the **Grok 3** lane (same key repeated is fine).
 */
export type SwarmHandoffAgentKeys = {
  planner: string;
  researcher: string;
  tester: string;
  swarmModel: string;
};

export type SwarmHandoffServerResult = {
  schemaVersion: "1.0.0";
  intensity: SwarmIntensity;
  phase: string;
  runId: string;
  projectName: string;
  planner: Record<string, unknown>;
  researcher: Record<string, unknown>;
  tester: Record<string, unknown>;
  reviewer?: Record<string, unknown>;
  notesForGrok: string;
  timestamp: string;
  /** Latest durable flags after this handoff (for client cache). */
  swarmStateSnapshot?: { plannerDone: boolean; researcherDone: boolean };
  /** True when no xAI support agents ran (plan said skip — token savings). */
  agentsSkipped?: boolean;
  /** Why each agent did/did not run (debug + client UX). */
  agentRun?: {
    reasons: string[];
    runPlanner: boolean;
    runResearcher: boolean;
    runTester: boolean;
    runReviewer: boolean;
  };
};

/** Injected when the handoff route returns early — keeps Grok aligned without re-planning. */
export const NO_SWARM_AGENTS_NOTE =
  "No swarm support agents ran this turn (Planner+Researcher: once, Pre–Phase 0 only; Tester: explicit test/final-validation wording; Reviewer: explicit review or big-feature-done wording). No new planning/research needed — proceed with master-plan.json and project-execution-rules.md unless the user changes scope.";

function stubSkipped(agent: string, reason: string): Record<string, unknown> {
  return { _skipped: true, _agent: agent, markdown: "", reason };
}

function agentOk(o: Record<string, unknown>): boolean {
  return o.error !== true;
}

type HandoffOpts = {
  repoRoot: string;
  workspaceRoot: string;
  userMessage: string;
  phase: string;
  projectName: string;
  runId: string;
  intensity: SwarmIntensity;
  /** Grok 4.1 lane — required when Reviewer is in the run plan. */
  reviewerLane?: { apiKey: string; model: string };
  /** Short recap of recent chat (client-built); never full thread. */
  contextSummary?: string;
  /** Up to 3 paths — labels only (Tester/Reviewer scope). */
  focusPaths?: string[];
  /** Optional path → small code chunk from client only. Max 3 keys; values hard-capped. */
  focusSnippets?: Record<string, string>;
  /** Client hints: after coding, final delivery, explicit test/review keywords, etc. */
  swarmHints?: SwarmHandoffHints;
};

function assembleUserBlock(
  o: HandoffOpts,
  phase: string,
  intensity: SwarmIntensity,
  scopeLine: string
): string {
  const summary = (o.contextSummary || "").trim().slice(0, CAP.contextSummary);
  const paths = Array.isArray(o.focusPaths)
    ? o.focusPaths
        .slice(0, CAP.focusPathList)
        .map((p) => String(p || "").trim().slice(0, CAP.focusPathChars))
        .filter(Boolean)
    : [];
  const parts = [
    `Swarm phase: ${phase}`,
    `Project: ${o.projectName}`,
    `Run: ${o.runId}`,
    `Intensity: ${intensity}`,
    "",
    "User message:",
    o.userMessage.slice(0, CAP.userMessage),
  ];
  if (summary) parts.push("", "Recent chat (summary, not full history):", summary);
  if (paths.length) parts.push("", "Focus paths (labels only):", paths.join("\n"));
  const snippets = o.focusSnippets && typeof o.focusSnippets === "object" ? o.focusSnippets : null;
  if (snippets) {
    const keys = Object.keys(snippets).slice(0, 3);
    let budget = CAP.focusSnippetTotal;
    const lines: string[] = [];
    for (const k of keys) {
      const v = String(snippets[k] ?? "")
        .replace(/\r\n/g, "\n")
        .slice(0, CAP.focusSnippetPerFile);
      const line = `${k}:\n${v}`;
      if (line.length > budget) {
        lines.push(`${k}:\n${v.slice(0, Math.max(0, budget - k.length - 1))}\n…`);
        break;
      }
      lines.push(line);
      budget -= line.length + 2;
    }
    if (lines.length) parts.push("", "Focus snippets (client-supplied only):", lines.join("\n---\n"));
  }
  parts.push("", "SCOPE (mandatory):", scopeLine);
  return parts.join("\n");
}

/**
 * Runs support agents per **execution plan** (P+R once in **pre_phase_0** only; Tester / Reviewer on
 * narrow user phrases). Persists `nebula-project/nebula-swarm-state.json` when Planner+Researcher succeed.
 */
export async function buildSwarmHandoffParallel(
  agentKeys: SwarmHandoffAgentKeys,
  opts: HandoffOpts
): Promise<SwarmHandoffServerResult> {
  const state = readNebulaSwarmState(opts.workspaceRoot);
  const phase = SWARM_PHASES.has(opts.phase) ? opts.phase : "pre_phase_0";
  const { intensity } = opts;
  const plan = buildSwarmAgentRunPlan({
    state,
    phase,
    userMessage: opts.userMessage,
    intensity,
    hints: opts.swarmHints,
  });

  const agentRun = {
    reasons: plan.reasons,
    runPlanner: plan.runPlanner,
    runResearcher: plan.runResearcher,
    runTester: plan.runTester,
    runReviewer: plan.runReviewer,
  };

  // Zero LLM calls when the plan selects no agents — normal coding turns stay cheap.
  if (!anyAgentRuns(plan)) {
    const snap0 = readNebulaSwarmState(opts.workspaceRoot);
    return {
      schemaVersion: "1.0.0",
      intensity,
      phase,
      runId: opts.runId,
      projectName: opts.projectName,
      planner: stubSkipped("planner", "no_agent_run_planned"),
      researcher: stubSkipped("researcher", "no_agent_run_planned"),
      tester: stubSkipped("tester", "no_agent_run_planned"),
      notesForGrok: NO_SWARM_AGENTS_NOTE,
      timestamp: new Date().toISOString(),
      agentsSkipped: true,
      agentRun,
      swarmStateSnapshot: {
        plannerDone: snap0.plannerDone,
        researcherDone: snap0.researcherDone,
      },
    };
  }

  const swarmRoot = path.join(opts.repoRoot, "skills", "nebula-swarm");
  const orchestrator = readTextFile(path.join(swarmRoot, "ORCHESTRATOR.md"), CAP.orchestratorRead);
  const plannerRole = readTextFile(path.join(swarmRoot, "agents", "PLANNER.md"), CAP.plannerRoleRead);
  const researcherRole = readTextFile(path.join(swarmRoot, "agents", "RESEARCHER.md"), CAP.researcherRoleRead);
  const testerRole = readTextFile(path.join(swarmRoot, "agents", "TESTER.md"), CAP.testerRoleRead);
  const reviewerRole = readTextFile(path.join(swarmRoot, "agents", "REVIEWER.md"), CAP.reviewerRoleRead);

  const rulesPath = path.join(opts.workspaceRoot, "project-execution-rules.md");
  const executionRulesExcerpt = readTextFile(rulesPath, CAP.rulesRead);

  const jsonContract = [
    "Output: a single JSON object only (no markdown fences, no text outside JSON).",
    'Keys: "markdown" (string, max ~500 chars, dense facts/checklists),',
    '"bullets" (array of max 5 strings, each max 90 chars),',
    '"warnings" (array of max 3 strings).',
    "Omit bullets/warnings if empty. No repetition; no preamble.",
  ].join(" ");

  const orchHint =
    orchestrator.length > 0
      ? `\n\nOrchestrator (excerpt):\n${orchestrator.slice(0, CAP.orchestratorInject)}`
      : "";

  const commonFooter = [
    "",
    "Execution rules excerpt (reference; do not paste into user chat):",
    executionRulesExcerpt.slice(0, CAP.rulesInject) || "(missing project-execution-rules.md)",
  ].join("\n");

  const systemFor = (
    agent: "planner" | "researcher" | "tester" | "reviewer",
    roleText: string,
    extra?: string
  ) =>
    [
      `Nebula Swarm ${agent.toUpperCase()} (read-only). Reply JSON only per contract.`,
      jsonContract,
      extra || "",
      roleText,
      orchHint,
      commonFooter,
    ]
      .filter(Boolean)
      .join("\n");

  const useJson = true;

  // Default stubs: explain why P/R did not run this turn (once-per-project or not selected).
  let planner: Record<string, unknown> = state.plannerDone
    ? stubSkipped("planner", "once_per_project_complete")
    : stubSkipped("planner", "not_run_this_turn");
  let researcher: Record<string, unknown> = state.researcherDone
    ? stubSkipped("researcher", "once_per_project_complete")
    : stubSkipped("researcher", "not_run_this_turn");
  let tester: Record<string, unknown> = stubSkipped("tester", "not_triggered_this_turn");
  let reviewer: Record<string, unknown> | undefined;

  if (plan.runPlanner && plan.runResearcher) {
    const ub = assembleUserBlock(
      opts,
      phase,
      intensity,
      "Bootstrap / Pre–Phase 0 only. One-time project alignment — do not assume post-bootstrap scope."
    );
    const [ps, rs] = await Promise.all([
      grokChatCompletionJson(
        "Swarm planner",
        agentKeys.planner,
        agentKeys.swarmModel,
        systemFor("planner", plannerRole.slice(0, CAP.plannerRoleInject)),
        ub,
        useJson
      ),
      grokChatCompletionJson(
        "Swarm researcher",
        agentKeys.researcher,
        agentKeys.swarmModel,
        systemFor("researcher", researcherRole.slice(0, CAP.researcherRoleInject)),
        ub,
        useJson
      ),
    ]);
    planner = { ...safeJsonObject(ps.text), _agent: "planner", _durationMs: ps.ms };
    researcher = { ...safeJsonObject(rs.text), _agent: "researcher", _durationMs: rs.ms };
    if (agentOk(planner) && agentOk(researcher)) {
      writeNebulaSwarmState(opts.workspaceRoot, {
        schemaVersion: 1,
        plannerDone: true,
        researcherDone: true,
      });
    }
  }

  if (plan.runTester) {
    const ub = assembleUserBlock(
      opts,
      phase,
      intensity,
      "Testing scope: ONLY focus paths/snippets above + user message — not whole-repo QA."
    );
    const tr = await grokChatCompletionJson(
      "Swarm tester",
      agentKeys.tester,
      agentKeys.swarmModel,
      systemFor("tester", testerRole.slice(0, CAP.testerRoleInject)),
      ub,
      useJson
    );
    tester = { ...safeJsonObject(tr.text), _agent: "tester", _durationMs: tr.ms };
  }

  if (plan.runReviewer && opts.reviewerLane?.apiKey) {
    const draftForReviewer = JSON.stringify({
      phase,
      projectName: opts.projectName,
      runId: opts.runId,
      planner,
      researcher,
      tester,
    }).slice(0, CAP.reviewerDraftJson);

    const reviewerSystem = systemFor(
      "reviewer",
      reviewerRole.slice(0, CAP.reviewerRoleInject),
      "markdown: P0/P1/P2 findings + short exit checks for main Grok. No patches, no secrets."
    );

    const reviewerUser = [
      "Draft handoff (support outputs; may include skipped stubs):",
      draftForReviewer,
      "",
      "Scoped context (modified files/snippets only):",
      assembleUserBlock(
        opts,
        phase,
        intensity,
        "Review scope: ONLY modified snippets/paths in this payload — not entire codebase."
      ).slice(0, CAP.reviewerUserMsg + 2_000),
    ].join("\n");

    try {
      const rev = await grokChatCompletionJson(
        "Swarm reviewer",
        opts.reviewerLane.apiKey,
        opts.reviewerLane.model,
        reviewerSystem,
        reviewerUser,
        useJson
      );
      reviewer = {
        ...safeJsonObject(rev.text),
        _agent: "reviewer",
        _durationMs: rev.ms,
        _model: opts.reviewerLane.model,
      };
    } catch (e) {
      reviewer = {
        markdown: "",
        error: true,
        _agent: "reviewer",
        warnings: [e instanceof Error ? e.message : String(e)],
      };
    }
  } else if (plan.runReviewer && !opts.reviewerLane?.apiKey) {
    reviewer = {
      _skipped: true,
      _agent: "reviewer",
      markdown: "",
      warnings: [
        "Reviewer was planned but skipped: no Grok 4.1 key (GROK_API_KEY or X-Grok-Api-Key on this request).",
      ],
    };
  }

  const ranParts = [
    plan.runPlanner && plan.runResearcher ? "P+R bootstrap" : "",
    plan.runTester ? "Tester" : "",
    plan.runReviewer ? "Reviewer" : "",
  ].filter(Boolean);
  const notesForGrok = `Swarm agents executed this turn: ${ranParts.join(" + ") || "none"}. Use packet internally; obey project-execution-rules.md; natural user reply.`;

  const snap1 = readNebulaSwarmState(opts.workspaceRoot);
  return {
    schemaVersion: "1.0.0",
    intensity,
    phase,
    runId: opts.runId,
    projectName: opts.projectName,
    planner,
    researcher,
    tester,
    ...(reviewer !== undefined ? { reviewer } : {}),
    notesForGrok,
    timestamp: new Date().toISOString(),
    agentRun,
    swarmStateSnapshot: {
      plannerDone: snap1.plannerDone,
      researcherDone: snap1.researcherDone,
    },
  };
}
