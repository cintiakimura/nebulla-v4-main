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

export function grokStrokePolicy(stroke: GrokStroke): GrokStrokePolicy {
  switch (stroke) {
    case "research":
      return { stroke, tools: RESEARCH_SEARCH_TOOLS, reasoning_effort: "high" };
    case "chat":
      return { stroke, tools: [], reasoning_effort: "medium" };
    case "plan":
      return { stroke, tools: [], reasoning_effort: "high" };
    case "go":
      return { stroke, tools: [], reasoning_effort: "high" };
    case "ui_gen":
      return { stroke, tools: [], reasoning_effort: null };
  }
}

/** Chat Completions extras — never attach web/x search. */
export function grokChatCompletionsExtras(stroke: GrokStroke): Record<string, unknown> {
  const p = grokStrokePolicy(stroke);
  if (!p.reasoning_effort) return {};
  return { reasoning_effort: p.reasoning_effort };
}

/** Responses API extras. Search tools only on research. */
export function grokResponsesExtras(stroke: GrokStroke): Record<string, unknown> {
  const p = grokStrokePolicy(stroke);
  const extra: Record<string, unknown> = {};
  if (p.reasoning_effort) extra.reasoning = { effort: p.reasoning_effort };
  extra.tools = p.tools;
  return extra;
}

export function strokeHasSearchTools(stroke: GrokStroke): boolean {
  return grokStrokePolicy(stroke).tools.some(
    (t) => t.type === "web_search" || t.type === "x_search",
  );
}
