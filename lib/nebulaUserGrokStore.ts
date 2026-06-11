import type pg from "pg";
import { decryptAtRest, encryptAtRest } from "./nebulaAtRestCrypto";

/** Heuristic validation only (no network). */
export function isPlausibleGrokApiKey(k: string): boolean {
  const t = k.trim();
  if (t.length < 20 || t.length > 512) return false;
  if (t.startsWith("xai-") && /^xai-[A-Za-z0-9_-]+$/.test(t)) return true;
  return /^[A-Za-z0-9_\-]{24,}$/.test(t);
}

export async function saveUserGrokApiKey(pool: pg.Pool, uid: string, plain: string): Promise<{ ok: boolean }> {
  if (!isPlausibleGrokApiKey(plain)) return { ok: false };
  const enc = encryptAtRest(plain.trim());
  await pool.query(
    `UPDATE public.nebula_users SET grok_api_key_encrypted = $2, grok_key_validated_at = NOW() WHERE id = $1::uuid`,
    [uid, enc]
  );
  return { ok: true };
}

export async function getUserGrokApiKeyDecrypted(pool: pg.Pool, uid: string): Promise<string | undefined> {
  const r = await pool.query(`SELECT grok_api_key_encrypted FROM public.nebula_users WHERE id = $1::uuid`, [uid]);
  const enc = r.rows[0]?.grok_api_key_encrypted as string | undefined;
  if (!enc || typeof enc !== "string" || !enc.trim()) return undefined;
  const dec = decryptAtRest(enc.trim());
  if (!dec || !isPlausibleGrokApiKey(dec)) return undefined;
  return dec.trim();
}
