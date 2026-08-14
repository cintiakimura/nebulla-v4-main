/**
 * Browser Grok / xAI key helpers.
 * When signed in, prefer encrypted account storage via /api/byok (see byokClient.ts).
 * localStorage + header remain a migration path / guest fallback.
 */

import { getBrowserProjectKey } from './nebulaProjectApi';
import { upsertProjectSecret } from './nebulaSecretHelpers';
import { loadProjectSecrets } from './nebulaDashboardStorage';
import { dispatchByokUpdated, saveByokKeyToServer } from './byokClient';
import { clearAllMainAiAuthRejected } from './continueFailureTaxonomy';
import { serverReportsMainAiKey } from './grokKey';
import { FORCE_GUEST_MODE } from './testingBranch';

export const GROK_SECRET_NAME = 'XAI_API_KEY';
export const NEBULLA_GROK_KEY_STORAGE = 'nebulla_xai_api_key';
export const GROK_CONSOLE_URL = 'https://console.x.ai/';
export const MIN_GROK_KEY_LEN = 20;

function readBrowserGrokKey(): string | undefined {
  try {
    const fromLs = localStorage.getItem(NEBULLA_GROK_KEY_STORAGE)?.trim();
    if (fromLs) return fromLs;
  } catch {
    /* ignore */
  }
  try {
    const fromSs = sessionStorage.getItem(NEBULLA_GROK_KEY_STORAGE)?.trim();
    if (fromSs) return fromSs;
  } catch {
    /* ignore */
  }
  return undefined;
}

export function sanitizeGrokApiKey(raw: string): string {
  let s = raw.trim().replace(/^bearer\s+/i, '');
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s.replace(/[\r\n\u200B-\u200D\uFEFF]/g, '');
}

export function getStoredGrokApiKey(): string | undefined {
  const projectKey = getBrowserProjectKey();
  const xaiRow = loadProjectSecrets(projectKey).find(
    (row) => row.name.trim().toUpperCase() === GROK_SECRET_NAME,
  );
  if (xaiRow) {
    const v = sanitizeGrokApiKey(xaiRow.value);
    return v.length >= MIN_GROK_KEY_LEN ? v : undefined;
  }
  const fromBrowser = readBrowserGrokKey();
  return fromBrowser ? sanitizeGrokApiKey(fromBrowser) : undefined;
}

export function storedGrokKeyTail(): string | undefined {
  const k = getStoredGrokApiKey();
  return k && k.length >= 4 ? k.slice(-4) : undefined;
}

export function hasLocalGrokApiKey(): boolean {
  const k = getStoredGrokApiKey();
  return Boolean(k && k.length >= MIN_GROK_KEY_LEN);
}

/** Platform/BYOK from /api/config, or guest local key sent as X-Nebula-Xai-Api-Key. */
export function hasUsableGrokKeyForChat(cfg?: {
  hasMainAiApiKey?: boolean;
  hasGrokApiKey?: boolean;
} | null): boolean {
  if (cfg && serverReportsMainAiKey(cfg)) return true;
  return hasLocalGrokApiKey();
}

export function isPlausibleGrokApiKey(raw: string): boolean {
  const t = sanitizeGrokApiKey(raw);
  return t.length >= MIN_GROK_KEY_LEN && !/\s/.test(t);
}

/** xAI console keys are `xai-…`. Other long secrets must not be sent as Grok. */
export function looksLikeXaiApiKey(raw: string): boolean {
  return /^xai-/i.test(sanitizeGrokApiKey(raw));
}

/** Clear browser copies after a successful account save (XSS demotion). */
export function clearLocalGrokApiKeyCache(): void {
  try {
    localStorage.removeItem(NEBULLA_GROK_KEY_STORAGE);
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.removeItem(NEBULLA_GROK_KEY_STORAGE);
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
  const t = sanitizeGrokApiKey(value);
  if (!isPlausibleGrokApiKey(t)) {
    return { ok: false, source: 'local', error: 'Key looks too short or invalid.' };
  }

  // Lab (`NEBULA_FORCE_GUEST=1`): local only. Production: PUT /api/byok/keys when
  // a session exists; true guest (401) keeps the local key as fallback.
  if (FORCE_GUEST_MODE) {
    setStoredGrokApiKeyLocalOnly(t);
    clearAllMainAiAuthRejected();
    dispatchByokUpdated();
    return { ok: true, source: 'local', error: 'Saved in this browser. Build chat will use this key.' };
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
    clearAllMainAiAuthRejected();
    dispatchByokUpdated();
    return { ok: true, source: 'server' };
  }

  // Fallback: local + header migration path
  setStoredGrokApiKeyLocalOnly(t);
  clearAllMainAiAuthRejected();
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
  const t = sanitizeGrokApiKey(value);
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
  try {
    sessionStorage.setItem(NEBULLA_GROK_KEY_STORAGE, t);
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
  const clean = key ? sanitizeGrokApiKey(key) : '';
  return clean.length >= MIN_GROK_KEY_LEN ? { 'X-Nebula-Xai-Api-Key': clean } : {};
}
