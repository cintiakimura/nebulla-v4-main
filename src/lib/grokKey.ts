/** Same guidance as server `NEBULA_GROK_KEY_SETUP_HINT` (kept in client bundle). */
export const GROK_CHAT_SETUP_HINT =
  'Grok chat failed: the server does not have a valid GROK_API_KEY in its environment (at least 20 characters after trimming). Ask your operator to set it in the project .env, restart the dev server or redeploy, then reload.';
export const NEBULLA_GROK_KEY_STORAGE = 'nebulla_grok_api_key';

export function getStoredGrokApiKey(): string | undefined {
  if (typeof localStorage === 'undefined') return undefined;
  const v = localStorage.getItem(NEBULLA_GROK_KEY_STORAGE)?.trim();
  return v || undefined;
}

export function setStoredGrokApiKey(value: string): void {
  if (typeof localStorage === 'undefined') return;
  const t = value.trim();
  if (!t) {
    localStorage.removeItem(NEBULLA_GROK_KEY_STORAGE);
    return;
  }
  localStorage.setItem(NEBULLA_GROK_KEY_STORAGE, t);
}
