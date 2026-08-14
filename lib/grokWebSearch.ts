/**
 * xAI Responses API + web_search tool (Live Search is deprecated / 410).
 * Phase 3 research stroke only — do not use on Go or UI Gen.
 */

import { grokResponsesExtras } from "./grokRequestPolicy";

export type GrokWebSearchResult =
  | { ok: true; text: string; model: string }
  | { ok: false; error: string; status: number };

function extractResponsesText(data: Record<string, unknown>): string {
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }
  const out = Array.isArray(data.output) ? data.output : [];
  const parts: string[] = [];
  for (const item of out) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const content = rec.content;
    if (!Array.isArray(content)) continue;
    for (const c of content) {
      if (!c || typeof c !== "object") continue;
      const block = c as Record<string, unknown>;
      if (typeof block.text === "string") parts.push(block.text);
    }
  }
  return parts.join("\n").trim();
}

/** One Web Search research completion. Sequential server-side tools; no client tool loop. */
export async function callGrokWebSearch(opts: {
  apiKey: string;
  model?: string;
  system: string;
  user: string;
  timeoutMs?: number;
}): Promise<GrokWebSearchResult> {
  const model = opts.model?.trim() || process.env.GROK_CHAT_MODEL_GROK41?.trim() || "grok-4";
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch("https://api.x.ai/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
        ...grokResponsesExtras("research"),
      }),
      signal: controller.signal,
    });
    const raw = await response.text();
    if (!response.ok) {
      let err = raw.slice(0, 500);
      try {
        const parsed = JSON.parse(raw) as { error?: { message?: string } | string; message?: string };
        if (typeof parsed.error === "string") err = parsed.error;
        else if (parsed.error && typeof parsed.error === "object" && parsed.error.message) {
          err = parsed.error.message;
        } else if (typeof parsed.message === "string") err = parsed.message;
      } catch {
        /* keep slice */
      }
      return { ok: false, error: err, status: response.status };
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return { ok: false, error: "xAI research returned invalid JSON", status: 502 };
    }
    const text = extractResponsesText(parsed);
    if (!text) {
      return { ok: false, error: "xAI Web Search returned an empty research draft", status: 502 };
    }
    return { ok: true, text, model };
  } catch (e) {
    const aborted = e instanceof Error && /abort/i.test(e.message);
    return {
      ok: false,
      error: aborted
        ? "Web Search research timed out. Try Go again — Foundation will not start without research."
        : e instanceof Error
          ? e.message
          : String(e),
      status: aborted ? 504 : 500,
    };
  } finally {
    clearTimeout(timer);
  }
}
