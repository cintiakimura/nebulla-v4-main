/**
 * Server-side multi-provider chat completion.
 * Normalizes OpenAI-style messages → provider APIs → OpenAI-style response + usage.
 * Graceful fallback: preferred provider → main env key provider → Claude quota key.
 */

import {
  callClaudeChatCompletion,
  CLAUDE_FALLBACK_MODEL,
  resolveClaudeApiKey,
  type OpenAiStyleChatMessage,
} from "./nebulaClaudeFallback";
import {
  detectMainAiProvider,
  resolveMainAiChatModel,
  type MainAiProvider,
} from "./nebulaMainAiProvider";
import { readMainAiApiKeyFromEnv } from "./nebulaMainGrokResolver";

const MIN_KEY_LEN = 20;

export type AiChatUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type AiChatCompletionOk = {
  ok: true;
  content: string;
  provider: MainAiProvider;
  model: string;
  usage: AiChatUsage;
  /** Set when a different provider than requested was used. */
  fallbackNotice?: string;
};

export type AiChatCompletionErr = {
  ok: false;
  status: number;
  error: string;
  provider: MainAiProvider;
  model?: string;
};

export type AiChatCompletionResult = AiChatCompletionOk | AiChatCompletionErr;

function sanitizeEnvSecret(raw: string): string {
  let s = raw.trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s.replace(/[\r\n]+/g, "");
}

function emptyUsage(): AiChatUsage {
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
}

function parseOpenAiUsage(raw: unknown): AiChatUsage {
  if (!raw || typeof raw !== "object") return emptyUsage();
  const u = raw as Record<string, unknown>;
  const prompt = typeof u.prompt_tokens === "number" ? u.prompt_tokens : 0;
  const completion = typeof u.completion_tokens === "number" ? u.completion_tokens : 0;
  const total =
    typeof u.total_tokens === "number" ? u.total_tokens : prompt + completion;
  return { promptTokens: prompt, completionTokens: completion, totalTokens: total };
}

/** Resolve API key for a preferred provider; fall back to MAIN_API_KEY_GROK. */
export function resolveApiKeyForProvider(preferred: MainAiProvider): {
  apiKey: string;
  provider: MainAiProvider;
  usedFallback: boolean;
} | null {
  const main = readMainAiApiKeyFromEnv();
  const mainProvider = main.length >= MIN_KEY_LEN ? detectMainAiProvider(main) : "unknown";

  const companions: Partial<Record<MainAiProvider, string>> = {
    anthropic:
      sanitizeEnvSecret(process.env.CLAUDE_API_KEY ?? "") ||
      sanitizeEnvSecret(process.env.ANTHROPIC_API_KEY ?? ""),
    openai: sanitizeEnvSecret(process.env.OPENAI_API_KEY ?? ""),
    xai:
      mainProvider === "xai" || mainProvider === "unknown"
        ? main
        : sanitizeEnvSecret(process.env.XAI_API_KEY ?? ""),
  };

  const preferredKey = companions[preferred] || "";
  if (preferredKey.length >= MIN_KEY_LEN) {
    const detected = detectMainAiProvider(preferredKey);
    return {
      apiKey: preferredKey,
      provider: detected === "unknown" ? preferred : detected,
      usedFallback: false,
    };
  }

  if (main.length >= MIN_KEY_LEN) {
    return {
      apiKey: main,
      provider: mainProvider === "unknown" ? "xai" : mainProvider,
      usedFallback: preferred !== "unknown" && preferred !== mainProvider,
    };
  }

  // Last resort: Claude companion key alone
  const claudeOnly = resolveClaudeApiKey();
  if (claudeOnly) {
    return { apiKey: claudeOnly, provider: "anthropic", usedFallback: preferred !== "anthropic" };
  }

  return null;
}

export function resolveUpstreamChatModel(
  provider: MainAiProvider,
  clientChatModel?: string,
): string {
  const hint = (clientChatModel || "").trim().toLowerCase();
  const base = resolveMainAiChatModel(provider);

  if (provider === "xai") {
    if (hint === "grok-3" || hint === "grok3") {
      return process.env.GROK_CHAT_MODEL_GROK3?.trim() || "grok-3";
    }
    if (hint.includes("code") || hint === "grok-code-fast-1") {
      return process.env.GROK_CODE_MODEL?.trim() || "grok-code-fast-1";
    }
    if (hint === "grok-4" || hint === "grok-4.1" || hint === "grok") {
      return process.env.GROK_CHAT_MODEL_GROK41?.trim() || "grok-4";
    }
    return base;
  }

  if (provider === "anthropic") {
    if (hint.includes("claude") || hint === "claude-3-5-sonnet") {
      return process.env.ANTHROPIC_CHAT_MODEL?.trim() || CLAUDE_FALLBACK_MODEL;
    }
    return base;
  }

  if (provider === "openai") {
    if (hint === "gpt-4o-mini") {
      return process.env.OPENAI_CHAT_MODEL_MINI?.trim() || "gpt-4o-mini";
    }
    if (hint === "gpt-4o" || hint === "openai") {
      return process.env.OPENAI_CHAT_MODEL?.trim() || "gpt-4o";
    }
    return base;
  }

  return base;
}

async function callXaiChatCompletion(
  messages: OpenAiStyleChatMessage[],
  apiKey: string,
  model: string,
): Promise<AiChatCompletionResult> {
  try {
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, stream: false }),
    });
    const text = await response.text();
    if (!response.ok) {
      let errMsg = text.slice(0, 400);
      try {
        const parsed = JSON.parse(text) as { error?: string | { message?: string }; message?: string };
        if (typeof parsed.error === "string") errMsg = parsed.error;
        else if (parsed.error && typeof parsed.error === "object" && parsed.error.message) {
          errMsg = parsed.error.message;
        } else if (typeof parsed.message === "string") errMsg = parsed.message;
      } catch {
        /* keep slice */
      }
      return { ok: false, status: response.status, error: errMsg, provider: "xai", model };
    }
    let parsed: {
      choices?: { message?: { content?: string } }[];
      usage?: unknown;
    };
    try {
      parsed = JSON.parse(text) as typeof parsed;
    } catch {
      return { ok: false, status: 502, error: "xAI returned invalid JSON", provider: "xai", model };
    }
    const content = parsed.choices?.[0]?.message?.content?.trim() ?? "";
    if (!content) {
      return { ok: false, status: 502, error: "xAI returned an empty message", provider: "xai", model };
    }
    return {
      ok: true,
      content,
      provider: "xai",
      model,
      usage: parseOpenAiUsage(parsed.usage),
    };
  } catch (e) {
    return {
      ok: false,
      status: 500,
      error: e instanceof Error ? e.message : String(e),
      provider: "xai",
      model,
    };
  }
}

async function callOpenAiChatCompletion(
  messages: OpenAiStyleChatMessage[],
  apiKey: string,
  model: string,
): Promise<AiChatCompletionResult> {
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, stream: false }),
    });
    const text = await response.text();
    if (!response.ok) {
      let errMsg = text.slice(0, 400);
      try {
        const parsed = JSON.parse(text) as { error?: { message?: string } };
        errMsg = parsed.error?.message ?? errMsg;
      } catch {
        /* keep */
      }
      return { ok: false, status: response.status, error: errMsg, provider: "openai", model };
    }
    let parsed: {
      choices?: { message?: { content?: string } }[];
      usage?: unknown;
    };
    try {
      parsed = JSON.parse(text) as typeof parsed;
    } catch {
      return {
        ok: false,
        status: 502,
        error: "OpenAI returned invalid JSON",
        provider: "openai",
        model,
      };
    }
    const content = parsed.choices?.[0]?.message?.content?.trim() ?? "";
    if (!content) {
      return {
        ok: false,
        status: 502,
        error: "OpenAI returned an empty message",
        provider: "openai",
        model,
      };
    }
    return {
      ok: true,
      content,
      provider: "openai",
      model,
      usage: parseOpenAiUsage(parsed.usage),
    };
  } catch (e) {
    return {
      ok: false,
      status: 500,
      error: e instanceof Error ? e.message : String(e),
      provider: "openai",
      model,
    };
  }
}

/**
 * Run one non-streaming chat completion against the preferred provider.
 * Falls back to main-key provider, then Claude companion key, without throwing.
 */
export async function runAiChatCompletion(options: {
  messages: OpenAiStyleChatMessage[];
  /** Preferred provider from the client ModelSelector. */
  preferredProvider?: MainAiProvider | string | null;
  /** Client catalog hint (`grok-4.1`, `claude-3-5-sonnet`, `gpt-4o`, …). */
  clientChatModel?: string | null;
  /** BYOK from onboarding / Secrets (e.g. X-Nebula-Xai-Api-Key). */
  apiKeyOverride?: string | null;
}): Promise<AiChatCompletionResult> {
  const preferredRaw = String(options.preferredProvider || "").trim().toLowerCase();
  const preferred: MainAiProvider =
    preferredRaw === "anthropic" || preferredRaw === "openai" || preferredRaw === "xai"
      ? preferredRaw
      : "xai";

  const override = String(options.apiKeyOverride || "").trim();
  const resolved =
    override.length >= 20
      ? {
          apiKey: override,
          provider: preferred,
          usedFallback: false,
        }
      : resolveApiKeyForProvider(preferred);
  if (!resolved) {
    return {
      ok: false,
      status: 401,
      error: "No AI API key available. Add your Grok key in Onboarding, or set MAIN_API_KEY_GROK on the server.",
      provider: preferred,
    };
  }

  const model = resolveUpstreamChatModel(resolved.provider, options.clientChatModel || undefined);
  let result: AiChatCompletionResult;

  if (resolved.provider === "anthropic") {
    const claude = await callClaudeChatCompletion(options.messages, resolved.apiKey, model);
    result =
      claude.ok === true
        ? {
            ok: true,
            content: claude.content,
            provider: "anthropic",
            model,
            usage: emptyUsage(),
          }
        : {
            ok: false,
            status: claude.status,
            error: claude.error,
            provider: "anthropic",
            model,
          };
  } else if (resolved.provider === "openai") {
    result = await callOpenAiChatCompletion(options.messages, resolved.apiKey, model);
  } else {
    result = await callXaiChatCompletion(options.messages, resolved.apiKey, model);
  }

  if (result.ok === true && resolved.usedFallback) {
    result = {
      ...result,
      fallbackNotice: `Requested ${preferred} but used ${resolved.provider} (matching key not found — add the provider key on the server).`,
    };
  }

  // Soft fallback: if preferred failed and we haven't tried Claude yet
  if (result.ok === false && resolved.provider !== "anthropic") {
    const claudeKey = resolveClaudeApiKey();
    if (claudeKey) {
      const fbModel = resolveUpstreamChatModel("anthropic", "claude-3-5-sonnet");
      const claude = await callClaudeChatCompletion(options.messages, claudeKey, fbModel);
      if (claude.ok === true) {
        return {
          ok: true,
          content: claude.content,
          provider: "anthropic",
          model: fbModel,
          usage: emptyUsage(),
          fallbackNotice: `${resolved.provider} failed — fell back to Claude for this response.`,
        };
      }
    }
  }

  return result;
}

/** OpenAI-compatible JSON body for `/api/grok/chat` responses. */
export function toOpenAiStyleChatResponse(result: AiChatCompletionOk): {
  choices: { message: { content: string } }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  mainAiProvider: MainAiProvider;
  mainAiModel: string;
  providerFallbackNotice?: string;
} {
  return {
    choices: [{ message: { content: result.content } }],
    usage: {
      prompt_tokens: result.usage.promptTokens,
      completion_tokens: result.usage.completionTokens,
      total_tokens: result.usage.totalTokens,
    },
    mainAiProvider: result.provider,
    mainAiModel: result.model,
    ...(result.fallbackNotice ? { providerFallbackNotice: result.fallbackNotice } : {}),
  };
}
