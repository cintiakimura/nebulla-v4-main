/**
 * Platform auth backend: PostgreSQL (legacy) or Cloudflare D1 (PLATFORM_DB_DRIVER=d1).
 * Mount with mountRenderStack(app) from server.ts.
 */

import type { Express, Request, Response } from "express";
import { getProjectKeyFromRequest, sanitizeProjectKey } from "./lib/nebulaProjectKey";
import { registerNebulaPgPool, registerPlatformQueryable } from "./lib/nebulaPgPool";
import { getMonthlyUsageSnapshot } from "./lib/token-usage";
import {
  clearUserByokApiKey,
  getUserByokStatus,
  hasAnyByokConfigured,
  isByokProvider,
  saveUserByokApiKey,
  saveUserGrokApiKey,
  type ByokProvider,
} from "./lib/nebulaUserGrokStore";
import { byokRateLimitAllow } from "./lib/nebulaByokRateLimit";
import {
  isD1ProvisioningConfigured,
  provisionD1ForNebulaProject,
  type D1ProvisionResult,
} from "./lib/nebulaD1Provisioning";
import { getPlatformDbDriver } from "./lib/nebulaPlatformDb";
import {
  createPlatformD1Queryable,
  didPlatformD1InitFail,
  ensurePlatformD1Ready,
  getPlatformD1FailureHint,
  isPlatformD1Configured,
  isPlatformD1Ready,
  resolvePlatformD1DatabaseId,
} from "./lib/nebulaPlatformD1";
import type { PlatformQueryable } from "./lib/nebulaPlatformQueryable";
import { getNebullaPersistRoot, getNebulaProjectDocsRoot } from "./lib/nebulaWorkspaceRoot";
import {
  deleteConversationLogsForUser,
  listConversationLogsForUser,
} from "./conversationLog";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import pg from "pg";
import crypto from "crypto";
import { promisify } from "util";

const RENDER_STACK_REPO_ROOT = getNebullaPersistRoot();
const RENDER_STACK_NEBULA_PROJECT = getNebulaProjectDocsRoot(RENDER_STACK_REPO_ROOT);

const scryptAsync = promisify(crypto.scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored || typeof stored !== "string") return false;
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, hashHex] = parts;
  try {
    const derived = (await scryptAsync(password, salt, 64)) as Buffer;
    const expected = Buffer.from(hashHex, "hex");
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

function hashResetToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email: unknown): string | null {
  if (typeof email !== "string") return null;
  const t = email.trim().toLowerCase();
  if (!t || t.length > 254 || !EMAIL_RE.test(t)) return null;
  return t;
}

const USERNAME_RE = /^[a-z0-9][a-z0-9_-]{2,31}$/;
const USERNAME_RESERVED = new Set([
  "admin",
  "root",
  "system",
  "api",
  "null",
  "undefined",
  "nebulla",
  "support",
  "www",
]);

/** Sign-up / username-password login identifier (no email required). */
function normalizeUsername(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().toLowerCase();
  if (!t || t.length > 32 || !USERNAME_RE.test(t)) return null;
  if (USERNAME_RESERVED.has(t)) return null;
  return t;
}

function validateNewPassword(password: unknown): string | null {
  if (typeof password !== "string" || !password.length) return "Password is required.";
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (password.length > 8192) return "Password is too long.";
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return "Password must include at least one letter and one number.";
  }
  return null;
}

async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim() || "onboarding@resend.dev";
  if (!key) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[nebula] Password reset link (set RESEND_API_KEY to email users in production):", resetUrl);
    }
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [to],
        subject: "Reset your nebulla password",
        html: `<p>We received a request to reset your nebulla password.</p><p><a href="${resetUrl.replace(/"/g, "&quot;")}">Set a new password</a> (link expires in one hour).</p><p>If you did not request this, you can ignore this email.</p>`,
      }),
    });
    if (!res.ok) {
      console.error("[nebula] Resend failed:", await res.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error("[nebula] Resend error:", e);
    return false;
  }
}

const SESSION_COOKIE = "nebula_session";
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const OAUTH_REMEMBER_COOKIE = "oauth_remember";

let pool: pg.Pool | null = null;
/** Active platform DB (Postgres pool or D1 queryable). */
let platformDb: PlatformQueryable | null = null;
let dbReady = false;
/** After a failed schema/connect init, throttle retries (avoids connect storms on bad URLs). */
let poolInitFailed = false;
let lastPoolRetryAt = 0;
const POOL_RETRY_COOLDOWN_MS = 30_000;
let dbRetryInFlight: Promise<boolean> | null = null;
/** Connection string that successfully opened (may differ from raw env after region rewrite). */
let activeDatabaseUrl: string | null = null;
/** Safe, non-secret hint for operators / login UI. */
let lastDbFailureHint = "";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const RENDER_PG_REGIONS = ["frankfurt", "oregon", "ohio", "singapore", "virginia"] as const;

function hasDb(): boolean {
  if (getPlatformDbDriver() === "d1") {
    return Boolean(platformDb && dbReady && isPlatformD1Ready());
  }
  return Boolean(pool && dbReady && platformDb);
}

/** Active platform DB for route handlers (Postgres or D1). */
function requireDbPool(): PlatformQueryable {
  if (!platformDb || !dbReady) {
    throw new Error("Database not configured");
  }
  return platformDb;
}

function pgErrorCode(err: unknown): string | undefined {
  return typeof err === "object" && err !== null && "code" in err
    ? String((err as { code?: unknown }).code)
    : undefined;
}

/** Best-effort host hint for logs (does not print password). */
function describeDatabaseUrlHost(url: string): string {
  const m = url.match(/@([^/?#:]+)(?::(\d+))?/);
  if (!m?.[1]) return "(could not parse host from DATABASE_URL)";
  const host = m[1];
  const port = m[2] || "5432";
  if (!host.includes(".") && /^dpg-[a-z0-9-]+$/i.test(host)) {
    return `${host}:${port} — hostname looks truncated; Render external URLs end with .<region>-postgres.render.com`;
  }
  return `${host}:${port}`;
}

function databaseUrlHostOnly(raw: string): string {
  const m = raw.trim().match(/@([^/?#:]+)/);
  return m?.[1] || "";
}

function isTruncatedRenderPgHost(host: string): boolean {
  return Boolean(host && !host.includes(".") && /^dpg-[a-z0-9-]+$/i.test(host));
}

function withRenderPgRegion(raw: string, region: string): string {
  const url = raw.trim();
  const m = url.match(/@(dpg-[a-z0-9-]+)(?::(\d+))?(\/|$)/i);
  if (!m?.[1]) return url;
  const port = m[2] ? `:${m[2]}` : "";
  const suffix = m[3] || "/";
  return url.replace(`@${m[1]}${port}${suffix}`, `@${m[1]}.${region}-postgres.render.com${port}${suffix}`);
}

/**
 * Render Internal URLs use a short host (`dpg-…-a`) that only resolves on Render's private network.
 * External URLs need `.<region>-postgres.render.com`. Prefer raw first (works on Render), then regions.
 */
function candidateDatabaseUrls(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (u: string) => {
    if (!u || seen.has(u)) return;
    seen.add(u);
    out.push(u);
  };

  push(trimmed);

  const host = databaseUrlHostOnly(trimmed);
  if (isTruncatedRenderPgHost(host)) {
    const preferred =
      process.env.DATABASE_RENDER_REGION?.trim() ||
      process.env.RENDER_POSTGRES_REGION?.trim() ||
      "";
    const regions = [preferred, ...RENDER_PG_REGIONS].filter(
      (r, i, arr) => Boolean(r) && arr.indexOf(r) === i,
    );
    for (const region of regions) {
      push(withRenderPgRegion(trimmed, region));
    }
  }
  return out;
}

/** Legacy helper — prefer candidateDatabaseUrls. */
function normalizeDatabaseUrl(raw: string): string {
  const host = databaseUrlHostOnly(raw);
  if (!isTruncatedRenderPgHost(host)) return raw.trim();
  const region =
    process.env.DATABASE_RENDER_REGION?.trim() ||
    process.env.RENDER_POSTGRES_REGION?.trim() ||
    "frankfurt";
  return withRenderPgRegion(raw, region);
}

function createPgPool(connectionString: string): pg.Pool {
  const p = new pg.Pool({
    connectionString,
    ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
    max: 10,
    connectionTimeoutMillis: 12000,
  });
  p.on("connect", (client) => {
    void client.query("SET search_path TO public");
  });
  p.on("error", (err) => {
    console.error("[nebula] PostgreSQL pool error:", err);
  });
  return p;
}

async function endPoolQuiet(p: pg.Pool | null) {
  if (!p) return;
  try {
    await p.end();
  } catch {
    /* ignore */
  }
}

/**
 * Ensure platform DB is ready (Postgres or D1 per PLATFORM_DB_DRIVER).
 * Postgres: retries after boot failure with cooldown; tries Internal then External hosts when truncated.
 * D1: applies migrations/platform-d1 schema via Cloudflare API.
 */
export async function ensureDbReady(): Promise<boolean> {
  if (hasDb()) return true;

  if (getPlatformDbDriver() === "d1") {
    if (dbRetryInFlight) return dbRetryInFlight;
    dbRetryInFlight = (async () => {
      registerNebulaPgPool(null);
      registerPlatformQueryable(null);
      platformDb = null;
      pool = null;
      dbReady = false;
      const ok = await ensurePlatformD1Ready();
      if (ok) {
        platformDb = createPlatformD1Queryable();
        registerPlatformQueryable(platformDb);
        dbReady = true;
        poolInitFailed = false;
        lastDbFailureHint = "";
        return true;
      }
      poolInitFailed = didPlatformD1InitFail();
      lastDbFailureHint = getPlatformD1FailureHint();
      dbReady = false;
      return false;
    })().finally(() => {
      dbRetryInFlight = null;
    });
    return dbRetryInFlight;
  }

  const rawUrl = process.env.DATABASE_URL?.trim();
  if (!rawUrl) return false;
  const now = Date.now();
  if (poolInitFailed && now - lastPoolRetryAt < POOL_RETRY_COOLDOWN_MS) return false;
  if (dbRetryInFlight) return dbRetryInFlight;

  dbRetryInFlight = (async () => {
    lastPoolRetryAt = Date.now();
    poolInitFailed = false;
    dbReady = false;
    registerNebulaPgPool(null);
    registerPlatformQueryable(null);
    platformDb = null;
    await endPoolQuiet(pool);
    pool = null;
    activeDatabaseUrl = null;

    const candidates = candidateDatabaseUrls(rawUrl);
    const errors: string[] = [];

    for (const url of candidates) {
      const hostHint = describeDatabaseUrlHost(url);
      const bootPool = createPgPool(url);
      try {
        await ensureTables(bootPool);
        pool = bootPool;
        platformDb = bootPool;
        activeDatabaseUrl = url;
        dbReady = true;
        poolInitFailed = false;
        lastDbFailureHint = "";
        registerNebulaPgPool(bootPool);
        registerPlatformQueryable(bootPool);
        console.log("[nebula] PostgreSQL schema ready via", hostHint);
        return true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const code = pgErrorCode(e) || (e as { code?: string })?.code || "";
        errors.push(`${hostHint}: ${code || msg.slice(0, 80)}`);
        console.warn("[nebula] PostgreSQL candidate failed:", hostHint, code || msg.slice(0, 120));
        await endPoolQuiet(bootPool);
      }
    }

    console.error("[nebula] PostgreSQL init failed for all DATABASE_URL candidates.");
    console.warn("[nebula] Tried:", errors.join(" | "));
    console.warn(
      "[nebula] CF-native path: set PLATFORM_DB_DRIVER=d1 + PLATFORM_D1_DATABASE_ID (see docs/migration/render-to-cloudflare.md). Legacy Postgres: use a full host URL. Truncated @dpg-…-a/dbname will fail.",
    );

    const host = databaseUrlHostOnly(rawUrl);
    if (isTruncatedRenderPgHost(host)) {
      lastDbFailureHint =
        "DATABASE_URL hostname is truncated (dpg-… with no domain) or the Postgres instance no longer exists. Prefer PLATFORM_DB_DRIVER=d1 for Cloudflare migration, or paste a full Postgres URL — then restart. See docs/migration/render-to-cloudflare.md.";
    } else {
      lastDbFailureHint =
        "PostgreSQL did not connect. Prefer PLATFORM_DB_DRIVER=d1 for Cloudflare migration, or fix DATABASE_URL — then restart. See docs/migration/render-to-cloudflare.md.";
    }

    dbReady = false;
    poolInitFailed = true;
    registerNebulaPgPool(null);
    registerPlatformQueryable(null);
    platformDb = null;
    pool = null;
    activeDatabaseUrl = null;
    return false;
  })().finally(() => {
    dbRetryInFlight = null;
  });

  return dbRetryInFlight;
}

function getPlatformDbOrNull(): PlatformQueryable | null {
  if (hasDb()) return platformDb;
  return null;
}

export function getRenderPublicConfig() {
  const driver = getPlatformDbDriver();
  const urlConfigured = Boolean(process.env.DATABASE_URL?.trim());
  const d1Configured = isPlatformD1Configured();
  const db = hasDb();
  const host = databaseUrlHostOnly(process.env.DATABASE_URL || "");
  const d1Fail = driver === "d1" && (didPlatformD1InitFail() || (d1Configured && !db));
  const pgFail = driver === "postgres" && urlConfigured && poolInitFailed;
  const publicSite = (process.env.PUBLIC_SITE_URL || "").trim().replace(/\/$/, "");
  return {
    cloudStorageReady: db,
    credentialsAuthReady: db,
    /** @deprecated use credentialsAuthReady */
    emailAuthReady: db,
    platformDbDriver: driver,
    platformD1Configured: d1Configured,
    platformD1DatabaseIdHint: resolvePlatformD1DatabaseId()
      ? `${resolvePlatformD1DatabaseId().slice(0, 8)}…`
      : "",
    /** True when configured platform DB failed to initialize. */
    databaseConnectionFailed: d1Fail || pgFail,
    databaseUrlConfigured: urlConfigured,
    /** Hostname looks like a Render Internal id without .<region>-postgres.render.com */
    databaseUrlLooksTruncated: driver === "postgres" && isTruncatedRenderPgHost(host),
    /** Safe operator hint (never includes password). */
    databaseFailureHint: d1Fail || pgFail ? lastDbFailureHint || getPlatformD1FailureHint() : "",
    databaseHostHint:
      driver === "d1"
        ? d1Configured
          ? "cloudflare-d1"
          : ""
        : host
          ? isTruncatedRenderPgHost(host)
            ? `${host} (truncated — needs .<region>-postgres.render.com)`
            : host.replace(/^([^.]+)\..+$/, "$1.***")
          : "",
    githubOAuthReady: Boolean(
      process.env.GITHUB_CLIENT_ID?.trim() && process.env.GITHUB_CLIENT_SECRET?.trim()
    ),
    githubClientIdConfigured: Boolean(process.env.GITHUB_CLIENT_ID?.trim()),
    githubClientSecretConfigured: Boolean(process.env.GITHUB_CLIENT_SECRET?.trim()),
    /** Google OAuth intentionally disabled — product uses GitHub + email only. */
    googleOAuthReady: false,
    googleClientIdConfigured: false,
    googleClientSecretConfigured: false,
    /** Always true after Phase 3 — isolation ids are synthetic `cfproj_…` (no Render Projects API). */
    syntheticWorkspaceIdsReady: true,
    /**
     * @deprecated Phase 3 — always false. Was true when RENDER_API_KEY created Render Projects.
     * Use syntheticWorkspaceIdsReady.
     */
    renderWorkspaceApiReady: false,
    /** Cloudflare D1 auto-provision for user app DBs (needs CLOUDFLARE_API_TOKEN + account id). */
    d1ProvisioningReady: isD1ProvisioningConfigured(),
    /**
     * Phase 6 — suggested GitHub/Google callback URLs to register (operator checklist).
     * GitHub classic OAuth Apps allow only one callback; see docs/migration/phase-6-oauth.md.
     */
    oauthCallbackPaths: {
      github: "/api/auth/github/callback",
      google: "/api/auth/google/callback",
    },
    oauthCallbackUrlsSuggested: {
      nebullaDev: publicSite.includes("nebulla.dev")
        ? {
            github: `${publicSite}/api/auth/github/callback`,
            google: `${publicSite}/api/auth/google/callback`,
          }
        : {
            github: "https://nebulla.dev/api/auth/github/callback",
            google: "https://nebulla.dev/api/auth/google/callback",
          },
      renderLive: {
        github: "https://nebulla-v4-main.onrender.com/api/auth/github/callback",
        google: "https://nebulla-v4-main.onrender.com/api/auth/google/callback",
      },
      localDev: {
        github: "http://localhost:3000/api/auth/github/callback",
        google: "http://localhost:3000/api/auth/google/callback",
      },
    },
  };
}

async function ensureTables(p: pg.Pool) {
  await p.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);
  await p.query(`SET search_path TO public`);
  await p.query(`
    CREATE TABLE IF NOT EXISTS public.nebula_users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      provider TEXT NOT NULL,
      provider_user_id TEXT NOT NULL,
      email TEXT,
      display_name TEXT,
      avatar_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(provider, provider_user_id)
    );
  `);
  await p.query(`
    CREATE TABLE IF NOT EXISTS public.nebula_projects (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES public.nebula_users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      pages JSONB NOT NULL DEFAULT '[]',
      edges JSONB NOT NULL DEFAULT '[]',
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, name)
    );
  `);
  await p.query(`CREATE INDEX IF NOT EXISTS idx_nebula_projects_user ON public.nebula_projects(user_id);`);
  await p.query(`ALTER TABLE public.nebula_projects ADD COLUMN IF NOT EXISTS workspace_id TEXT;`);
  await p.query(`ALTER TABLE public.nebula_projects ADD COLUMN IF NOT EXISTS d1_database_id TEXT;`);
  await p.query(`ALTER TABLE public.nebula_projects ADD COLUMN IF NOT EXISTS d1_database_name TEXT;`);
  await p.query(`
    CREATE TABLE IF NOT EXISTS public.nebula_client_workspaces (
      user_id UUID PRIMARY KEY REFERENCES public.nebula_users(id) ON DELETE CASCADE,
      email TEXT,
      workspace_id TEXT NOT NULL UNIQUE,
      workspace_name TEXT NOT NULL,
      render_payload JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await p.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_nebula_client_workspaces_email_lower
     ON nebula_client_workspaces (LOWER(email))
     WHERE email IS NOT NULL;`
  );
  await p.query(`ALTER TABLE public.nebula_users ADD COLUMN IF NOT EXISTS password_hash TEXT;`);
  await p.query(`
    CREATE TABLE IF NOT EXISTS public.nebula_password_resets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES public.nebula_users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await p.query(
    `CREATE INDEX IF NOT EXISTS idx_nebula_pw_reset_token ON public.nebula_password_resets(token_hash);`
  );
  await p.query(
    `CREATE INDEX IF NOT EXISTS idx_nebula_pw_reset_expires ON public.nebula_password_resets(expires_at);`
  );
  await p.query(
    `ALTER TABLE public.nebula_users ADD COLUMN IF NOT EXISTS billing_tier TEXT NOT NULL DEFAULT 'free';`
  );
  await p.query(`
    CREATE TABLE IF NOT EXISTS public.nebula_token_usage_monthly (
      user_id UUID NOT NULL REFERENCES public.nebula_users(id) ON DELETE CASCADE,
      month_year TEXT NOT NULL,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      grok3_tokens INTEGER NOT NULL DEFAULT 0,
      grok4_tokens INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, month_year)
    );
  `);
  await p.query(
    `CREATE INDEX IF NOT EXISTS idx_nebula_token_usage_month ON public.nebula_token_usage_monthly (month_year);`
  );
  await p.query(`ALTER TABLE public.nebula_users ADD COLUMN IF NOT EXISTS grok_api_key_encrypted TEXT;`);
  await p.query(`ALTER TABLE public.nebula_users ADD COLUMN IF NOT EXISTS grok_key_validated_at TIMESTAMPTZ;`);
  await p.query(`ALTER TABLE public.nebula_users ADD COLUMN IF NOT EXISTS anthropic_api_key_encrypted TEXT;`);
  await p.query(`ALTER TABLE public.nebula_users ADD COLUMN IF NOT EXISTS anthropic_key_validated_at TIMESTAMPTZ;`);
  await p.query(`ALTER TABLE public.nebula_users ADD COLUMN IF NOT EXISTS openai_api_key_encrypted TEXT;`);
  await p.query(`ALTER TABLE public.nebula_users ADD COLUMN IF NOT EXISTS openai_key_validated_at TIMESTAMPTZ;`);
}

function sessionSecret(): string {
  const s = process.env.SESSION_SECRET?.trim();
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production") {
    // assertProductionSecretsOrExit() should have already stopped boot.
    throw new Error("SESSION_SECRET missing or too short in production");
  }
  return process.env.SESSION_SECRET || "dev-only-nebula-session-change-me";
}

type JwtPayload = { uid: string; v: 1 };

function signSession(uid: string): string {
  return jwt.sign({ uid, v: 1 } as JwtPayload, sessionSecret(), { expiresIn: "30d" });
}

function readSession(req: Request): string | null {
  const raw = req.cookies?.[SESSION_COOKIE];
  if (!raw || typeof raw !== "string") return null;
  try {
    const p = jwt.verify(raw, sessionSecret()) as JwtPayload;
    if (p?.v === 1 && typeof p.uid === "string") return p.uid;
  } catch {
    /* invalid */
  }
  return null;
}

/** Exported for main Grok resolution in `server.ts` (session-scoped user key override). */
export function readNebulaSessionUserId(req: Request): string | null {
  return readSession(req);
}

function requestDerivedBaseUrl(req: Request): string | null {
  const forwardedHost = (req.get("x-forwarded-host") || "").split(",")[0]?.trim();
  const host = (req.get("host") || "").trim();
  const finalHost = forwardedHost || host;
  const forwardedProto = (req.get("x-forwarded-proto") || "").split(",")[0]?.trim();
  const proto = forwardedProto || (req.protocol === "https" ? "https" : "http");
  if (finalHost) return `${proto}://${finalHost}`.replace(/\/$/, "");
  return null;
}

function publicBaseUrl(req: Request): string {
  // Admin-configured canonical origin (emails, production SPA links).
  const explicit = process.env.PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const fromReq = requestDerivedBaseUrl(req);
  if (fromReq) return fromReq;

  return `http://localhost:${process.env.PORT || 3000}`;
}

/**
 * OAuth redirect_uri base must match the host the browser hit AND an allowed callback
 * registered on the OAuth provider.
 *
 * Phase 6–7 (pre-cutover): prefer the request Host so Render (`*.onrender.com`),
 * Cloudflare staging (`*.workers.dev`), and later `nebulla.dev` each work when that
 * host’s callback is registered for the OAuth app used by that deployment.
 *
 * GitHub classic OAuth Apps allow only ONE callback URL — use separate OAuth apps
 * per environment, or switch the single URL at Phase 7 cutover (see migration docs).
 */
function oauthRedirectBase(req: Request): string {
  const fromReq = requestDerivedBaseUrl(req);
  if (fromReq) return fromReq;
  if (process.env.NODE_ENV !== "production") {
    return `http://localhost:${process.env.PORT || 3000}`;
  }
  return publicBaseUrl(req);
}

/** @deprecated use oauthRedirectBase */
function githubOAuthRedirectBase(req: Request): string {
  return oauthRedirectBase(req);
}

function sessionCookieSecure(): boolean {
  return process.env.NODE_ENV === "production";
}

function sessionCookieBaseOptions(): Record<string, unknown> {
  return {
    httpOnly: true,
    secure: sessionCookieSecure(),
    sameSite: "lax" as const,
    path: "/",
  };
}

/**
 * Persist session as httpOnly cookie.
 * `remember=true` (Stay signed in) → 30-day Max-Age so login survives browser restart.
 * `remember=false` → session cookie (survives refresh, ends when browser closes).
 */
function setSessionCookie(res: Response, token: string, remember: boolean) {
  const cookieOptions: Record<string, unknown> = {
    ...sessionCookieBaseOptions(),
  };
  if (remember) cookieOptions.maxAge = SESSION_MAX_AGE_MS;
  res.cookie(SESSION_COOKIE, token, cookieOptions);
}

function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, sessionCookieBaseOptions());
}

/** Parse Stay-signed-in flag; default true when omitted so logins persist across refresh. */
function parseRememberFlag(raw: unknown): boolean {
  if (raw === false || raw === 0 || raw === "0" || raw === "false") return false;
  if (raw === true || raw === 1 || raw === "1" || raw === "true") return true;
  return true;
}

function setNoStoreAuthHeaders(res: Response) {
  res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Vary", "Cookie");
}

/**
 * @deprecated Phase 3+: Nebulla no longer creates Render Projects for isolation.
 * New projects use synthetic `cfproj_` ids via provisionWorkspaceForNewProject.
 */

/**
 * Create Cloudflare D1 for the user's app (one DB per Nebulla project).
 * Never throws — project creation continues if D1 fails.
 * Stores uuid/name on nebula_projects and writes .env.d1 into the project workspace.
 */
async function provisionAndPersistD1ForProject(
  db: PlatformQueryable,
  uid: string,
  projectName: string,
  workspaceId: string
): Promise<{ d1DatabaseId: string | null; d1DatabaseName: string | null; d1Error: string | null }> {
  const existing = await db.query(
    `SELECT d1_database_id, d1_database_name FROM public.nebula_projects
     WHERE user_id = $1::uuid AND name = $2`,
    [uid, projectName]
  );
  const row = existing.rows[0] as { d1_database_id?: string | null; d1_database_name?: string | null } | undefined;
  const already = row?.d1_database_id != null ? String(row.d1_database_id).trim() : "";
  if (already) {
    return {
      d1DatabaseId: already,
      d1DatabaseName: row?.d1_database_name != null ? String(row.d1_database_name) : null,
      d1Error: null,
    };
  }

  const diskKey = sanitizeProjectKey(workspaceId);
  const result: D1ProvisionResult = await provisionD1ForNebulaProject({
    repoRoot: RENDER_STACK_REPO_ROOT,
    nebulaProjectTemplateRoot: RENDER_STACK_NEBULA_PROJECT,
    projectName,
    projectDiskKey: diskKey,
  });

  if (result.ok === false) {
    return { d1DatabaseId: null, d1DatabaseName: null, d1Error: result.error };
  }

  await db.query(
    `UPDATE public.nebula_projects
     SET d1_database_id = $1, d1_database_name = $2, updated_at = NOW()
     WHERE user_id = $3::uuid AND name = $4
       AND (d1_database_id IS NULL OR TRIM(d1_database_id) = '')`,
    [result.database.uuid, result.database.name, uid, projectName]
  );

  console.log(
    `[nebula] Linked D1 ${result.database.uuid} to project "${projectName}" (user=${uid.slice(0, 8)}…)`
  );

  return {
    d1DatabaseId: result.database.uuid,
    d1DatabaseName: result.database.name,
    d1Error: null,
  };
}

/**
 * One isolation id per Nebulla project (stored on `nebula_projects.workspace_id`).
 * Phase 3: always synthetic `cfproj_<uuid>` — never calls Render Projects API.
 */
function provisionWorkspaceForNewProject(projectName: string): { id: string; name: string } {
  const shortId = crypto.randomBytes(4).toString("hex");
  const safe =
    projectName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32) || "project";
  const workspaceName = `nebulla-${safe}-${shortId}`.slice(0, 63);
  const id = `cfproj_${crypto.randomUUID().replace(/-/g, "")}`;
  return { id, name: workspaceName };
}

/**
 * Disk + API scope key: authenticated users resolve from DB (`workspace_id` for that project name);
 * anonymous uses `projectKey` from the request.
 */
export async function resolveNebulaProjectDiskKey(req: Request): Promise<string> {
  const fallback = sanitizeProjectKey(getProjectKeyFromRequest(req as Request));
  const uid = readSession(req);
  const q = req.query as Record<string, unknown>;
  const body = (req.body || {}) as { projectName?: unknown };
  const headerPn = req.headers["x-nebula-project-name"];
  const projectName =
    (typeof q?.projectName === "string" && q.projectName.trim()) ||
    (typeof headerPn === "string" && headerPn.trim()) ||
    (typeof body?.projectName === "string" && body.projectName.trim()) ||
    "";
  const dbHandle = getPlatformDbOrNull();
  if (!uid || !projectName || !dbHandle || !dbReady) return fallback;
  try {
    const r = await dbHandle.query(
      `SELECT workspace_id FROM public.nebula_projects WHERE user_id = $1::uuid AND name = $2`,
      [uid, projectName]
    );
    let wid = r.rows[0]?.workspace_id as string | undefined;
    if (!wid) {
      const rw = provisionWorkspaceForNewProject(projectName);
      wid = rw.id;
      await dbHandle.query(
        `UPDATE public.nebula_projects SET workspace_id = $1, updated_at = NOW()
         WHERE user_id = $2::uuid AND name = $3 AND (workspace_id IS NULL OR workspace_id = '')`,
        [wid, uid, projectName]
      );
      void provisionAndPersistD1ForProject(dbHandle, uid, projectName, wid).catch((e) => {
        console.warn("[nebula] D1 on disk-key resolve:", e);
      });
    }
    return wid ? sanitizeProjectKey(wid) : fallback;
  } catch (e) {
    console.warn("[nebula] resolveNebulaProjectDiskKey:", e);
    return fallback;
  }
}

export async function mountRenderStack(app: Express) {
  app.use(cookieParser() as any);

  dbReady = false;
  platformDb = null;
  registerNebulaPgPool(null);
  registerPlatformQueryable(null);
  if (getPlatformDbDriver() === "d1") {
    await ensureDbReady();
  } else if (process.env.DATABASE_URL?.trim()) {
    await ensureDbReady();
  }

  const ensureInitialProjectForUser = async (uid: string, preferredName?: string): Promise<void> => {
    const db = requireDbPool();
    const current = await db.query(
      `SELECT COUNT(*)::int AS count FROM public.nebula_projects WHERE user_id = $1::uuid`,
      [uid]
    );
    const count = Number((current.rows[0] as { count?: number })?.count || 0);
    if (count > 0) return;

    const projectName = (preferredName || "").trim() || "Untitled Project";
    const workspace = provisionWorkspaceForNewProject(projectName);
    const projectId = crypto.randomUUID();
    await db.query(
      `INSERT INTO public.nebula_projects (id, user_id, name, pages, edges, workspace_id, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, '[]'::jsonb, '[]'::jsonb, $4, NOW())
       ON CONFLICT (user_id, name) DO NOTHING`,
      [projectId, uid, projectName, workspace.id]
    );
    try {
      await provisionAndPersistD1ForProject(db, uid, projectName, workspace.id);
    } catch (e) {
      console.warn("[nebula] D1 provision after initial project:", e);
    }
  };

  /** Never block sign-in when first-project seeding fails (Render API / schema edge cases). */
  const ensureInitialProjectForUserSafe = async (uid: string, preferredName?: string): Promise<void> => {
    try {
      await ensureInitialProjectForUser(uid, preferredName);
    } catch (e) {
      console.error("[nebula] ensureInitialProjectForUser:", e);
    }
  };

  const authDbErrorResponse = (res: Response, label: string, err: unknown) => {
    const code = pgErrorCode(err);
    console.error(`[nebula] ${label}:`, err);
    if (code === "42P01") {
      return res.status(503).json({
        error: "Database schema is not ready. Redeploy the server or run PostgreSQL migrations.",
      });
    }
    if (code === "ECONNREFUSED" || code === "57P01" || code === "08006") {
      return res.status(503).json({ error: "Database temporarily unavailable. Try again in a moment." });
    }
    return res.status(500).json({ error: `${label} failed.` });
  };

  type ProjectListRow = {
    name: string;
    pages: unknown;
    edges: unknown;
    workspace_id: string | null;
    d1_database_id: string | null;
    d1_database_name: string | null;
    updated_at: string;
  };

  const backfillMissingWorkspaceIds = async (uid: string, rows: ProjectListRow[]): Promise<void> => {
    if (!hasDb()) return;
    const db = requireDbPool();
    for (const row of rows) {
      let wid = row.workspace_id != null ? String(row.workspace_id).trim() : "";
      if (!wid) {
        const rw = provisionWorkspaceForNewProject(row.name);
        await db.query(
          `UPDATE public.nebula_projects SET workspace_id = $1, updated_at = NOW() WHERE user_id = $2::uuid AND name = $3`,
          [rw.id, uid, row.name]
        );
        row.workspace_id = rw.id;
        wid = rw.id;
      }
      const d1id = row.d1_database_id != null ? String(row.d1_database_id).trim() : "";
      if (!d1id && wid) {
        try {
          const d1 = await provisionAndPersistD1ForProject(db, uid, row.name, wid);
          row.d1_database_id = d1.d1DatabaseId;
          row.d1_database_name = d1.d1DatabaseName;
        } catch (e) {
          console.warn("[nebula] D1 backfill:", e);
        }
      }
    }
  };

  const runProjectManagerSilently = async (
    db: PlatformQueryable,
    uid: string,
    opts: { projectName?: string; grokApiKey?: string; syncAllProjects?: boolean }
  ): Promise<{
    grokSaved: boolean;
    renderTouched: boolean;
    usage: {
      monthYear: string;
      used: number;
      grok3Tokens: number;
      grok4Tokens: number;
      tier: string;
      limit: number | null;
      remaining: number | null;
    } | null;
  }> => {
    let grokSaved = false;
    let renderTouched = false;
    if (opts.grokApiKey && opts.grokApiKey.length >= 20) {
      const r = await saveUserGrokApiKey(db, uid, opts.grokApiKey);
      grokSaved = r.ok;
    }
    if (opts.syncAllProjects) {
      const r = await db.query(
        `SELECT name, pages, edges, workspace_id, d1_database_id, d1_database_name, updated_at FROM public.nebula_projects WHERE user_id = $1::uuid ORDER BY updated_at DESC`,
        [uid]
      );
      const rows = r.rows as ProjectListRow[];
      await backfillMissingWorkspaceIds(uid, rows);
      renderTouched = rows.length > 0;
    } else if (opts.projectName?.trim()) {
      const r = await db.query(
        `SELECT name, pages, edges, workspace_id, d1_database_id, d1_database_name, updated_at FROM public.nebula_projects WHERE user_id = $1::uuid AND name = $2`,
        [uid, opts.projectName.trim()]
      );
      const rows = r.rows as ProjectListRow[];
      await backfillMissingWorkspaceIds(uid, rows);
      renderTouched = rows.some((x) => Boolean(x.workspace_id && String(x.workspace_id).trim()));
    }
    const snap = await getMonthlyUsageSnapshot(uid);
    const usage = snap
      ? {
          monthYear: snap.monthYear,
          used: snap.used,
          grok3Tokens: snap.grok3Tokens,
          grok4Tokens: snap.grok4Tokens,
          tier: snap.tier,
          limit: snap.limit,
          remaining: Number.isFinite(snap.remaining) ? snap.remaining : null,
        }
      : null;
    return { grokSaved, renderTouched, usage };
  };

  app.get("/api/health/db", async (_req, res) => {
    if (!hasDb()) {
      return res.status(503).json({ ok: false, error: "Database not configured" });
    }
    try {
      const db = requireDbPool();
      const r = await db.query(`SELECT 1 AS ok`);
      const users = await db.query(`SELECT to_regclass('public.nebula_users') AS users_table`);
      return res.json({
        ok: true,
        ping: r.rows[0]?.ok === 1,
        usersTable: Boolean(users.rows[0]?.users_table),
      });
    } catch (e) {
      console.error("[nebula] /api/health/db:", e);
      return res.status(500).json({
        ok: false,
        error: "Database query failed",
        code: pgErrorCode(e),
      });
    }
  });

  app.post("/api/control-plane/project-manager/run", async (req, res) => {
    const uid = readSession(req);
    if (!uid) return res.status(401).json({ error: "Unauthorized" });
    if (!hasDb()) return res.status(503).json({ error: "Database not configured" });
    const projectName = typeof req.body?.projectName === "string" ? req.body.projectName.trim() : "";
    const grokApiKey = typeof req.body?.grokApiKey === "string" ? req.body.grokApiKey.trim() : "";
    const syncAllProjects = Boolean(req.body?.syncAllProjects);
    try {
      const result = await runProjectManagerSilently(requireDbPool(), uid, {
        projectName,
        grokApiKey,
        syncAllProjects,
      });
      res.json({ ok: true, ...result });
    } catch (e) {
      console.error("[nebula] /api/control-plane/project-manager/run:", e);
      res.status(500).json({ ok: false, error: "project_manager_failed" });
    }
  });

  app.get("/api/auth/session", async (req, res) => {
    setNoStoreAuthHeaders(res);
    const uid = readSession(req);
    if (!uid) {
      return res.json({ user: null });
    }
    if (!UUID_RE.test(uid)) {
      clearSessionCookie(res);
      return res.json({ user: null });
    }
    // Valid JWT but DB not ready — still report signed-in so the client does not drop to guest.
    if (!hasDb()) {
      return res.json({
        user: {
          uid,
          displayName: null,
          email: null,
          photoURL: null,
          billingTier: "free",
        },
        dbUnavailable: true,
      });
    }
    try {
      const db = requireDbPool();
      const r = await db.query(
        `SELECT id, provider, provider_user_id, email, display_name, avatar_url, created_at,
                (password_hash IS NOT NULL) AS has_password,
                billing_tier
         FROM public.nebula_users WHERE id = $1::uuid`,
        [uid]
      );
      const row = r.rows[0] as {
        id: string;
        provider: string;
        provider_user_id: string;
        email: string | null;
        display_name: string | null;
        avatar_url: string | null;
        created_at: string;
        has_password: boolean;
        billing_tier: string;
      };
      if (!row) {
        clearSessionCookie(res);
        return res.json({ user: null });
      }
      const sessionEmail =
        row.provider === "username"
          ? row.display_name || row.provider_user_id
          : row.email || row.provider_user_id;
      res.json({
        user: {
          uid: row.id,
          displayName: row.display_name,
          email: sessionEmail,
          photoURL: row.avatar_url,
          provider: row.provider,
          providerUserId: row.provider_user_id,
          accountEmail: row.email,
          signedUpAt: row.created_at,
          hasPassword: Boolean(row.has_password),
          billingTier: row.billing_tier || "free",
        },
      });
    } catch (e) {
      console.error("[nebula] /api/auth/session:", e);
      res.status(500).json({ error: "Session lookup failed" });
    }
  });

  /** BYOK status — never returns full keys (configured + optional last-4 only). */
  app.get("/api/byok/status", async (req, res) => {
    setNoStoreAuthHeaders(res);
    const uid = readSession(req);
    if (!uid) {
      return res.status(401).json({ error: "Sign in to manage AI API keys on your account." });
    }
    if (!hasDb()) {
      return res.status(503).json({
        error: "Database unavailable — AI keys cannot be loaded from your account right now.",
        dbUnavailable: true,
      });
    }
    try {
      const db = requireDbPool();
      const status = await getUserByokStatus(db, uid);
      return res.json({
        ok: true,
        providers: status,
        hasAnyKey: hasAnyByokConfigured(status),
      });
    } catch (e) {
      console.error("[nebula] /api/byok/status:", e);
      return res.status(500).json({ error: "Could not load AI key status." });
    }
  });

  /** Save encrypted BYOK key for xai | anthropic | openai. */
  app.put("/api/byok/keys", async (req, res) => {
    setNoStoreAuthHeaders(res);
    const uid = readSession(req);
    if (!uid) {
      return res.status(401).json({ error: "Sign in to save AI API keys on your account." });
    }
    if (!hasDb()) {
      return res.status(503).json({
        error: "Database unavailable — cannot save encrypted keys. Try again shortly.",
        dbUnavailable: true,
      });
    }
    if (!byokRateLimitAllow(`byok-save:${uid}`)) {
      return res.status(429).json({ error: "Too many key updates. Wait a minute and try again." });
    }
    const body = (req.body || {}) as { provider?: string; apiKey?: string };
    const providerRaw = String(body.provider || "").trim().toLowerCase();
    if (!isByokProvider(providerRaw)) {
      return res.status(400).json({
        error: "provider must be one of: xai, anthropic, openai",
      });
    }
    const provider = providerRaw as ByokProvider;
    const apiKey = typeof body.apiKey === "string" ? body.apiKey : "";
    try {
      const db = requireDbPool();
      const saved = await saveUserByokApiKey(db, uid, provider, apiKey);
      if (!saved.ok) {
        return res.status(400).json({
          error: "That API key looks invalid. Paste the full key from the provider console.",
          code: saved.reason || "invalid_key",
        });
      }
      const status = await getUserByokStatus(db, uid);
      return res.json({
        ok: true,
        provider,
        configured: true,
        tail: status[provider].tail,
        providers: status,
      });
    } catch (e) {
      console.error("[nebula] /api/byok/keys PUT:", e);
      return res.status(500).json({ error: "Could not save AI API key." });
    }
  });

  /** Clear one BYOK provider key from the account. */
  app.delete("/api/byok/keys/:provider", async (req, res) => {
    setNoStoreAuthHeaders(res);
    const uid = readSession(req);
    if (!uid) {
      return res.status(401).json({ error: "Sign in to manage AI API keys." });
    }
    if (!hasDb()) {
      return res.status(503).json({ error: "Database unavailable.", dbUnavailable: true });
    }
    if (!byokRateLimitAllow(`byok-del:${uid}`, { max: 30, windowMs: 60_000 })) {
      return res.status(429).json({ error: "Too many key updates. Wait a minute and try again." });
    }
    const providerRaw = String(req.params.provider || "").trim().toLowerCase();
    if (!isByokProvider(providerRaw)) {
      return res.status(400).json({ error: "provider must be one of: xai, anthropic, openai" });
    }
    try {
      const db = requireDbPool();
      await clearUserByokApiKey(db, uid, providerRaw);
      const status = await getUserByokStatus(db, uid);
      return res.json({ ok: true, provider: providerRaw, providers: status });
    } catch (e) {
      console.error("[nebula] /api/byok/keys DELETE:", e);
      return res.status(500).json({ error: "Could not remove AI API key." });
    }
  });

  app.get("/api/billing/token-usage", async (req, res) => {
    const uid = readSession(req);
    if (!uid || !hasDb()) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    try {
      const snap = await getMonthlyUsageSnapshot(uid);
      if (!snap) {
        return res.json({
          tier: "free",
          monthYear: "",
          used: 0,
          grok3Tokens: 0,
          grok4Tokens: 0,
          limit: null,
          remaining: Number.POSITIVE_INFINITY,
        });
      }
      return res.json({
        tier: snap.tier,
        monthYear: snap.monthYear,
        used: snap.used,
        grok3Tokens: snap.grok3Tokens,
        grok4Tokens: snap.grok4Tokens,
        limit: snap.limit,
        remaining: Number.isFinite(snap.remaining) ? snap.remaining : null,
      });
    } catch (e) {
      console.error("[nebula] /api/billing/token-usage:", e);
      res.status(500).json({ error: "Token usage lookup failed" });
    }
  });

  app.post("/api/auth/logout", (_req, res) => {
    setNoStoreAuthHeaders(res);
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  /** Permanently delete the signed-in user and related rows (CASCADE) + conversation logs. */
  app.post("/api/auth/delete-account", async (req, res) => {
    const uid = readSession(req);
    if (!uid) return res.status(401).json({ error: "Unauthorized" });
    if (!hasDb()) return res.status(503).json({ error: "Database not configured" });
    const phrase = typeof req.body?.confirmation === "string" ? req.body.confirmation.trim() : "";
    if (phrase !== "DELETE MY ACCOUNT") {
      return res.status(400).json({ error: 'Type exactly: DELETE MY ACCOUNT' });
    }
    try {
      const db = requireDbPool();
      // CASCADE removes projects, password resets, token usage, BYOK ciphertext on user row, etc.
      await db.query(`DELETE FROM public.nebula_users WHERE id = $1::uuid`, [uid]);
      const logs = deleteConversationLogsForUser(uid);
      clearSessionCookie(res);
      return res.json({
        ok: true,
        conversation_logs_removed: logs.removed,
        note:
          "Account and cloud projects deleted. Browser localStorage/secrets are not cleared by the server — clear site data. Backups and provider logs may retain residual data for a limited time (see Privacy Policy).",
      });
    } catch (e) {
      console.error("[nebula] delete-account:", e);
      return res.status(500).json({ error: "Could not delete account." });
    }
  });

  /** GDPR-oriented account export (profile + projects metadata; never plaintext API keys). */
  app.get("/api/auth/data-export", async (req, res) => {
    const uid = readSession(req);
    if (!uid) return res.status(401).json({ error: "Unauthorized" });
    if (!hasDb()) return res.status(503).json({ error: "Database not configured" });
    try {
      const db = requireDbPool();
      const userR = await db.query(
        `SELECT id, provider, provider_user_id, email, display_name, avatar_url, billing_tier,
                created_at,
                (grok_api_key_encrypted IS NOT NULL AND length(trim(grok_api_key_encrypted)) > 0) AS has_xai_key,
                (anthropic_api_key_encrypted IS NOT NULL AND length(trim(anthropic_api_key_encrypted)) > 0) AS has_anthropic_key,
                (openai_api_key_encrypted IS NOT NULL AND length(trim(openai_api_key_encrypted)) > 0) AS has_openai_key
         FROM public.nebula_users WHERE id = $1::uuid`,
        [uid],
      );
      const row = userR.rows[0];
      if (!row) return res.status(404).json({ error: "User not found" });

      const projR = await db.query(
        `SELECT name, workspace_id, d1_database_id, d1_database_name, updated_at
         FROM public.nebula_projects WHERE user_id = $1::uuid ORDER BY updated_at DESC`,
        [uid],
      );

      const exportBody = {
        exported_at: new Date().toISOString(),
        export_version: 1,
        account: {
          id: row.id,
          provider: row.provider,
          provider_user_id: row.provider_user_id,
          email: row.email,
          display_name: row.display_name,
          avatar_url: row.avatar_url,
          billing_tier: row.billing_tier,
          created_at: row.created_at,
          byok_keys_present: {
            xai: Boolean(row.has_xai_key),
            anthropic: Boolean(row.has_anthropic_key),
            openai: Boolean(row.has_openai_key),
          },
        },
        projects: projR.rows.map((p) => ({
          name: p.name,
          workspace_id: p.workspace_id,
          d1_database_id: p.d1_database_id,
          d1_database_name: p.d1_database_name,
          updated_at: p.updated_at,
        })),
        conversation_logs: listConversationLogsForUser(uid),
        notes: [
          "API key values are never included in this export.",
          "Workspace source files on disk are not zipped in this version — contact support if you need a full file archive.",
          "Browser-only secrets (localStorage) are not included.",
        ],
      };

      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="nebulla-data-export-${uid.slice(0, 8)}.json"`,
      );
      return res.status(200).send(JSON.stringify(exportBody, null, 2));
    } catch (e) {
      console.error("[nebula] data-export:", e);
      return res.status(500).json({ error: "Could not export account data." });
    }
  });

  const githubApiHeaders = (token: string) => ({
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "Nebulla-OAuth/1.0",
  });

  // --- GitHub OAuth (any GitHub account — use a standard OAuth App, not org-locked SSO-only flows) ---
  app.get("/api/auth/github", async (req, res) => {
    if (!(await ensureDbReady())) return res.status(503).send("Database not configured");
    const id = process.env.GITHUB_CLIENT_ID?.trim();
    if (!id) return res.status(503).send("GITHUB_CLIENT_ID not configured");
    const redirectUri = `${oauthRedirectBase(req)}/api/auth/github/callback`;
    const state = crypto.randomBytes(16).toString("hex");
    const remember = parseRememberFlag(req.query.remember);
    const oauthCookieOpts = { ...sessionCookieBaseOptions(), maxAge: 600000 };
    res.cookie("oauth_state", state, oauthCookieOpts);
    res.cookie(OAUTH_REMEMBER_COOKIE, remember ? "1" : "0", oauthCookieOpts);
    const q = new URLSearchParams({
      client_id: id,
      redirect_uri: redirectUri,
      scope: "read:user user:email",
      state,
    });
    res.redirect(`https://github.com/login/oauth/authorize?${q}`);
  });

  app.get("/api/auth/github/callback", async (req, res) => {
    if (!(await ensureDbReady())) return res.status(503).send("Database not configured");
    const secret = process.env.GITHUB_CLIENT_SECRET?.trim();
    const id = process.env.GITHUB_CLIENT_ID?.trim();
    if (!secret || !id) return res.status(500).send("GitHub OAuth not configured");

    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const cookieState = req.cookies?.oauth_state;
    // Missing oauth_remember → stay signed in (matches checkbox default).
    const remember = req.cookies?.[OAUTH_REMEMBER_COOKIE] !== "0";
    res.clearCookie("oauth_state", sessionCookieBaseOptions());
    res.clearCookie(OAUTH_REMEMBER_COOKIE, sessionCookieBaseOptions());
    if (!code || !state || state !== cookieState) {
      return res.status(400).send("Invalid OAuth state");
    }

    const redirectUri = `${oauthRedirectBase(req)}/api/auth/github/callback`;
    try {
      const tokRes = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: id,
          client_secret: secret,
          code,
          redirect_uri: redirectUri,
        }),
      });
      const tokJson = (await tokRes.json()) as { access_token?: string; error?: string };
      if (!tokJson.access_token) {
        return res.status(400).send(tokJson.error || "GitHub token exchange failed");
      }
      const ghAccessToken = tokJson.access_token;
      const uRes = await fetch("https://api.github.com/user", {
        headers: githubApiHeaders(ghAccessToken),
      });
      const gh = (await uRes.json()) as {
        id: number;
        email?: string | null;
        name?: string | null;
        avatar_url?: string | null;
        login?: string;
      };
      const providerUserId = String(gh.id);
      let email = (gh.email && String(gh.email).trim()) || "";
      if (!email) {
        const emRes = await fetch("https://api.github.com/user/emails", {
          headers: githubApiHeaders(ghAccessToken),
        });
        const list = (await emRes.json()) as { email?: string; primary?: boolean; verified?: boolean }[];
        if (Array.isArray(list)) {
          const primary = list.find((e) => e.primary && e.email);
          const verified = list.find((e) => e.verified && e.email);
          const any = list.find((e) => e.email);
          email = (primary?.email || verified?.email || any?.email || "").trim();
        }
      }
      if (!email) {
        email = `${gh.login || "user"}@users.noreply.github.com`;
      }
      const display = gh.name || gh.login || "GitHub User";

      const db = requireDbPool();
      const userIdNew = crypto.randomUUID();
      const ins = await db.query(
        `INSERT INTO public.nebula_users (id, provider, provider_user_id, email, display_name, avatar_url, password_hash)
         VALUES ($1::uuid, 'github', $2, $3, $4, $5, NULL)
         ON CONFLICT (provider, provider_user_id) DO UPDATE
         SET email = EXCLUDED.email, display_name = EXCLUDED.display_name, avatar_url = EXCLUDED.avatar_url
         RETURNING id`,
        [userIdNew, providerUserId, email, display, gh.avatar_url || null]
      );
      const userId = ins.rows[0].id as string;
      await ensureInitialProjectForUserSafe(userId);
      const sessionJwt = signSession(userId);
      setSessionCookie(res, sessionJwt, remember);

      res.send(oauthPopupHtml(true, "Signed in with GitHub"));
    } catch (e) {
      console.error("[nebula] GitHub callback:", e);
      res.status(500).send(oauthPopupHtml(false, "GitHub sign-in failed"));
    }
  });

  // --- Google OAuth (disabled — product uses GitHub + email only) ---
  app.get("/api/auth/google", (_req, res) => {
    res.status(410).send("Google sign-in is disabled. Use GitHub or email.");
  });
  app.get("/api/auth/google/callback", (_req, res) => {
    res.status(410).send(oauthPopupHtml(false, "Google sign-in is disabled"));
  });

  // --- Register: email + password (frictionless) or legacy username + password ---
  app.post("/api/auth/register", async (req, res) => {
    setNoStoreAuthHeaders(res);
    if (!(await ensureDbReady())) return res.status(503).json({ error: "Database not configured" });
    const remember = parseRememberFlag(req.body?.remember);
    const emailAddr = normalizeEmail(req.body?.email);
    const rawPassword = req.body?.password;

    if (emailAddr && typeof rawPassword === "string") {
      const pwErr = validateNewPassword(rawPassword);
      if (pwErr) return res.status(400).json({ error: pwErr });
      const display = (emailAddr.split("@")[0] || "user").slice(0, 80);
      const preferredFirstProjectName =
        typeof req.body?.projectName === "string" && String(req.body.projectName).trim()
          ? String(req.body.projectName).trim()
          : undefined;
      try {
        const db = requireDbPool();
        const hash = await hashPassword(rawPassword);
        const userIdNew = crypto.randomUUID();
        const ins = await db.query(
          `INSERT INTO public.nebula_users (id, provider, provider_user_id, email, display_name, avatar_url, password_hash)
           VALUES ($1::uuid, 'email', $2, $3, $4, NULL, $5)
           RETURNING id`,
          [userIdNew, emailAddr, emailAddr, display, hash]
        );
        const userId = ins.rows[0].id as string;
        await ensureInitialProjectForUserSafe(userId, preferredFirstProjectName);
        setSessionCookie(res, signSession(userId), remember);
        return res.json({ ok: true });
      } catch (e: unknown) {
        const code = pgErrorCode(e);
        if (code === "23505") {
          return res.status(409).json({ error: "An account with this email already exists." });
        }
        return authDbErrorResponse(res, "Registration", e);
      }
    }

    const rawUser =
      typeof req.body?.username === "string"
        ? req.body.username
        : typeof req.body?.email === "string"
          ? req.body.email
          : "";
    const username = normalizeUsername(rawUser);
    const pwErr = validateNewPassword(req.body?.password);
    if (!username) {
      return res.status(400).json({
        error:
          "Use a valid email address and password, or a username (3–32 characters: letters, numbers, underscores, hyphens).",
      });
    }
    if (pwErr) return res.status(400).json({ error: pwErr });
    const password = req.body.password as string;
    const display = (typeof rawUser === "string" ? rawUser.trim() : username).slice(0, 80) || username;
    try {
      const db = requireDbPool();
      const hash = await hashPassword(password);
      const userIdNew = crypto.randomUUID();
      const ins = await db.query(
        `INSERT INTO public.nebula_users (id, provider, provider_user_id, email, display_name, avatar_url, password_hash)
         VALUES ($1::uuid, 'username', $2, NULL, $3, NULL, $4)
         RETURNING id`,
        [userIdNew, username, display, hash]
      );
      const userId = ins.rows[0].id as string;
      const preferredFirstProjectName =
        typeof req.body?.projectName === "string" ? req.body.projectName : undefined;
      await ensureInitialProjectForUserSafe(userId, preferredFirstProjectName);
      setSessionCookie(res, signSession(userId), remember);
      return res.json({ ok: true });
    } catch (e: unknown) {
      const code = pgErrorCode(e);
      if (code === "23505") {
        return res.status(409).json({ error: "That username is already taken." });
      }
      return authDbErrorResponse(res, "Registration", e);
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    setNoStoreAuthHeaders(res);
    if (!(await ensureDbReady())) return res.status(503).json({ error: "Database not configured" });
    const rawLogin =
      typeof req.body?.username === "string"
        ? req.body.username
        : typeof req.body?.email === "string"
          ? req.body.email
          : "";
    const password = req.body?.password;
    const remember = parseRememberFlag(req.body?.remember);
    if (!String(rawLogin).trim() || typeof password !== "string") {
      return res.status(400).json({ error: "Email and password are required." });
    }
    try {
      const db = requireDbPool();
      const u = normalizeUsername(rawLogin);
      let row: { id: string; password_hash: string | null } | undefined;
      if (u) {
        const r = await db.query(
          `SELECT id, password_hash FROM public.nebula_users WHERE provider = 'username' AND provider_user_id = $1`,
          [u]
        );
        row = r.rows[0] as { id: string; password_hash: string | null } | undefined;
      }
      if (!row) {
        const em = normalizeEmail(String(rawLogin).trim());
        if (em) {
          const r2 = await db.query(
            `SELECT id, password_hash FROM public.nebula_users WHERE provider = 'email' AND provider_user_id = $1`,
            [em]
          );
          row = r2.rows[0] as { id: string; password_hash: string | null } | undefined;
        }
      }
      if (!row?.password_hash || !(await verifyPassword(password, row.password_hash))) {
        return res.status(401).json({ error: "Invalid email or password." });
      }
      await ensureInitialProjectForUserSafe(row.id);
      setSessionCookie(res, signSession(row.id), remember);
      return res.json({ ok: true });
    } catch (e) {
      return authDbErrorResponse(res, "Login", e);
    }
  });

  app.post("/api/auth/forgot-password", async (req, res) => {
    if (!(await ensureDbReady())) return res.status(503).json({ error: "Database not configured" });
    const email = normalizeEmail(req.body?.email);
    if (!email) return res.status(400).json({ error: "Valid email is required." });
    try {
      const db = requireDbPool();
      const r = await db.query(
        `SELECT id FROM public.nebula_users WHERE provider = 'email' AND provider_user_id = $1`,
        [email]
      );
      const row = r.rows[0] as { id: string } | undefined;
      if (row) {
        const rawToken = crypto.randomBytes(32).toString("hex");
        const tokenHash = hashResetToken(rawToken);
        const expires = new Date(Date.now() + 60 * 60 * 1000);
        await db.query(
          `DELETE FROM public.nebula_password_resets WHERE user_id = $1::uuid AND used_at IS NULL`,
          [row.id]
        );
        await db.query(
          `INSERT INTO public.nebula_password_resets (id, user_id, token_hash, expires_at) VALUES ($1::uuid, $2::uuid, $3, $4)`,
          [crypto.randomUUID(), row.id, tokenHash, expires.toISOString()]
        );
        const base = publicBaseUrl(req);
        const resetUrl = `${base}/reset-password?token=${encodeURIComponent(rawToken)}`;
        await sendPasswordResetEmail(email, resetUrl);
      }
      return res.json({ ok: true });
    } catch (e) {
      console.error("[nebula] forgot-password:", e);
      return res.status(500).json({ error: "Request failed." });
    }
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    if (!(await ensureDbReady())) return res.status(503).json({ error: "Database not configured" });
    const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
    const pwErr = validateNewPassword(req.body?.password);
    if (!token || token.length < 20) return res.status(400).json({ error: "Invalid or missing reset token." });
    if (pwErr) return res.status(400).json({ error: pwErr });
    const password = req.body.password as string;
    const tokenHash = hashResetToken(token);
    try {
      const db = requireDbPool();
      const r = await db.query(
        `SELECT id, user_id FROM public.nebula_password_resets
         WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`,
        [tokenHash]
      );
      const row = r.rows[0] as { id: string; user_id: string } | undefined;
      if (!row) {
        return res.status(400).json({ error: "This reset link is invalid or has expired. Request a new one." });
      }
      const hash = await hashPassword(password);
      await db.query(`UPDATE public.nebula_users SET password_hash = $1 WHERE id = $2::uuid`, [hash, row.user_id]);
      await db.query(`UPDATE public.nebula_password_resets SET used_at = NOW() WHERE id = $1::uuid`, [row.id]);
      await db.query(`DELETE FROM public.nebula_password_resets WHERE user_id = $1::uuid AND id <> $2::uuid`, [
        row.user_id,
        row.id,
      ]);
      return res.json({ ok: true });
    } catch (e) {
      console.error("[nebula] reset-password:", e);
      return res.status(500).json({ error: "Password reset failed." });
    }
  });

  // --- Projects API ---
  app.get("/api/projects", async (req, res) => {
    setNoStoreAuthHeaders(res);
    const uid = readSession(req);
    if (!uid) return res.status(401).json({ error: "Unauthorized", projects: [] });
    if (!hasDb()) return res.status(503).json({ error: "Database not configured" });
    const oneName = typeof req.query.name === "string" ? req.query.name.trim() : "";
    try {
      const db = requireDbPool();
      if (oneName) {
        const r = await db.query(
          `SELECT name, pages, edges, workspace_id, d1_database_id, d1_database_name, updated_at FROM public.nebula_projects WHERE user_id = $1::uuid AND name = $2`,
          [uid, oneName]
        );
        const rows = r.rows as ProjectListRow[];
        await backfillMissingWorkspaceIds(uid, rows);
        return res.json({ projects: rows, project: rows[0] || null });
      }
      const r = await db.query(
        `SELECT name, pages, edges, workspace_id, d1_database_id, d1_database_name, updated_at FROM public.nebula_projects WHERE user_id = $1::uuid ORDER BY updated_at DESC`,
        [uid]
      );
      const rows = r.rows as ProjectListRow[];
      await backfillMissingWorkspaceIds(uid, rows);
      res.json({ projects: rows });
    } catch (e) {
      console.error("[nebula] GET /api/projects:", e);
      res.status(500).json({ error: "Failed to list projects" });
    }
  });

  app.post("/api/projects", async (req, res) => {
    setNoStoreAuthHeaders(res);
    const uid = readSession(req);
    if (!uid) return res.status(401).json({ error: "Unauthorized" });
    if (!hasDb()) return res.status(503).json({ error: "Database not configured" });
    const { name, pages, edges, replaceName } = req.body || {};
    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "name is required" });
    }
    try {
      const db = requireDbPool();
      const trimmed = name.trim();
      const renamingFrom =
        typeof replaceName === "string" && replaceName.trim() && replaceName.trim() !== trimmed
          ? replaceName.trim()
          : "";
      const existing = await db.query(
        `SELECT workspace_id, d1_database_id, d1_database_name, pages, edges FROM public.nebula_projects WHERE user_id = $1::uuid AND name = $2`,
        [uid, trimmed]
      );
      const hasExisting = Boolean(existing.rows[0]);
      if (!hasExisting) {
        const tierRow = await db.query(
          `SELECT billing_tier FROM public.nebula_users WHERE id = $1::uuid`,
          [uid],
        );
        const tier = String(tierRow.rows[0]?.billing_tier || "free")
          .trim()
          .toLowerCase();
        if (tier === "free" || !tier) {
          const countRow = await db.query(
            `SELECT COUNT(*)::int AS n FROM public.nebula_projects WHERE user_id = $1::uuid`,
            [uid],
          );
          const n = Number(countRow.rows[0]?.n || 0);
          let renameOk = false;
          if (renamingFrom && n >= 1) {
            const owns = await db.query(
              `SELECT 1 FROM public.nebula_projects WHERE user_id = $1::uuid AND name = $2 LIMIT 1`,
              [uid, renamingFrom],
            );
            renameOk = Boolean(owns.rows[0]);
          }
          if (n >= 1 && !renameOk) {
            return res.status(403).json({
              ok: false,
              code: "FREE_PROJECT_LIMIT",
              error:
                "Free plan allows 1 project. Delete your existing project, or upgrade on the Pricing page for more.",
            });
          }
        }
      }
      let workspaceId = existing.rows[0]?.workspace_id as string | undefined;
      if (!workspaceId || !String(workspaceId).trim()) {
        const rw = provisionWorkspaceForNewProject(trimmed);
        workspaceId = rw.id;
      }
      // Avoid wiping existing mind-map JSON when callers upsert with empty arrays on "create".
      const pagesJson =
        pages !== undefined && !(hasExisting && Array.isArray(pages) && pages.length === 0)
          ? JSON.stringify(pages)
          : hasExisting
            ? JSON.stringify(existing.rows[0].pages ?? [])
            : JSON.stringify(pages ?? []);
      const edgesJson =
        edges !== undefined && !(hasExisting && Array.isArray(edges) && edges.length === 0)
          ? JSON.stringify(edges)
          : hasExisting
            ? JSON.stringify(existing.rows[0].edges ?? [])
            : JSON.stringify(edges ?? []);
      const saved = await db.query(
        `INSERT INTO public.nebula_projects (id, user_id, name, pages, edges, workspace_id, updated_at)
         VALUES ($1::uuid, $2::uuid, $3, $4::jsonb, $5::jsonb, $6, NOW())
         ON CONFLICT (user_id, name) DO UPDATE
         SET pages = EXCLUDED.pages,
             edges = EXCLUDED.edges,
             workspace_id = COALESCE(
               NULLIF(TRIM(public.nebula_projects.workspace_id), ''),
               EXCLUDED.workspace_id
             ),
             updated_at = NOW()
         RETURNING name, pages, edges, workspace_id, d1_database_id, d1_database_name, updated_at`,
        [crypto.randomUUID(), uid, trimmed, pagesJson, edgesJson, workspaceId]
      );
      let d1Warning: string | null = null;
      let d1DatabaseId: string | null =
        (saved.rows[0] as ProjectListRow | undefined)?.d1_database_id != null
          ? String((saved.rows[0] as ProjectListRow).d1_database_id).trim() || null
          : null;
      let d1DatabaseName: string | null =
        (saved.rows[0] as ProjectListRow | undefined)?.d1_database_name != null
          ? String((saved.rows[0] as ProjectListRow).d1_database_name)
          : null;
      if (!d1DatabaseId && workspaceId) {
        const d1 = await provisionAndPersistD1ForProject(db, uid, trimmed, workspaceId);
        d1DatabaseId = d1.d1DatabaseId;
        d1DatabaseName = d1.d1DatabaseName;
        d1Warning = d1.d1Error;
      }
      void runProjectManagerSilently(db, uid, { projectName: trimmed }).catch(() => {});
      res.json({
        ok: true,
        workspace_id: workspaceId,
        d1_database_id: d1DatabaseId,
        d1_database_name: d1DatabaseName,
        ...(d1Warning ? { d1Warning } : {}),
      });
    } catch (e) {
      console.error("[nebula] POST /api/projects:", e);
      res.status(500).json({ error: "Failed to save project" });
    }
  });

  app.delete("/api/projects/:name", async (req, res) => {
    const uid = readSession(req);
    if (!uid) return res.status(401).json({ error: "Unauthorized" });
    if (!hasDb()) return res.status(503).json({ error: "Database not configured" });
    const name = req.params.name;
    if (!name) return res.status(400).json({ error: "name required" });
    try {
      const db = requireDbPool();
      await db.query(`DELETE FROM public.nebula_projects WHERE user_id = $1::uuid AND name = $2`, [uid, name]);
      res.json({ ok: true });
    } catch (e) {
      console.error("[nebula] DELETE /api/projects:", e);
      res.status(500).json({ error: "Failed to delete project" });
    }
  });
}

function oauthPopupHtml(ok: boolean, message: string): string {
  const safe = message.replace(/</g, "&lt;");
  const msgType = ok ? "OAUTH_AUTH_SUCCESS" : "OAUTH_AUTH_FAILURE";
  const fallbackPath = ok ? "/app" : "/login";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${ok ? "OK" : "Error"}</title></head>
<body style="font-family:system-ui;background:#040f1a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
<div style="text-align:center;max-width:360px;padding:2rem;">
<p>${safe}</p>
<script>
  if (window.opener) {
    window.opener.postMessage({ type: '${msgType}' }, window.location.origin);
    setTimeout(function(){ window.close(); }, 800);
  } else {
    setTimeout(function(){ window.location.href = '${fallbackPath}'; }, 1200);
  }
</script>
</div></body></html>`;
}
