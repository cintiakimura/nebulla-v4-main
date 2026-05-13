/** Browser-only storage for Grok key when .env is not set (local dev / Settings). */
export const NEBULLA_GROK_KEY_STORAGE = 'nebulla_grok_api_key';

export function getStoredGrokApiKey(): string | undefined {
  if (typeof localStorage === 'undefined') return undefined;
  const v = localStorage.getItem(NEBULLA_GROK_KEY_STORAGE)?.trim();
  return v || undefined;
}
