/**
 * Client helpers for account-encrypted BYOK (xAI / Anthropic / OpenAI).
 * localStorage is migration/cache only — server DB is source of truth when signed in.
 */

export type ByokProviderId = 'xai' | 'anthropic' | 'openai';

export type ByokProviderStatus = {
  configured: boolean;
  tail?: string;
  validatedAt?: string | null;
};

export type ByokStatusResponse = {
  ok: boolean;
  providers: Record<ByokProviderId, ByokProviderStatus>;
  hasAnyKey: boolean;
  error?: string;
  dbUnavailable?: boolean;
};

function providerFromUi(name: string): ByokProviderId | null {
  const n = name.trim().toUpperCase();
  if (n === 'XAI_API_KEY' || n === 'GROK_API_KEY') return 'xai';
  if (n === 'ANTHROPIC_API_KEY' || n === 'CLAUDE_API_KEY') return 'anthropic';
  if (n === 'OPENAI_API_KEY') return 'openai';
  return null;
}

export async function fetchByokStatus(): Promise<ByokStatusResponse | null> {
  try {
    const r = await fetch('/api/byok/status', { credentials: 'include', cache: 'no-store' });
    const data = (await r.json()) as ByokStatusResponse & { error?: string };
    if (r.status === 401) return null;
    if (!r.ok) {
      return {
        ok: false,
        providers: {
          xai: { configured: false },
          anthropic: { configured: false },
          openai: { configured: false },
        },
        hasAnyKey: false,
        error: data.error || 'Could not load key status',
        dbUnavailable: Boolean(data.dbUnavailable),
      };
    }
    return data;
  } catch {
    return null;
  }
}

export async function saveByokKeyToServer(
  provider: ByokProviderId,
  apiKey: string,
): Promise<{ ok: boolean; error?: string; tail?: string }> {
  try {
    const r = await fetch('/api/byok/keys', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, apiKey }),
    });
    const data = (await r.json()) as {
      ok?: boolean;
      error?: string;
      tail?: string;
    };
    if (!r.ok || !data.ok) {
      return { ok: false, error: data.error || `Save failed (${r.status})` };
    }
    return { ok: true, tail: data.tail };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Network error saving key',
    };
  }
}

export async function deleteByokKeyOnServer(
  provider: ByokProviderId,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch(`/api/byok/keys/${encodeURIComponent(provider)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    const data = (await r.json()) as { ok?: boolean; error?: string };
    if (!r.ok || !data.ok) {
      return { ok: false, error: data.error || `Delete failed (${r.status})` };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Network error deleting key',
    };
  }
}

/** Map Secrets row name → BYOK provider, or null if not an account AI key. */
export function byokProviderFromSecretName(name: string): ByokProviderId | null {
  return providerFromUi(name);
}

export function dispatchByokUpdated(): void {
  try {
    window.dispatchEvent(new CustomEvent('nebula-byok-updated'));
    window.dispatchEvent(new CustomEvent('nebula-secrets-updated'));
  } catch {
    /* ignore */
  }
}
