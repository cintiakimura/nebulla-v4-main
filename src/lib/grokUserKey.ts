/**
 * Browser Grok / xAI key helpers.
 * When signed in, prefer encrypted account storage via /api/byok (see byokClient.ts).
 * localStorage + header remain a migration path / guest fallback.
 */

import { getBrowserProjectKey } from './nebulaProjectApi';
import { getProjectSecretValue, upsertProjectSecret } from './nebulaSecretHelpers';
import { dispatchByokUpdated, saveByokKeyToServer } from './byokClient';

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

/** Clear browser copies after a successful account save (XSS demotion). */
export function clearLocalGrokApiKeyCache(): void {
  try {
    localStorage.removeItem(NEBULLA_GROK_KEY_STORAGE);
  } catch {
    /* ignore */
  }
}

/**
 * Persist Grok key: try encrypted account store first; keep a short-lived local cache
 * only when the server save fails (guest / DB down) so chat header still works.
 */
export async function saveGrokApiKeyRobust(value: string): Promise<{
  ok: boolean;
  source: 'server' | 'local';
  error?: string;
}> {
  const t = value.trim();
  if (!isPlausibleGrokApiKey(t)) {
    return { ok: false, source: 'local', error: 'Key looks too short or invalid.' };
  }

  const server = await saveByokKeyToServer('xai', t);
  if (server.ok) {
    clearLocalGrokApiKeyCache();
    // Keep Secrets UI row as a placeholder (no raw value) so the name stays visible.
    try {
      upsertProjectSecret(getBrowserProjectKey(), GROK_SECRET_NAME, '', 'api_key');
    } catch {
      /* ignore */
    }
    dispatchByokUpdated();
    return { ok: true, source: 'server' };
  }

  // Fallback: local + header migration path
  setStoredGrokApiKeyLocalOnly(t);
  dispatchByokUpdated();
  return {
    ok: true,
    source: 'local',
    error: server.error
      ? `Saved in this browser only (${server.error}). Sign in for account sync.`
      : 'Saved in this browser only.',
  };
}

/** Sync local write — prefer {@link saveGrokApiKeyRobust} when signed in. */
export function setStoredGrokApiKey(value: string): void {
  setStoredGrokApiKeyLocalOnly(value);
}

function setStoredGrokApiKeyLocalOnly(value: string): void {
  const t = value.trim();
  const projectKey = getBrowserProjectKey();
  if (!t) {
    clearLocalGrokApiKeyCache();
    return;
  }
  try {
    localStorage.setItem(NEBULLA_GROK_KEY_STORAGE, t);
  } catch {
    /* ignore */
  }
  upsertProjectSecret(projectKey, GROK_SECRET_NAME, t, 'api_key');
}

/**
 * Headers for Grok routes — send browser key only when present (migration).
 * Account keys are resolved server-side from the session; no header needed.
 */
export function getGrokRequestHeaders(): Record<string, string> {
  const key = getStoredGrokApiKey();
  return key && key.length >= MIN_GROK_KEY_LEN ? { 'X-Nebula-Xai-Api-Key': key } : {};
}
