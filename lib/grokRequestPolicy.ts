/**
 * Thin xAI request policy per engine stroke.
 * Tools assist strokes; they do not replace Gate R or the spine.
 * Authority: nebula-project/recovery-orchestration.md §11
 */

export type GrokStroke = "chat" | "research" | "plan" | "go" | "ui_gen";

export type GrokReasoningEffort = "low" | "medium" | "high";

export type GrokBuiltInTool = { type: "web_search" } | { type: "x_search" };

export type GrokStrokePolicy = {
  stroke: GrokStroke;
  tools: GrokBuiltInTool[];
  reasoning_effort: GrokReasoningEffort | null;
};

/** Research-only search tools. Chat / Go / UI Gen stay empty. */
export const RESEARCH_SEARCH_TOOLS: GrokBuiltInTool[] = [
  { type: "web_search" },
  { type: "x_search" },
];

/**
 * xAI 400s `reasoning_effort` on coding/build models (built-in reasoning, not configurable).
 * Chat Completions error: "Model grok-code-fast-1 does not support parameter reasoningEffort."
 */
export function modelSupportsReasoningEffort(model: string): boolean {
  const m = String(model || "").trim().toLowerCase();
  if (!m) return true;
  if (/grok-code|grok-build/.test(m)) return false;
  return true;
}

export function grokStrokePolicy(stroke: GrokStroke): GrokStrokePolicy {
  switch (stroke) {
    case "research":
      return { stroke, tools: RESEARCH_SEARCH_TOOLS, reasoning_effort: "high" };
    case "chat":
      return { stroke, tools: [], reasoning_effort: "medium" };
    case "plan":
      return { stroke, tools: [], reasoning_effort: "high" };
    case "go":
      // Coding models (grok-code-fast-1 / grok-build) 400 on reasoning_effort — never send it on Go.
      return { stroke, tools: [], reasoning_effort: null };
    case "ui_gen":
      return { stroke, tools: [], reasoning_effort: null };
  }
}

function effectiveReasoningEffort(
  stroke: GrokStroke,
  model?: string,
): GrokReasoningEffort | null {
  const p = grokStrokePolicy(stroke);
  if (!p.reasoning_effort) return null;
  if (stroke === "go") return null;
  const id = String(model || "").trim();
  if (id && !modelSupportsReasoningEffort(id)) return null;
  return p.reasoning_effort;
}

/** Chat Completions extras — never attach web/x search. Omit effort on models that 400. */
export function grokChatCompletionsExtras(
  stroke: GrokStroke,
  model?: string,
): Record<string, unknown> {
  const effort = effectiveReasoningEffort(stroke, model);
  if (!effort) return {};
  return { reasoning_effort: effort };
}

/** Responses API extras. Search tools only on research. */
export function grokResponsesExtras(stroke: GrokStroke, model?: string): Record<string, unknown> {
  const p = grokStrokePolicy(stroke);
  const extra: Record<string, unknown> = {};
  const effort = effectiveReasoningEffort(stroke, model);
  if (effort) extra.reasoning = { effort };
  extra.tools = p.tools;
  return extra;
}

export function strokeHasSearchTools(stroke: GrokStroke): boolean {
  return grokStrokePolicy(stroke).tools.some(
    (t) => t.type === "web_search" || t.type === "x_search",
  );
}
