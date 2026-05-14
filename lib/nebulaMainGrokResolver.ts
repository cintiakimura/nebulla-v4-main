import type express from "express";
import { getNebulaPgPool } from "./nebulaPgPool";
import { getUserGrokApiKeyDecrypted } from "./nebulaUserGrokStore";

/**
 * Resolves the **main** Grok key for chat / UI tools.
 * Order: `X-Grok-Api-Key` → explicit body override → **encrypted per-user key (PostgreSQL)** → `GROK_API_KEY` env.
 * Does **not** read `GROK_SWARM_API_KEY` or `GROK_TTS_NEW_API_KEY` (those remain Nebula `.env` only).
 */
export function createResolveMainGrokApiKey(readSessionUid: (req: express.Request) => string | null) {
  return async function resolveMainGrokApiKey(req: express.Request, bodyGrokOverride?: string): Promise<string> {
    const headerKey =
      typeof req.headers["x-grok-api-key"] === "string" ? req.headers["x-grok-api-key"].trim() : "";
    if (headerKey.length >= 20) return headerKey;
    const bodyKey = typeof bodyGrokOverride === "string" ? bodyGrokOverride.trim() : "";
    if (bodyKey.length >= 20) return bodyKey;
    const uid = readSessionUid(req);
    if (uid) {
      const pool = getNebulaPgPool();
      if (pool) {
        try {
          const dec = await getUserGrokApiKeyDecrypted(pool, uid);
          if (dec && dec.length >= 20) return dec;
        } catch {
          /* ignore */
        }
      }
    }
    return process.env.GROK_API_KEY?.trim() ?? "";
  };
}
