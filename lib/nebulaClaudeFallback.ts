/**
 * TEMPORARY (testing): when Grok hits monthly quota / 402, fall back to Claude 3.5 Sonnet
 * for a single `/api/grok/chat` request. Remove this module and server wiring when no longer needed.
 */

export const CLAUDE_ENV_VAR = "CLAUDE_API_KEY";
export const CLAUDE_FALLBACK_MODEL = "claude-3-5-sonnet-20241022";

/** Shown once in chat UI when fallback is used (this request only). */
export const CLAUDE_FALLBACK_USER_MESSAGE =
  "Grok reached monthly limit — falling back to Claude 3.5 Sonnet for this response.";

const MIN_KEY_LEN = 20;
const ANTHROPIC_VERSION = "2023-06-01";

export type OpenAiStyleChatMessage = { role: string; content?: string };

export type ClaudeFallbackChatPayload = {
  choices: { message: { content: string; planningPhase?: string } }[];
  claudeFallbackNotice: string;
};

/** True only for Grok quota / billing limit — not timeouts, 401, 500, etc. */
export function isGrokQuotaLimitError(status: number, errorText: string): boolean {
  if (status === 402) return true;
  const s = errorText.toLowerCase();
  return /monthly limit|quota exceeded|\bquota\b|payment required/i.test(s);
}

export function resolveClaudeApiKey(): string | null {
  const key = process.env[CLAUDE_ENV_VAR]?.trim() ?? "";
  return key.length >= MIN_KEY_LEN ? key : null;
}

function toAnthropicPayload(messages: OpenAiStyleChatMessage[]): {
  system?: string;
  messages: { role: "user" | "assistant"; content: string }[];
} {
  const systemParts: string[] = [];
  const raw: { role: "user" | "assistant"; content: string }[] = [];

  for (const m of messages) {
    const content = typeof m.content === "string" ? m.content.trim() : "";
    if (!content) continue;
    if (m.role === "system") {
      systemParts.push(content);
      continue;
    }
    const role: "user" | "assistant" =
      m.role === "assistant" || m.role === "model" ? "assistant" : "user";
    raw.push({ role, content });
  }

  const merged: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of raw) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) {
      last.content += `\n\n${m.content}`;
    } else {
      merged.push({ ...m });
    }
  }

  if (merged.length === 0) {
    merged.push({ role: "user", content: "(No prior messages)" });
  }
  if (merged[0].role !== "user") {
    merged.unshift({
      role: "user",
      content: "[Prior assistant context — continue from the latest user request.]",
    });
  }

  return {
    system: systemParts.length > 0 ? systemParts.join("\n\n") : undefined,
    messages: merged,
  };
}

export async function callClaudeChatCompletion(
  messages: OpenAiStyleChatMessage[],
  apiKey: string
): Promise<{ ok: true; content: string } | { ok: false; status: number; error: string }> {
  const { system, messages: anthropicMessages } = toAnthropicPayload(messages);

  const body: Record<string, unknown> = {
    model: CLAUDE_FALLBACK_MODEL,
    max_tokens: 8192,
    messages: anthropicMessages,
  };
  if (system) body.system = system;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    if (!res.ok) {
      let errMsg = text.slice(0, 400);
      try {
        const parsed = JSON.parse(text) as { error?: { message?: string } };
        errMsg = parsed.error?.message ?? errMsg;
      } catch {
        /* keep slice */
      }
      return { ok: false, status: res.status, error: errMsg };
    }

    let parsed: { content?: { type?: string; text?: string }[] };
    try {
      parsed = JSON.parse(text) as { content?: { type?: string; text?: string }[] };
    } catch {
      return { ok: false, status: 502, error: "Claude returned invalid JSON" };
    }

    const content =
      parsed.content
        ?.filter((b) => b.type === "text" && typeof b.text === "string")
        .map((b) => b.text as string)
        .join("\n")
        .trim() ?? "";

    if (!content) {
      return { ok: false, status: 502, error: "Claude returned an empty message" };
    }

    return { ok: true, content };
  } catch (e) {
    return {
      ok: false,
      status: 500,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export function buildClaudeFallbackChatPayload(content: string): ClaudeFallbackChatPayload {
  return {
    choices: [{ message: { content } }],
    claudeFallbackNotice: CLAUDE_FALLBACK_USER_MESSAGE,
  };
}

/**
 * Attempt Claude fallback for one chat turn. Returns payload on success, null if unavailable or failed.
 */
export async function tryClaudeQuotaFallback(
  messages: OpenAiStyleChatMessage[]
): Promise<ClaudeFallbackChatPayload | null> {
  const claudeKey = resolveClaudeApiKey();
  if (!claudeKey) {
    console.warn("[claude/fallback] Skipped: CLAUDE_API_KEY missing or too short");
    return null;
  }

  console.warn(
    "[grok/chat] TEMPORARY: Grok quota/limit — using Claude 3.5 Sonnet for this request only (see lib/nebulaClaudeFallback.ts)"
  );

  const result = await callClaudeChatCompletion(messages, claudeKey);
  if (result.ok === false) {
    console.error(`[claude/fallback] Claude API error (${result.status}):`, result.error);
    return null;
  }

  return buildClaudeFallbackChatPayload(result.content);
}
