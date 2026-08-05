/** Same guidance as server `MAIN_AI_KEY_SETUP_HINT` (kept in client bundle). */
export const MAIN_AI_CHAT_SETUP_HINT =
  'Grok chat is unavailable: no valid API key on the server. Add your xAI key in My services (or ask your operator to configure the deployment), then restart or redeploy and reload this page.';

/** @deprecated Use {@link MAIN_AI_CHAT_SETUP_HINT}. */
export const GROK_CHAT_SETUP_HINT = MAIN_AI_CHAT_SETUP_HINT;

/** Shown in Secrets / onboarding — xAI keys need ACLs or chat returns 403. */
export const XAI_KEY_ACL_SETUP_HINT =
  'When creating the key in the xAI console, enable API access for chat/models (or “all endpoints / all models”). New keys with no permissions return HTTP 403.';

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

export const PROVIDER_QUOTA_NO_BYOK_HINT =
  'No Grok key is saved on your account yet — chat is using the platform key. Open Secrets (key icon) → paste your xAI key → Save Grok key, then retry.';

export const PROVIDER_QUOTA_WITH_BYOK_HINT =
  'An account key is saved, but xAI still rejected it for quota/billing. Open console.x.ai → credits for that key, or paste a different key with credits.';

/** xAI 403: key valid but missing endpoint/model ACLs (common for newly created keys). */
export const PROVIDER_PERMISSION_LIMIT_MESSAGE =
  'xAI rejected this API key with HTTP 403 (forbidden / no permission). This is usually missing key permissions, not a Nebulla bug and not Free-plan metering.';

export const PROVIDER_PERMISSION_FIX_HINT =
  'In console.x.ai, edit the API key and grant chat + model access (or all endpoints / all models), save, then paste the key again in Secrets. Also confirm the green “…xxxx” tail changes after Save.';

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
  return (
    isNebullaFreeTierLimitError(message) ||
    isProviderPermissionError(message) ||
    isProviderQuotaLimitError(message)
  );
}

/** xAI key ACL / team permission failures (often HTTP 403 on brand-new keys). */
export function isProviderPermissionError(message: string): boolean {
  if (isNebullaFreeTierLimitError(message)) return false;
  const m = message.toLowerCase();
  // Explicit permission language wins even if "limit" appears elsewhere.
  if (
    /\bforbidden\b/.test(m) ||
    /\b403\b/.test(m) ||
    /permission|not (?:been )?granted|\bacls?\b|access denied|team admin|does not have access|unauthorized for|ask your team admin/i.test(
      m,
    )
  ) {
    // Don't steal true spending-limit copy that happens to mention "403" nowhere — if it's clearly quota-only, defer.
    if (
      /monthly (?:spending |usage )?limit|quota exceeded|credits?\s+(exhausted|exceeded|depleted)/i.test(m) &&
      !/\b403\b|\bforbidden\b|permission|acl|team admin/i.test(m)
    ) {
      return false;
    }
    return true;
  }
  return false;
}

/** xAI / Anthropic / OpenAI quota-style errors (provider billing, not Nebulla Free plan). */
export function isProviderQuotaLimitError(message: string): boolean {
  if (isNebullaFreeTierLimitError(message)) return false;
  if (isProviderPermissionError(message)) return false;
  const m = message.toLowerCase();
  return (
    /\b402\b/.test(m) ||
    /payment required/i.test(m) ||
    /quota exceeded|\bquota\b/.test(m) ||
    (m.includes('monthly') && (m.includes('limit') || m.includes('spending') || m.includes('budget'))) ||
    /credits?\s+(exhausted|exceeded|depleted)/.test(m)
  );
}

/** Pick user-facing copy for limit-like chat errors during closed beta. */
export function resolveAiLimitUserMessage(
  message: string,
  opts?: {
    billingEnabled?: boolean;
    freeTierTokenLimitDisabled?: boolean;
    hasUserByok?: boolean;
  },
): string {
  const billingOn = opts?.billingEnabled === true;
  const meteringOff = opts?.freeTierTokenLimitDisabled !== false;

  if (isNebullaFreeTierLimitError(message)) {
    if (!billingOn || meteringOff) return BETA_PLATFORM_AI_LIMIT_MESSAGE;
    return FREE_TIER_MONTHLY_LIMIT_MESSAGE;
  }
  if (isProviderPermissionError(message)) {
    return `${PROVIDER_PERMISSION_LIMIT_MESSAGE} ${PROVIDER_PERMISSION_FIX_HINT}`;
  }
  if (isProviderQuotaLimitError(message)) {
    const hint =
      opts?.hasUserByok === true
        ? PROVIDER_QUOTA_WITH_BYOK_HINT
        : opts?.hasUserByok === false
          ? PROVIDER_QUOTA_NO_BYOK_HINT
          : '';
    return hint ? `${PROVIDER_QUOTA_LIMIT_MESSAGE} ${hint}` : PROVIDER_QUOTA_LIMIT_MESSAGE;
  }
  return message;
}
