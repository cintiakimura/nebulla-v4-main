/** Same guidance as server `MAIN_AI_KEY_SETUP_HINT` (kept in client bundle). */
export const MAIN_AI_CHAT_SETUP_HINT =
  'Main AI chat failed: the server does not have a valid MAIN_AI_API_KEY in its environment (at least 20 characters after trimming). Ask your operator to set it in the project .env, restart the dev server or redeploy, then reload. Default model is grok-4 when using an xAI key.';

/** @deprecated Use {@link MAIN_AI_CHAT_SETUP_HINT}. */
export const GROK_CHAT_SETUP_HINT = MAIN_AI_CHAT_SETUP_HINT;

export function serverReportsMainAiKey(cfg: {
  hasMainAiApiKey?: boolean;
  hasGrokApiKey?: boolean;
}): boolean {
  return Boolean(cfg.hasMainAiApiKey ?? cfg.hasGrokApiKey);
}

/** Matches server `FREE_TIER_MONTHLY_LIMIT_MESSAGE` (Nebula billing, not xAI). */
export const FREE_TIER_MONTHLY_LIMIT_MESSAGE =
  "You've reached your monthly AI usage limit on the Free plan. Upgrade to Pro for unlimited access.";

export function isMonthlyUsageLimitError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('monthly') && (m.includes('limit') || m.includes('usage')) ||
    m.includes('token_limit_exceeded') ||
    m.includes('upgrade to pro')
  );
}
