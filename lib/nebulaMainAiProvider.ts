import { CLAUDE_FALLBACK_MODEL } from "./nebulaClaudeFallback";

export type MainAiProvider = "xai" | "anthropic" | "openai" | "unknown";

/** Infer upstream API from key shape (MAIN_API_KEY_GROK / legacy MAIN_AI_API_KEY is provider-agnostic). */
export function detectMainAiProvider(apiKey: string): MainAiProvider {
  const k = apiKey.trim();
  if (k.startsWith("sk-ant-")) return "anthropic";
  if (k.startsWith("xai-")) return "xai";
  if (k.startsWith("sk-proj-") || k.startsWith("sk-")) return "openai";
  return "unknown";
}

export function mainAiProviderLabel(provider: MainAiProvider): string {
  switch (provider) {
    case "anthropic":
      return "Claude (Anthropic)";
    case "xai":
      return "Grok (xAI)";
    case "openai":
      return "OpenAI";
    default:
      return "AI";
  }
}

/** Chat model id for the detected provider (override with MAIN_AI_CHAT_MODEL). */
export function resolveMainAiChatModel(provider: MainAiProvider): string {
  const override = process.env.MAIN_AI_CHAT_MODEL?.trim();
  if (override) return override;
  switch (provider) {
    case "anthropic":
      return process.env.ANTHROPIC_CHAT_MODEL?.trim() || CLAUDE_FALLBACK_MODEL;
    case "openai":
      return process.env.OPENAI_CHAT_MODEL?.trim() || "gpt-4o";
    case "xai":
    default:
      return process.env.GROK_CHAT_MODEL_GROK41?.trim() || "grok-4";
  }
}

export const FREE_TIER_MONTHLY_LIMIT_MESSAGE =
  "You've reached your monthly AI usage limit on the Free plan. Upgrade to Pro for unlimited access.";
