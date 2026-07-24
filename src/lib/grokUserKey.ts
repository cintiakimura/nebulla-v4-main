/**
 * Browser-stored Grok / xAI key for BYOK onboarding.
 * Mirrored in project Secrets as XAI_API_KEY (same pattern as V0_API_KEY).
 */

import { getBrowserProjectKey } from './nebulaProjectApi';
import { getProjectSecretValue, upsertProjectSecret } from './nebulaSecretHelpers';

export const GROK_SECRET_NAME = 'XAI_API_KEY';
export const NEBULLA_GROK_KEY_STORAGE = 'nebulla_xai_api_key';
export const GROK_CONSOLE_URL = 'https://console.x.ai/';
export const MIN_GROK_KEY_LEN = 20;

export function getStoredGrokApiKey(): string | undefined {
  if (typeof localStorage === 'undefined') return undefined;
  try {
    const fromLs = localStorage.getItem(NEBULLA_GROK_KEY_STORAGE)?.trim();
    if (fromLs) return fromLs;
  } catch {
    /* ignore */
  }
  return getProjectSecretValue(getBrowserProjectKey(), GROK_SECRET_NAME);
}

export function hasLocalGrokApiKey(): boolean {
  const k = getStoredGrokApiKey();
  return Boolean(k && k.length >= MIN_GROK_KEY_LEN);
}

export function isPlausibleGrokApiKey(raw: string): boolean {
  const t = raw.trim();
  return t.length >= MIN_GROK_KEY_LEN && !/\s/.test(t);
}

export function setStoredGrokApiKey(value: string): void {
  const t = value.trim();
  const projectKey = getBrowserProjectKey();
  if (!t) {
    try {
      localStorage.removeItem(NEBULLA_GROK_KEY_STORAGE);
    } catch {
      /* ignore */
    }
    return;
  }
  try {
    localStorage.setItem(NEBULLA_GROK_KEY_STORAGE, t);
  } catch {
    /* ignore */
  }
  upsertProjectSecret(projectKey, GROK_SECRET_NAME, t, 'api_key');
}

/** Headers for Grok/chat/Go routes — sends browser-stored key when present. */
export function getGrokRequestHeaders(): Record<string, string> {
  const key = getStoredGrokApiKey();
  return key && key.length >= MIN_GROK_KEY_LEN ? { 'X-Nebula-Xai-Api-Key': key } : {};
}
