/**
 * Monthly token accounting per Nebula user (PostgreSQL).
 * Resets implicitly by `monthYear` key (`YYYY-MM`, UTC).
 */

import type { PlatformQueryable } from "./nebulaPlatformQueryable";
import { getPlatformQueryable } from "./nebulaPgPool";
import { FREE_TIER_MONTHLY_TOKEN_LIMIT, getUserCapabilities, normalizeUserTier, type UserTier } from "./user-tier";

export type GrokUsageModelKind = "grok-3" | "grok-4";

export class TokenLimitExceededError extends Error {
  readonly code = "TOKEN_LIMIT_EXCEEDED" as const;
  constructor(message = "Monthly token limit exceeded for Free tier.") {
    super(message);
    this.name = "TokenLimitExceededError";
  }
}

function parseEnvTruthy(raw: string | undefined): boolean | null {
  const v = raw?.trim().toLowerCase() ?? "";
  if (!v) return null;
  if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  return null;
}

/**
 * Skip Nebula Free-tier monthly cap (not xAI/Grok provider quota).
 *
 * **Billing is opt-in** while developing/testing:
 * - Cap is **OFF** by default (local, Render, production).
 * - Set `ENFORCE_FREE_TIER_TOKEN_LIMIT=true` to turn Nebulla Free monthly metering back on.
 *
 * Provider (xAI) quotas are separate and still apply to the key owner.
 * User BYOK chat also skips this meter in `/api/grok/chat`.
 */
export function isFreeTierTokenLimitDisabled(): boolean {
  return parseEnvTruthy(process.env.ENFORCE_FREE_TIER_TOKEN_LIMIT) !== true;
}

function utcMonthYear(d = new Date()): string {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  return `${y}-${m < 10 ? `0${m}` : m}`;
}

async function fetchBillingTierForUser(db: PlatformQueryable, userId: string): Promise<UserTier> {
  const r = await db.query(`SELECT billing_tier FROM public.nebula_users WHERE id = $1::uuid`, [userId]);
  const raw = r.rows[0]?.billing_tier as string | undefined;
  return normalizeUserTier(raw);
}

async function upsertAddTokens(db: PlatformQueryable, userId: string, monthYear: string, delta: number, kind: GrokUsageModelKind) {
  const g3 = kind === "grok-3" ? delta : 0;
  const g4 = kind === "grok-4" ? delta : 0;
  await db.query(
    `INSERT INTO nebula_token_usage_monthly (user_id, month_year, total_tokens, grok3_tokens, grok4_tokens, updated_at)
     VALUES ($1::uuid, $2, $3, $4, $5, NOW())
     ON CONFLICT (user_id, month_year) DO UPDATE SET
       total_tokens = nebula_token_usage_monthly.total_tokens + EXCLUDED.total_tokens,
       grok3_tokens = nebula_token_usage_monthly.grok3_tokens + EXCLUDED.grok3_tokens,
       grok4_tokens = nebula_token_usage_monthly.grok4_tokens + EXCLUDED.grok4_tokens,
       updated_at = NOW()`,
    [userId, monthYear, delta, g3, g4]
  );
}

/**
 * Remaining tokens this UTC month for **Free** tier. Returns `Infinity` when not on Free or when
 * user is anonymous / DB is unavailable (caller should skip enforcement for local-only flows).
 */
export async function getRemainingTokens(userId: string): Promise<number> {
  if (!userId || userId === "anonymous") return Infinity;
  const db = getPlatformQueryable();
  if (!db) return Infinity;
  let tier: UserTier;
  try {
    tier = await fetchBillingTierForUser(db, userId);
  } catch {
    return Infinity;
  }
  const caps = getUserCapabilities({ tier });
  if (caps.monthlyTokenLimit == null || isFreeTierTokenLimitDisabled()) return Infinity;

  const monthYear = utcMonthYear();
  try {
    const r = await db.query(
      `SELECT total_tokens FROM nebula_token_usage_monthly WHERE user_id = $1::uuid AND month_year = $2`,
      [userId, monthYear]
    );
    const used = Number(r.rows[0]?.total_tokens ?? 0) || 0;
    return Math.max(0, FREE_TIER_MONTHLY_TOKEN_LIMIT - used);
  } catch {
    return Infinity;
  }
}

/** Adds usage to the current UTC month row (upsert). */
export async function addTokens(userId: string, tokens: number, model: GrokUsageModelKind): Promise<void> {
  if (!userId || userId === "anonymous") return;
  const n = Math.max(0, Math.floor(tokens));
  if (!n) return;
  const db = getPlatformQueryable();
  if (!db) return;
  const monthYear = utcMonthYear();
  const kind: GrokUsageModelKind = model === "grok-3" ? "grok-3" : "grok-4";
  await upsertAddTokens(db, userId, monthYear, n, kind);
}

/**
 * Throws `TokenLimitExceededError` if the user is on **Free** and has met or exceeded the monthly cap.
 * No-op for anonymous, DB-off, or paid tiers.
 */
export async function checkAndEnforceLimit(userId: string): Promise<void> {
  if (!userId || userId === "anonymous") return;
  if (isFreeTierTokenLimitDisabled()) return;
  const db = getPlatformQueryable();
  if (!db) return;
  try {
    const tier = await fetchBillingTierForUser(db, userId);
    const caps = getUserCapabilities({ tier });
    if (caps.monthlyTokenLimit == null) return;

    const monthYear = utcMonthYear();
    const r = await db.query(
      `SELECT total_tokens FROM nebula_token_usage_monthly WHERE user_id = $1::uuid AND month_year = $2`,
      [userId, monthYear]
    );
    const used = Number(r.rows[0]?.total_tokens ?? 0) || 0;
    if (used >= FREE_TIER_MONTHLY_TOKEN_LIMIT) {
      throw new TokenLimitExceededError();
    }
  } catch (e) {
    if (e instanceof TokenLimitExceededError) throw e;
    console.warn("[billing] checkAndEnforceLimit skipped (allowing chat):", e instanceof Error ? e.message : String(e));
  }
}

export async function getMonthlyUsageSnapshot(userId: string): Promise<{
  monthYear: string;
  used: number;
  grok3Tokens: number;
  grok4Tokens: number;
  tier: UserTier;
  limit: number | null;
  remaining: number;
} | null> {
  if (!userId || userId === "anonymous") return null;
  const db = getPlatformQueryable();
  if (!db) return null;
  try {
    const tier = await fetchBillingTierForUser(db, userId);
    const caps = getUserCapabilities({ tier });
    const monthYear = utcMonthYear();
    const r = await db.query(
      `SELECT total_tokens, grok3_tokens, grok4_tokens FROM nebula_token_usage_monthly WHERE user_id = $1::uuid AND month_year = $2`,
      [userId, monthYear]
    );
    const used = Number(r.rows[0]?.total_tokens ?? 0) || 0;
    const grok3Tokens = Number(r.rows[0]?.grok3_tokens ?? 0) || 0;
    const grok4Tokens = Number(r.rows[0]?.grok4_tokens ?? 0) || 0;
    const limit = isFreeTierTokenLimitDisabled() ? null : caps.monthlyTokenLimit;
    const remaining =
      limit == null ? Number.POSITIVE_INFINITY : Math.max(0, limit - used);
    return { monthYear, used, grok3Tokens, grok4Tokens, tier, limit, remaining };
  } catch (e) {
    console.warn("[billing] getMonthlyUsageSnapshot failed (treating as unknown tier):", e instanceof Error ? e.message : String(e));
    return null;
  }
}
