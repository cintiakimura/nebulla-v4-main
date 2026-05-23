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
