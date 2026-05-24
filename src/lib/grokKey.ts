/** Same guidance as server `MAIN_AI_KEY_SETUP_HINT` (kept in client bundle). */
export const MAIN_AI_CHAT_SETUP_HINT =
  'Grok chat is unavailable: no valid API key on the server. Add your xAI key in My services (or ask your operator to configure the deployment), then restart or redeploy and reload this page.';

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
