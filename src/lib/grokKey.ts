/** Browser-only storage for Grok key when .env is not set (local dev / Settings). */
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
