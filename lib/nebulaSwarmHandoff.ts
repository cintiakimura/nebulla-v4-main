/**
 * Nebula Swarm — server-side handoff (lean).
 *
 * - **No** Planner, Researcher, Tester, or Reviewer on normal chat handoffs.
 * - Main Grok 4 handles planning/research in user chat.
 * - Single **Quality** agent (code review + test suggestions) runs **only** when `manualRunAndTest`
 *   is set (TopBar Inspect), using **`GROK_SWARM_API_KEY`** + `GROK_SWARM_MODEL` (default `grok-3-mini`),
 *   scoped to recently changed git paths + optional client snippets. Normal chat uses `MAIN_AI_API_KEY` only.
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
import { getRecentlyChangedGitPaths } from "./nebulaSwarmGitPaths";

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

const CAP = {
  userMessage: 4_000,
  contextSummary: 1_200,
  focusPathList: 8,
  focusPathChars: 240,
  focusSnippetPerFile: 1_800,
  focusSnippetTotal: 5_500,
  orchestratorRead: 3_000,
  orchestratorInject: 1_400,
  rulesRead: 4_500,
  rulesInject: 3_000,
  qualityRoleRead: 4_000,
  qualityRoleInject: 3_200,
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

/** Legacy shape: `tester` key reused as unused placeholder when Quality runs. */
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
  /** Single merged Quality agent output (manual Run and Test). */
  quality?: Record<string, unknown>;
  notesForGrok: string;
  timestamp: string;
  swarmStateSnapshot?: { schemaVersion: 2; qualityLastRunAt?: string };
  agentsSkipped?: boolean;
  agentRun?: {
    reasons: string[];
    runQuality: boolean;
  };
};

export const NO_SWARM_AGENTS_NOTE =
  "Lean swarm: no support agents ran on this chat turn. Planning and research stay in main Grok (server MAIN_AI_API_KEY). Use **Inspect** when you want a scoped Quality pass on recently changed files (GROK_SWARM_API_KEY).";

function stubSkipped(agent: string, reason: string): Record<string, unknown> {
  return { _skipped: true, _agent: agent, markdown: "", reason };
}

type HandoffOpts = {
  repoRoot: string;
  workspaceRoot: string;
  userMessage: string;
  phase: string;
  projectName: string;
  runId: string;
  intensity: SwarmIntensity;
  /** Manual "Run and Test" / Inspect — single Quality call using `GROK_SWARM_API_KEY` + swarm model (default grok-3-mini). */
  manualRunAndTest?: boolean;
  qualityLane?: { apiKey: string; model: string };
  contextSummary?: string;
  focusPaths?: string[];
  focusSnippets?: Record<string, string>;
  swarmHints?: SwarmHandoffHints;
};

function mergeFocusPaths(gitPaths: string[], clientPaths: string[] | undefined): string[] {
  const s = new Set<string>();
  for (const p of gitPaths) {
    const t = String(p || "").trim().slice(0, CAP.focusPathChars);
    if (t) s.add(t);
  }
  if (clientPaths) {
    for (const p of clientPaths) {
      const t = String(p || "").trim().slice(0, CAP.focusPathChars);
      if (t) s.add(t);
    }
  }
  return [...s].slice(0, CAP.focusPathList);
}

function assembleUserBlock(
  o: HandoffOpts,
  phase: string,
  intensity: SwarmIntensity,
  scopeLine: string,
  paths: string[]
): string {
  const summary = (o.contextSummary || "").trim().slice(0, CAP.contextSummary);
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
  if (paths.length) parts.push("", "Recently changed / focus paths (labels only):", paths.join("\n"));
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

function skippedResult(
  intensity: SwarmIntensity,
  phase: string,
  opts: HandoffOpts,
  agentRun: SwarmHandoffServerResult["agentRun"]
): SwarmHandoffServerResult {
  const snap = readNebulaSwarmState(opts.workspaceRoot);
  return {
    schemaVersion: "1.0.0",
    intensity,
    phase,
    runId: opts.runId,
    projectName: opts.projectName,
    planner: stubSkipped("planner", "removed_lean_swarm"),
    researcher: stubSkipped("researcher", "removed_lean_swarm"),
    tester: stubSkipped("tester", "removed_lean_swarm"),
    notesForGrok: NO_SWARM_AGENTS_NOTE,
    timestamp: new Date().toISOString(),
    agentsSkipped: true,
    agentRun,
    swarmStateSnapshot: { schemaVersion: 2, qualityLastRunAt: snap.qualityLastRunAt },
  };
}

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
    manualRunAndTest: Boolean(opts.manualRunAndTest),
  });

  const agentRun = {
    reasons: plan.reasons,
    runQuality: plan.runQuality,
  };

  if (!anyAgentRuns(plan)) {
    return skippedResult(intensity, phase, opts, agentRun);
  }

  if (!opts.manualRunAndTest || !opts.qualityLane?.apiKey) {
    return skippedResult(intensity, phase, opts, {
      ...agentRun,
      reasons: [...plan.reasons, "quality_lane_missing"],
    });
  }

  const gitPaths = getRecentlyChangedGitPaths(opts.workspaceRoot, 24);
  const mergedPaths = mergeFocusPaths(gitPaths, opts.focusPaths);
  const optsWithPaths: HandoffOpts = { ...opts, focusPaths: mergedPaths };

  const swarmRoot = path.join(opts.repoRoot, "skills", "nebula-swarm");
  const orchestrator = readTextFile(path.join(swarmRoot, "ORCHESTRATOR.md"), CAP.orchestratorRead);
  const qualityRole = readTextFile(path.join(swarmRoot, "agents", "QUALITY.md"), CAP.qualityRoleRead);
  const rulesPath = path.join(opts.workspaceRoot, "project-execution-rules.md");
  const executionRulesExcerpt = readTextFile(rulesPath, CAP.rulesRead);

  const jsonContract = [
    "Output: a single JSON object only (no markdown fences, no text outside JSON).",
    'Keys: "markdown" (string), "bullets" (array of strings), "warnings" (array of strings).',
    "Omit bullets/warnings if empty. No preamble.",
  ].join(" ");

  const orchHint =
    orchestrator.length > 0
      ? `\n\nOrchestrator (excerpt):\n${orchestrator.slice(0, CAP.orchestratorInject)}`
      : "";

  const systemParts = [
    "Nebula Swarm QUALITY (read-only). Reply JSON only per contract.",
    jsonContract,
    qualityRole.slice(0, CAP.qualityRoleInject),
    orchHint,
    "",
    "Execution rules excerpt (reference):",
    executionRulesExcerpt.slice(0, CAP.rulesInject) || "(missing project-execution-rules.md)",
  ];

  const userBlock = assembleUserBlock(
    optsWithPaths,
    phase,
    intensity,
    "Manual Run and Test: review + test suggestions **only** for paths/snippets above (recently changed files). If the path list is empty, state that scope is unknown and avoid inventing files.",
    mergedPaths
  );

  const qr = await grokChatCompletionJson(
    "Swarm quality",
    opts.qualityLane.apiKey,
    opts.qualityLane.model,
    systemParts.join("\n"),
    userBlock,
    true
  );

  const quality = { ...safeJsonObject(qr.text), _agent: "quality", _durationMs: qr.ms, _model: opts.qualityLane.model };

  const now = new Date().toISOString();
  writeNebulaSwarmState(opts.workspaceRoot, {
    schemaVersion: 2,
    qualityLastRunAt: now,
  });

  const notesForGrok =
    "Quality agent (manual Run and Test) completed on recently changed / client-scoped files. Use `quality` in the handoff packet internally; keep the user reply natural and concise.";

  return {
    schemaVersion: "1.0.0",
    intensity,
    phase,
    runId: opts.runId,
    projectName: opts.projectName,
    planner: stubSkipped("planner", "removed_lean_swarm"),
    researcher: stubSkipped("researcher", "removed_lean_swarm"),
    tester: stubSkipped("tester", "use_quality_field"),
    quality,
    notesForGrok,
    timestamp: now,
    agentRun,
    swarmStateSnapshot: { schemaVersion: 2, qualityLastRunAt: now },
  };
}
