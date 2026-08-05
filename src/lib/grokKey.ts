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

/** Matches server `FREE_TIER_MONTHLY_LIMIT_MESSAGE` (Nebulla metering — only when ENFORCE_FREE_TIER_TOKEN_LIMIT). */
export const FREE_TIER_MONTHLY_LIMIT_MESSAGE =
  "You've reached your monthly AI usage limit on the Free plan. Upgrade to Pro for unlimited access.";

/** Closed beta / billing-off: never push Upgrade to Pro. */
export const BETA_PLATFORM_AI_LIMIT_MESSAGE =
  'Platform AI is temporarily limited on this deployment. Add your own Grok/xAI key in Secrets (BYOK), or ask the operator to top up the platform xAI account.';

/** Honest copy when xAI (or another provider) hits *their* quota — not Nebulla Free plan. */
export const PROVIDER_QUOTA_LIMIT_MESSAGE =
  'Grok/xAI hit a provider quota or billing limit on the API key in use. This is not a Nebulla Free-plan limit. Add your own key in Secrets, or top up the xAI account that owns the platform key.';

/** True only for Nebulla's own Free-tier meter (not xAI/Anthropic provider errors). */
export function isNebullaFreeTierLimitError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('token_limit_exceeded') ||
    m.includes('upgrade to pro') ||
    (m.includes('free plan') && m.includes('monthly') && m.includes('usage'))
  );
}

/** @deprecated Use {@link isNebullaFreeTierLimitError} — old name matched provider quota too broadly. */
export function isMonthlyUsageLimitError(message: string): boolean {
  return isNebullaFreeTierLimitError(message) || isProviderQuotaLimitError(message);
}

/** xAI / Anthropic / OpenAI quota-style errors (provider billing, not Nebulla Free plan). */
export function isProviderQuotaLimitError(message: string): boolean {
  if (isNebullaFreeTierLimitError(message)) return false;
  const m = message.toLowerCase();
  return (
    /\b(402|payment required)\b/.test(m) ||
    /quota exceeded|\bquota\b/.test(m) ||
    (m.includes('monthly') && (m.includes('limit') || m.includes('spending') || m.includes('budget'))) ||
    /credits?\s+(exhausted|exceeded|depleted)/.test(m)
  );
}

/** Pick user-facing copy for limit-like chat errors during closed beta. */
export function resolveAiLimitUserMessage(
  message: string,
  opts?: { billingEnabled?: boolean; freeTierTokenLimitDisabled?: boolean },
): string {
  const billingOn = opts?.billingEnabled === true;
  const meteringOff = opts?.freeTierTokenLimitDisabled !== false;

  if (isNebullaFreeTierLimitError(message)) {
    if (!billingOn || meteringOff) return BETA_PLATFORM_AI_LIMIT_MESSAGE;
    return FREE_TIER_MONTHLY_LIMIT_MESSAGE;
  }
  if (isProviderQuotaLimitError(message)) {
    return PROVIDER_QUOTA_LIMIT_MESSAGE;
  }
  return message;
}
