/**
 * Per-user BYOK AI keys — encrypted at rest on nebula_users.
 * Never write these into shared Render / .env. Platform MAIN_API_KEY_GROK is fallback only.
 */

import { decryptAtRest, encryptAtRest } from "./nebulaAtRestCrypto";
import type { MainAiProvider } from "./nebulaMainAiProvider";
import type { PlatformQueryable } from "./nebulaPlatformQueryable";

export type ByokProvider = "xai" | "anthropic" | "openai";

const MIN_LEN = 20;
const MAX_LEN = 512;

const COLUMN: Record<
  ByokProvider,
  { enc: string; validated: string }
> = {
  xai: { enc: "grok_api_key_encrypted", validated: "grok_key_validated_at" },
  anthropic: { enc: "anthropic_api_key_encrypted", validated: "anthropic_key_validated_at" },
  openai: { enc: "openai_api_key_encrypted", validated: "openai_key_validated_at" },
};

export function isByokProvider(v: unknown): v is ByokProvider {
  return v === "xai" || v === "anthropic" || v === "openai";
}

export function byokProviderFromSecretName(name: string): ByokProvider | null {
  const n = name.trim().toUpperCase();
  if (n === "XAI_API_KEY" || n === "GROK_API_KEY") return "xai";
  if (n === "ANTHROPIC_API_KEY" || n === "CLAUDE_API_KEY") return "anthropic";
  if (n === "OPENAI_API_KEY") return "openai";
  return null;
}

export function secretNameForByokProvider(provider: ByokProvider): string {
  switch (provider) {
    case "xai":
      return "XAI_API_KEY";
    case "anthropic":
      return "ANTHROPIC_API_KEY";
    case "openai":
      return "OPENAI_API_KEY";
  }
}

/** Heuristic validation only (no network). */
export function isPlausibleByokApiKey(k: string, provider?: ByokProvider): boolean {
  const t = k.trim();
  if (t.length < MIN_LEN || t.length > MAX_LEN) return false;
  if (/\s/.test(t)) return false;
  if (provider === "anthropic") {
    return t.startsWith("sk-ant-") || t.length >= 24;
  }
  if (provider === "openai") {
    return t.startsWith("sk-") || t.length >= 24;
  }
  if (provider === "xai") {
    if (t.startsWith("xai-") && /^xai-[A-Za-z0-9_-]+$/.test(t)) return true;
    return /^[A-Za-z0-9_\-]{24,}$/.test(t);
  }
  return t.length >= MIN_LEN;
}

/** @deprecated Prefer isPlausibleByokApiKey */
export function isPlausibleGrokApiKey(k: string): boolean {
  return isPlausibleByokApiKey(k, "xai");
}

export function keyTail(plain: string): string | undefined {
  const t = plain.trim();
  return t.length >= 8 ? t.slice(-4) : undefined;
}

export async function saveUserByokApiKey(
  db: PlatformQueryable,
  uid: string,
  provider: ByokProvider,
  plain: string,
): Promise<{ ok: boolean; reason?: string }> {
  if (!isPlausibleByokApiKey(plain, provider)) {
    return { ok: false, reason: "invalid_key" };
  }
  const enc = encryptAtRest(plain.trim());
  const col = COLUMN[provider];
  await db.query(
    `UPDATE public.nebula_users SET ${col.enc} = $2, ${col.validated} = NOW() WHERE id = $1::uuid`,
    [uid, enc],
  );
  return { ok: true };
}

/** @deprecated Prefer saveUserByokApiKey(..., "xai", ...) */
export async function saveUserGrokApiKey(
  db: PlatformQueryable,
  uid: string,
  plain: string,
): Promise<{ ok: boolean }> {
  const r = await saveUserByokApiKey(db, uid, "xai", plain);
  return { ok: r.ok };
}

export async function clearUserByokApiKey(
  db: PlatformQueryable,
  uid: string,
  provider: ByokProvider,
): Promise<void> {
  const col = COLUMN[provider];
  await db.query(
    `UPDATE public.nebula_users SET ${col.enc} = NULL, ${col.validated} = NULL WHERE id = $1::uuid`,
    [uid],
  );
}

export async function getUserByokApiKeyDecrypted(
  db: PlatformQueryable,
  uid: string,
  provider: ByokProvider,
): Promise<string | undefined> {
  const col = COLUMN[provider];
  const r = await db.query(
    `SELECT ${col.enc} AS enc FROM public.nebula_users WHERE id = $1::uuid`,
    [uid],
  );
  const enc = r.rows[0]?.enc as string | undefined;
  if (!enc || typeof enc !== "string" || !enc.trim()) return undefined;
  const dec = decryptAtRest(enc.trim());
  if (!dec || !isPlausibleByokApiKey(dec, provider)) return undefined;
  return dec.trim();
}

/** @deprecated Prefer getUserByokApiKeyDecrypted(..., "xai") */
export async function getUserGrokApiKeyDecrypted(
  db: PlatformQueryable,
  uid: string,
): Promise<string | undefined> {
  return getUserByokApiKeyDecrypted(db, uid, "xai");
}

export type ByokStatusProvider = {
  configured: boolean;
  tail?: string;
  validatedAt?: string | null;
};

export type ByokStatus = Record<ByokProvider, ByokStatusProvider>;

export async function getUserByokStatus(db: PlatformQueryable, uid: string): Promise<ByokStatus> {
  const r = await db.query(
    `SELECT grok_api_key_encrypted, grok_key_validated_at,
            anthropic_api_key_encrypted, anthropic_key_validated_at,
            openai_api_key_encrypted, openai_key_validated_at
     FROM public.nebula_users WHERE id = $1::uuid`,
    [uid],
  );
  const row = r.rows[0] as Record<string, unknown> | undefined;
  const empty: ByokStatusProvider = { configured: false };

  const one = (
    encRaw: unknown,
    validatedRaw: unknown,
    provider: ByokProvider,
  ): ByokStatusProvider => {
    if (!encRaw || typeof encRaw !== "string" || !encRaw.trim()) return empty;
    const dec = decryptAtRest(encRaw.trim());
    if (!dec || !isPlausibleByokApiKey(dec, provider)) return empty;
    return {
      configured: true,
      tail: keyTail(dec),
      validatedAt:
        validatedRaw instanceof Date
          ? validatedRaw.toISOString()
          : typeof validatedRaw === "string"
            ? validatedRaw
            : null,
    };
  };

  if (!row) {
    return { xai: empty, anthropic: empty, openai: empty };
  }

  return {
    xai: one(row.grok_api_key_encrypted, row.grok_key_validated_at, "xai"),
    anthropic: one(row.anthropic_api_key_encrypted, row.anthropic_key_validated_at, "anthropic"),
    openai: one(row.openai_api_key_encrypted, row.openai_key_validated_at, "openai"),
  };
}

export function hasAnyByokConfigured(status: ByokStatus): boolean {
  return status.xai.configured || status.anthropic.configured || status.openai.configured;
}

export function asMainAiProvider(p: ByokProvider): MainAiProvider {
  return p;
}
