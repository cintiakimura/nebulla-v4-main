/** Same guidance as server `NEBULA_GROK_KEY_SETUP_HINT` (kept in client bundle). */
export const GROK_CHAT_SETUP_HINT =
  "Grok is configured on the server: set GROK_API_KEY in the Nebula .env file and restart the process. (Browser-stored Grok keys are temporarily unused.)";
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
