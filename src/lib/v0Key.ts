/** Browser-only v0 API key (Dashboard Secrets + this key for app features). */
export const NEBULLA_V0_KEY_STORAGE = 'nebulla_v0_api_key';

export function getStoredV0ApiKey(): string | undefined {
  if (typeof localStorage === 'undefined') return undefined;
  const v = localStorage.getItem(NEBULLA_V0_KEY_STORAGE)?.trim();
  return v || undefined;
}

export function setStoredV0ApiKey(value: string): void {
  if (typeof localStorage === 'undefined') return;
  const t = value.trim();
  if (!t) {
    localStorage.removeItem(NEBULLA_V0_KEY_STORAGE);
    return;
  }
  localStorage.setItem(NEBULLA_V0_KEY_STORAGE, t);
}

/** Headers for v0 API routes — sends browser-stored key when Render env has none. */
export function getV0RequestHeaders(): Record<string, string> {
  const key = getStoredV0ApiKey();
  return key ? { 'X-Nebula-V0-Api-Key': key } : {};
}
