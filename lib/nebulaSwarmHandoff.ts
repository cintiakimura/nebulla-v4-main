/**
 * Nebula Swarm — server-side handoff builder.
 *
 * **API keys (cost split — see repo `.env` loaded in `server.ts` via `dotenv.config`):**
 * - **`GROK_API_KEY`** + **Grok 4.1** — main Nebula Partner chat; also **Reviewer** when intensity is
 *   `full_quality` (one extra call before the merged packet goes to Grok in the client).
 * - **`GROK_SWARM_API_KEY`** + **Grok 3-class model** (`GROK_SWARM_MODEL`) — Planner, Researcher, Tester
 *   (subset depends on **swarm intensity**).
 *
 * Project Isolator: reads only `skills/nebula-swarm/**` and a short excerpt of the active workspace
 * `project-execution-rules.md`. Does not write project code, Master Plan, or execution rules.
 */

import fs from "fs";
import path from "path";

const SWARM_PHASES = new Set([
  "pre_phase_0",
  "phase_0",
  "phase_1",
  "phase_2",
  "phase_3",
  "phase_4",
  "phase_5",
]);

/** Client + server: how many support agents run before handoff merges. */
export type SwarmIntensity = "light" | "balanced" | "full_quality";

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
  if (start < 0 || end <= start) return { markdown: t.slice(0, 12000) };
  try {
    const parsed = JSON.parse(t.slice(start, end + 1)) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* fall through */
  }
  return { markdown: t.slice(0, 12000) };
}

async function grokChatCompletionJson(
  label: string,
  apiKey: string,
  model: string,
  system: string,
  user: string
): Promise<{ text: string; ms: number }> {
  const t0 = Date.now();
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      stream: false,
    }),
  });
  const ms = Date.now() - t0;
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`${label} (${model}) failed (${res.status}): ${errText.slice(0, 500)}`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content?.trim() ?? "";
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
};

function skippedAgent(agent: string, intensity: SwarmIntensity): Record<string, unknown> {
  return {
    markdown: "",
    _skipped: true,
    _agent: agent,
    warnings: [`Not run (swarm intensity: ${intensity})`],
  };
}

/**
 * Runs support agents per **intensity**, then optionally **Reviewer** (Grok 4.1) on the draft packet.
 */
export async function buildSwarmHandoffParallel(
  agentKeys: SwarmHandoffAgentKeys,
  opts: {
    repoRoot: string;
    workspaceRoot: string;
    userMessage: string;
    phase: string;
    projectName: string;
    runId: string;
    intensity: SwarmIntensity;
    /** Grok 4.1 lane — required when `intensity === "full_quality"`. */
    reviewerLane?: { apiKey: string; model: string };
  }
): Promise<SwarmHandoffServerResult> {
  const swarmRoot = path.join(opts.repoRoot, "skills", "nebula-swarm");
  const orchestrator = readTextFile(path.join(swarmRoot, "ORCHESTRATOR.md"), 10_000);
  const plannerRole = readTextFile(path.join(swarmRoot, "agents", "PLANNER.md"), 6_000);
  const researcherRole = readTextFile(path.join(swarmRoot, "agents", "RESEARCHER.md"), 5_000);
  const testerRole = readTextFile(path.join(swarmRoot, "agents", "TESTER.md"), 5_000);
  const reviewerRole = readTextFile(path.join(swarmRoot, "agents", "REVIEWER.md"), 5_000);

  const rulesPath = path.join(opts.workspaceRoot, "project-execution-rules.md");
  const executionRulesExcerpt = readTextFile(rulesPath, 6_000);

  const phase = SWARM_PHASES.has(opts.phase) ? opts.phase : "pre_phase_0";
  const { intensity } = opts;

  const userBlock = [
    `Swarm phase: ${phase}`,
    `Project name: ${opts.projectName}`,
    `Run id: ${opts.runId}`,
    `Swarm intensity: ${intensity}`,
    "",
    "User message:",
    opts.userMessage.slice(0, 8_000),
  ].join("\n");

  const jsonContract =
    'Reply with ONLY a single JSON object (no markdown fences) shaped as: {"markdown":"...","bullets":["optional"],"warnings":["optional"]}. Keep "markdown" tight: no preamble, no repetition across fields.';

  const orchHint =
    orchestrator.length > 0
      ? `\n\nOrchestrator (excerpt; reference only):\n${orchestrator.slice(0, 3_500)}`
      : "";

  const commonFooter = [
    "",
    "Project execution rules excerpt (law — reference only, do not paste verbatim into user chat):",
    executionRulesExcerpt || "(no project-execution-rules.md in workspace yet)",
  ].join("\n");

  type SupportKey = "planner" | "researcher" | "tester";
  const runOrder: SupportKey[] =
    intensity === "light" ? ["planner", "researcher"] : ["planner", "researcher", "tester"];

  const systemFor = (key: SupportKey): string => {
    const roleSlice =
      key === "planner"
        ? plannerRole.slice(0, 4_500)
        : key === "researcher"
          ? researcherRole.slice(0, 4_000)
          : testerRole.slice(0, 4_000);
    return [
      `You are the Nebula Swarm ${key.toUpperCase()} support agent (read-only).`,
      jsonContract,
      "Be concise: high-signal bullets only; no filler; no user-facing prose.",
      roleSlice,
      orchHint,
      commonFooter,
    ].join("\n");
  };

  const settled = await Promise.allSettled(
    runOrder.map((key) =>
      grokChatCompletionJson(
        `Swarm ${key}`,
        agentKeys[key],
        agentKeys.swarmModel,
        systemFor(key),
        userBlock
      )
    )
  );

  const pick = (i: number, key: SupportKey) => {
    const r = settled[i];
    if (r.status === "fulfilled") {
      return { ...safeJsonObject(r.value.text), _agent: key, _durationMs: r.value.ms };
    }
    return {
      markdown: "",
      warnings: [r.reason instanceof Error ? r.reason.message : String(r.reason)],
      _agent: key,
      error: true,
    };
  };

  let planner: Record<string, unknown>;
  let researcher: Record<string, unknown>;
  let tester: Record<string, unknown>;

  if (intensity === "light") {
    planner = pick(0, "planner");
    researcher = pick(1, "researcher");
    tester = skippedAgent("tester", intensity);
  } else {
    planner = pick(0, "planner");
    researcher = pick(1, "researcher");
    tester = pick(2, "tester");
  }

  let reviewer: Record<string, unknown> | undefined;
  let notesForGrok: string;

  if (intensity === "full_quality" && opts.reviewerLane?.apiKey) {
    const draftForReviewer = JSON.stringify(
      {
        phase,
        projectName: opts.projectName,
        runId: opts.runId,
        planner,
        researcher,
        tester,
      },
      null,
      0
    ).slice(0, 24_000);

    const reviewerSystem = [
      "You are the Nebula Swarm REVIEWER (read-only). Model: Grok 4.1.",
      "Review the **draft handoff** (Planner + Researcher + Tester JSON below).",
      "Output: same JSON contract as other swarm agents. In `markdown`: severity-tagged findings (P0/P1/P2), gaps, and concrete course-corrections for the **main** Grok 4.1 agent — not for the end user.",
      "No code patches, no edits to execution rules, no pasted secrets.",
      jsonContract,
      reviewerRole.slice(0, 4_500),
      orchHint,
      commonFooter,
    ].join("\n");

    const reviewerUser = [
      "Draft handoff JSON (support agents only):",
      draftForReviewer,
      "",
      "Original user message (for intent alignment):",
      opts.userMessage.slice(0, 4_000),
    ].join("\n");

    try {
      const rev = await grokChatCompletionJson(
        "Swarm reviewer",
        opts.reviewerLane.apiKey,
        opts.reviewerLane.model,
        reviewerSystem,
        reviewerUser
      );
      reviewer = { ...safeJsonObject(rev.text), _agent: "reviewer", _durationMs: rev.ms, _model: opts.reviewerLane.model };
    } catch (e) {
      reviewer = {
        markdown: "",
        error: true,
        _agent: "reviewer",
        warnings: [e instanceof Error ? e.message : String(e)],
      };
    }

    notesForGrok =
      "Merged Nebula Swarm handoff: Planner + Researcher + Tester (Grok 3 / GROK_SWARM_API_KEY, parallel), then Reviewer (Grok 4.1, sequential on draft packet). Main chat Grok 4.1 must **incorporate reviewer feedback** (P0/P1) in reasoning and user reply where applicable. Internal guidance only; obey project-execution-rules.md; keep user replies natural — do not recite swarm mechanics unless asked.";
  } else if (intensity === "balanced") {
    notesForGrok =
      "Merged Nebula Swarm handoff: Planner + Researcher + Tester (Grok 3 / GROK_SWARM_API_KEY; parallel). No Reviewer pass (Balanced intensity). Main user reply uses Grok 4.1 / GROK_API_KEY. Internal guidance only; obey project-execution-rules.md.";
  } else {
    notesForGrok =
      "Merged Nebula Swarm handoff: Planner + Researcher only (Grok 3 / GROK_SWARM_API_KEY; parallel). Tester skipped (Light intensity). Main user reply uses Grok 4.1. Internal guidance only; obey project-execution-rules.md.";
  }

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
  };
}
