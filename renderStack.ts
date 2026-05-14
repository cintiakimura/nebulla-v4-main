/**
 * Render-first backend: PostgreSQL (Render) + cookie sessions + username/password + GitHub OAuth.
 * Mount with mountRenderStack(app) from server.ts.
 */

import type { Express, Request, Response } from "express";
import { getProjectKeyFromRequest, sanitizeProjectKey } from "./lib/nebulaProjectKey";
import { registerNebulaPgPool } from "./lib/nebulaPgPool";
import { getMonthlyUsageSnapshot } from "./lib/token-usage";
import { saveUserGrokApiKey } from "./lib/nebulaUserGrokStore";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import pg from "pg";
import crypto from "crypto";
import { promisify } from "util";

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
  if (password.length > 8192) return "Password is too long.";
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
let dbReady = false;
/** After a failed schema/connect init, do not recreate the pool until process restart (avoids connect storms on bad URLs). */
let poolInitFailed = false;

function hasDb(): boolean {
  return Boolean(pool && dbReady);
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

function getPool(): pg.Pool | null {
  const url = process.env.DATABASE_URL?.trim();
  if (!url || poolInitFailed) return null;
  if (!pool) {
    pool = new pg.Pool({
      connectionString: url,
      ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
      max: 10,
      connectionTimeoutMillis: 15000,
    });
  }
  return pool;
}

export function getRenderPublicConfig() {
  const urlConfigured = Boolean(process.env.DATABASE_URL?.trim());
  const db = hasDb();
  return {
    cloudStorageReady: db,
    credentialsAuthReady: db,
    /** @deprecated use credentialsAuthReady */
    emailAuthReady: db,
    /** True when DATABASE_URL is set but PostgreSQL did not initialize (wrong host, DB deleted, network, etc.). */
    databaseConnectionFailed: urlConfigured && poolInitFailed,
    databaseUrlConfigured: urlConfigured,
    githubOAuthReady: Boolean(
      process.env.GITHUB_CLIENT_ID?.trim() && process.env.GITHUB_CLIENT_SECRET?.trim()
    ),
    /** When false, new projects get a synthetic `local-…` id (Render project API not configured). */
    renderWorkspaceApiReady: Boolean(
      process.env.RENDER_API_KEY?.trim() &&
        (process.env.RENDER_OWNER_ID?.trim() || process.env.RENDER_WORKSPACE_ID?.trim())
    ),
  };
}

async function ensureTables(p: pg.Pool) {
  await p.query(`
    CREATE TABLE IF NOT EXISTS nebula_users (
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
    CREATE TABLE IF NOT EXISTS nebula_projects (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES nebula_users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      pages JSONB NOT NULL DEFAULT '[]',
      edges JSONB NOT NULL DEFAULT '[]',
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, name)
    );
  `);
  await p.query(`CREATE INDEX IF NOT EXISTS idx_nebula_projects_user ON nebula_projects(user_id);`);
  await p.query(`ALTER TABLE nebula_projects ADD COLUMN IF NOT EXISTS workspace_id TEXT;`);
  await p.query(`
    CREATE TABLE IF NOT EXISTS nebula_client_workspaces (
      user_id UUID PRIMARY KEY REFERENCES nebula_users(id) ON DELETE CASCADE,
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
  await p.query(`ALTER TABLE nebula_users ADD COLUMN IF NOT EXISTS password_hash TEXT;`);
  await p.query(`
    CREATE TABLE IF NOT EXISTS nebula_password_resets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES nebula_users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await p.query(
    `CREATE INDEX IF NOT EXISTS idx_nebula_pw_reset_token ON nebula_password_resets(token_hash);`
  );
  await p.query(
    `CREATE INDEX IF NOT EXISTS idx_nebula_pw_reset_expires ON nebula_password_resets(expires_at);`
  );
  await p.query(`ALTER TABLE nebula_users ADD COLUMN IF NOT EXISTS billing_tier TEXT NOT NULL DEFAULT 'free';`);
  await p.query(`
    CREATE TABLE IF NOT EXISTS nebula_token_usage_monthly (
      user_id UUID NOT NULL REFERENCES nebula_users(id) ON DELETE CASCADE,
      month_year TEXT NOT NULL,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      grok3_tokens INTEGER NOT NULL DEFAULT 0,
      grok4_tokens INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, month_year)
    );
  `);
  await p.query(
    `CREATE INDEX IF NOT EXISTS idx_nebula_token_usage_month ON nebula_token_usage_monthly (month_year);`
  );
  await p.query(`ALTER TABLE nebula_users ADD COLUMN IF NOT EXISTS grok_api_key_encrypted TEXT;`);
  await p.query(`ALTER TABLE nebula_users ADD COLUMN IF NOT EXISTS grok_key_validated_at TIMESTAMPTZ;`);
}

function sessionSecret(): string {
  const s = process.env.SESSION_SECRET?.trim();
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production") {
    console.warn("[nebula] SESSION_SECRET missing or short; set a strong secret in production.");
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

/** GitHub redirect_uri must match the host the user actually hit (local dev vs Render). */
function githubOAuthRedirectBase(req: Request): string {
  if (process.env.NODE_ENV !== "production") {
    const fromReq = requestDerivedBaseUrl(req);
    if (fromReq) return fromReq;
    return `http://localhost:${process.env.PORT || 3000}`;
  }
  return publicBaseUrl(req);
}

function setSessionCookie(res: Response, token: string, remember: boolean) {
  const secure = process.env.NODE_ENV === "production";
  const cookieOptions: Record<string, unknown> = {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
  };
  if (remember) cookieOptions.maxAge = SESSION_MAX_AGE_MS;
  res.cookie(SESSION_COOKIE, token, cookieOptions);
}

/**
 * Creates a Render **Project** under your account/team owner.
 * Render’s public API does not expose `POST /v1/workspaces` (404); projects are the supported unit for new isolation groups.
 * Set `RENDER_OWNER_ID` (or alias `RENDER_WORKSPACE_ID`) to your owner id from Dashboard → Workspace Settings (e.g. `tea-…` / `usr-…`).
 */
async function createRenderProjectForNebula(displayName: string): Promise<{ id: string; name: string; raw: unknown }> {
  const renderApiKey = process.env.RENDER_API_KEY?.trim();
  const ownerId =
    process.env.RENDER_OWNER_ID?.trim() || process.env.RENDER_WORKSPACE_ID?.trim() || "";
  if (!renderApiKey) {
    throw new Error("RENDER_API_KEY is not configured.");
  }
  if (!ownerId) {
    throw new Error("RENDER_OWNER_ID (or RENDER_WORKSPACE_ID) is not configured.");
  }
  const baseUrl = (process.env.RENDER_API_BASE_URL || "https://api.render.com/v1").replace(/\/$/, "");
  const renderRes = await fetch(`${baseUrl}/projects`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${renderApiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      name: displayName,
      ownerId,
      environments: [{ name: "production" }],
    }),
  });
  if (!renderRes.ok) {
    const errorText = await renderRes.text();
    throw new Error(`Render project creation failed (${renderRes.status}): ${errorText.slice(0, 400)}`);
  }
  const payload: any = await renderRes.json();
  const projectId = payload?.id || payload?.project?.id || payload?.projectId || null;
  if (!projectId) throw new Error("Render response did not include a project ID.");
  return {
    id: String(projectId),
    name: payload?.name || payload?.project?.name || displayName,
    raw: payload,
  };
}

/** One Render workspace per Nebula project (unique ID stored on `nebula_projects.workspace_id`). */
async function provisionRenderWorkspaceForNewProject(
  _userId: string,
  projectName: string
): Promise<{ id: string; name: string }> {
  const shortId = crypto.randomBytes(4).toString("hex");
  const safe =
    projectName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32) || "project";
  const workspaceName = `nebulla-${safe}-${shortId}`.slice(0, 63);
  try {
    const created = await createRenderProjectForNebula(workspaceName);
    return { id: created.id, name: created.name };
  } catch (e) {
    const id = `local-${crypto.randomBytes(16).toString("hex")}`;
    console.warn(
      "[nebula] Render project provisioning failed; using synthetic id for on-disk isolation.",
      e instanceof Error ? e.message : e
    );
    return { id, name: workspaceName };
  }
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
  const dbPool = getPool();
  if (!uid || !projectName || !dbPool || !dbReady) return fallback;
  try {
    const r = await dbPool.query(`SELECT workspace_id FROM nebula_projects WHERE user_id = $1 AND name = $2`, [
      uid,
      projectName,
    ]);
    let wid = r.rows[0]?.workspace_id as string | undefined;
    if (!wid) {
      const rw = await provisionRenderWorkspaceForNewProject(uid, projectName);
      wid = rw.id;
      await dbPool.query(
        `UPDATE nebula_projects SET workspace_id = $1, updated_at = NOW()
         WHERE user_id = $2 AND name = $3 AND (workspace_id IS NULL OR workspace_id = '')`,
        [wid, uid, projectName]
      );
    }
    return wid ? sanitizeProjectKey(wid) : fallback;
  } catch (e) {
    console.warn("[nebula] resolveNebulaProjectDiskKey:", e);
    return fallback;
  }
}

export async function mountRenderStack(app: Express) {
  app.use(cookieParser() as any);

  const dbUrl = process.env.DATABASE_URL?.trim() || "";
  let p = getPool();
  dbReady = false;
  registerNebulaPgPool(null);
  if (p) {
    try {
      await ensureTables(p);
      dbReady = true;
      registerNebulaPgPool(p);
      console.log("[nebula] PostgreSQL (Render) schema ready.");
    } catch (e) {
      console.error("[nebula] PostgreSQL init failed:", e);
      if (dbUrl) {
        console.warn("[nebula] DATABASE_URL target:", describeDatabaseUrlHost(dbUrl));
        console.warn(
          "[nebula] Fix: use Render → PostgreSQL → Connections → **External** URL (full hostname), or remove DATABASE_URL for local dev without cloud auth.",
        );
      }
      dbReady = false;
      poolInitFailed = true;
      registerNebulaPgPool(null);
      try {
        await p.end();
      } catch {
        /* ignore */
      }
      p = null;
      pool = null;
    }
  }

  const ensureInitialProjectForUser = async (uid: string, preferredName?: string): Promise<void> => {
    if (!p) throw new Error("Database not configured");
    const current = await p.query(`SELECT COUNT(*)::int AS count FROM nebula_projects WHERE user_id = $1`, [uid]);
    const count = Number((current.rows[0] as { count?: number })?.count || 0);
    if (count > 0) return;

    const projectName = (preferredName || "").trim() || "Untitled Project";
    const workspace = await provisionRenderWorkspaceForNewProject(uid, projectName);
    await p.query(
      `INSERT INTO nebula_projects (user_id, name, pages, edges, workspace_id, updated_at)
       VALUES ($1, $2, '[]'::jsonb, '[]'::jsonb, $3, NOW())
       ON CONFLICT (user_id, name) DO NOTHING`,
      [uid, projectName, workspace.id]
    );
  };

  type ProjectListRow = {
    name: string;
    pages: unknown;
    edges: unknown;
    workspace_id: string | null;
    updated_at: string;
  };

  const backfillMissingWorkspaceIds = async (uid: string, rows: ProjectListRow[]): Promise<void> => {
    if (!p) return;
    for (const row of rows) {
      const wid = row.workspace_id != null ? String(row.workspace_id).trim() : "";
      if (wid) continue;
      const rw = await provisionRenderWorkspaceForNewProject(uid, row.name);
      await p.query(
        `UPDATE nebula_projects SET workspace_id = $1, updated_at = NOW() WHERE user_id = $2 AND name = $3`,
        [rw.id, uid, row.name]
      );
      row.workspace_id = rw.id;
    }
  };

  const runProjectManagerSilently = async (
    pool: pg.Pool,
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
      const r = await saveUserGrokApiKey(pool, uid, opts.grokApiKey);
      grokSaved = r.ok;
    }
    if (opts.syncAllProjects) {
      const r = await pool.query(
        `SELECT name, pages, edges, workspace_id, updated_at FROM nebula_projects WHERE user_id = $1::uuid ORDER BY updated_at DESC`,
        [uid]
      );
      const rows = r.rows as ProjectListRow[];
      await backfillMissingWorkspaceIds(uid, rows);
      renderTouched = rows.length > 0;
    } else if (opts.projectName?.trim()) {
      const r = await pool.query(
        `SELECT name, pages, edges, workspace_id, updated_at FROM nebula_projects WHERE user_id = $1::uuid AND name = $2`,
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

  app.post("/api/control-plane/project-manager/run", async (req, res) => {
    const uid = readSession(req);
    if (!uid) return res.status(401).json({ error: "Unauthorized" });
    if (!hasDb() || !p) return res.status(503).json({ error: "Database not configured" });
    const projectName = typeof req.body?.projectName === "string" ? req.body.projectName.trim() : "";
    const grokApiKey = typeof req.body?.grokApiKey === "string" ? req.body.grokApiKey.trim() : "";
    const syncAllProjects = Boolean(req.body?.syncAllProjects);
    try {
      const result = await runProjectManagerSilently(p, uid, { projectName, grokApiKey, syncAllProjects });
      res.json({ ok: true, ...result });
    } catch (e) {
      console.error("[nebula] /api/control-plane/project-manager/run:", e);
      res.status(500).json({ ok: false, error: "project_manager_failed" });
    }
  });

  app.get("/api/auth/session", async (req, res) => {
    const uid = readSession(req);
    if (!uid || !hasDb()) {
      return res.json({ user: null });
    }
    try {
      const r = await p.query(
        `SELECT id, provider, provider_user_id, email, display_name, avatar_url, created_at,
                (password_hash IS NOT NULL) AS has_password,
                billing_tier
         FROM nebula_users WHERE id = $1`,
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
      if (!row) return res.json({ user: null });
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
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    res.json({ ok: true });
  });

  /** Permanently delete the signed-in user and all related rows (CASCADE). */
  app.post("/api/auth/delete-account", async (req, res) => {
    const uid = readSession(req);
    if (!uid) return res.status(401).json({ error: "Unauthorized" });
    if (!hasDb()) return res.status(503).json({ error: "Database not configured" });
    const phrase = typeof req.body?.confirmation === "string" ? req.body.confirmation.trim() : "";
    if (phrase !== "DELETE MY ACCOUNT") {
      return res.status(400).json({ error: 'Type exactly: DELETE MY ACCOUNT' });
    }
    try {
      await p.query(`DELETE FROM nebula_users WHERE id = $1`, [uid]);
      res.clearCookie(SESSION_COOKIE, { path: "/" });
      return res.json({ ok: true });
    } catch (e) {
      console.error("[nebula] delete-account:", e);
      return res.status(500).json({ error: "Could not delete account." });
    }
  });

  const githubApiHeaders = (token: string) => ({
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "Nebulla-OAuth/1.0",
  });

  // --- GitHub OAuth (any GitHub account — use a standard OAuth App, not org-locked SSO-only flows) ---
  app.get("/api/auth/github", (req, res) => {
    if (!hasDb()) return res.status(503).send("Database not configured (DATABASE_URL)");
    const id = process.env.GITHUB_CLIENT_ID?.trim();
    if (!id) return res.status(503).send("GITHUB_CLIENT_ID not configured");
    const redirectUri = `${githubOAuthRedirectBase(req)}/api/auth/github/callback`;
    const state = crypto.randomBytes(16).toString("hex");
    const remember = String(req.query.remember || "").toLowerCase() === "1" || String(req.query.remember || "").toLowerCase() === "true";
    res.cookie("oauth_state", state, { httpOnly: true, maxAge: 600000, path: "/", sameSite: "lax" });
    res.cookie(OAUTH_REMEMBER_COOKIE, remember ? "1" : "0", { httpOnly: true, maxAge: 600000, path: "/", sameSite: "lax" });
    const q = new URLSearchParams({
      client_id: id,
      redirect_uri: redirectUri,
      scope: "read:user user:email",
      state,
    });
    res.redirect(`https://github.com/login/oauth/authorize?${q}`);
  });

  app.get("/api/auth/github/callback", async (req, res) => {
    if (!hasDb()) return res.status(503).send("Database not configured (DATABASE_URL)");
    const secret = process.env.GITHUB_CLIENT_SECRET?.trim();
    const id = process.env.GITHUB_CLIENT_ID?.trim();
    if (!secret || !id) return res.status(500).send("GitHub OAuth not configured");

    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const cookieState = req.cookies?.oauth_state;
    const remember = req.cookies?.[OAUTH_REMEMBER_COOKIE] === "1";
    res.clearCookie("oauth_state", { path: "/" });
    res.clearCookie(OAUTH_REMEMBER_COOKIE, { path: "/" });
    if (!code || !state || state !== cookieState) {
      return res.status(400).send("Invalid OAuth state");
    }

    const redirectUri = `${githubOAuthRedirectBase(req)}/api/auth/github/callback`;
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

      const ins = await p.query(
        `INSERT INTO nebula_users (provider, provider_user_id, email, display_name, avatar_url, password_hash)
         VALUES ('github', $1, $2, $3, $4, NULL)
         ON CONFLICT (provider, provider_user_id) DO UPDATE
         SET email = EXCLUDED.email, display_name = EXCLUDED.display_name, avatar_url = EXCLUDED.avatar_url
         RETURNING id`,
        [providerUserId, email, display, gh.avatar_url || null]
      );
      const userId = ins.rows[0].id as string;
      await ensureInitialProjectForUser(userId);
      const sessionJwt = signSession(userId);
      setSessionCookie(res, sessionJwt, remember);

      res.send(oauthPopupHtml(true, "Signed in with GitHub"));
    } catch (e) {
      console.error("[nebula] GitHub callback:", e);
      res.status(500).send(oauthPopupHtml(false, "GitHub sign-in failed"));
    }
  });

  // --- Register: email + password (frictionless) or legacy username + password ---
  app.post("/api/auth/register", async (req, res) => {
    if (!hasDb()) return res.status(503).json({ error: "Database not configured" });
    const remember = Boolean(req.body?.remember);
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
        const hash = await hashPassword(rawPassword);
        const ins = await p.query(
          `INSERT INTO nebula_users (provider, provider_user_id, email, display_name, avatar_url, password_hash)
           VALUES ('email', $1, $2, $3, NULL, $4)
           RETURNING id`,
          [emailAddr, emailAddr, display, hash]
        );
        const userId = ins.rows[0].id as string;
        await ensureInitialProjectForUser(userId, preferredFirstProjectName);
        setSessionCookie(res, signSession(userId), remember);
        return res.json({ ok: true });
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err?.code === "23505") {
          return res.status(409).json({ error: "An account with this email already exists." });
        }
        console.error("[nebula] register (email):", e);
        return res.status(500).json({ error: "Registration failed." });
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
      const hash = await hashPassword(password);
      const ins = await p.query(
        `INSERT INTO nebula_users (provider, provider_user_id, email, display_name, avatar_url, password_hash)
         VALUES ('username', $1, NULL, $2, NULL, $3)
         RETURNING id`,
        [username, display, hash]
      );
      const userId = ins.rows[0].id as string;
      const preferredFirstProjectName =
        typeof req.body?.projectName === "string" ? req.body.projectName : undefined;
      await ensureInitialProjectForUser(userId, preferredFirstProjectName);
      setSessionCookie(res, signSession(userId), remember);
      return res.json({ ok: true });
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err?.code === "23505") {
        return res.status(409).json({ error: "That username is already taken." });
      }
      console.error("[nebula] register:", e);
      return res.status(500).json({ error: "Registration failed." });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    if (!hasDb()) return res.status(503).json({ error: "Database not configured" });
    const rawLogin =
      typeof req.body?.username === "string"
        ? req.body.username
        : typeof req.body?.email === "string"
          ? req.body.email
          : "";
    const password = req.body?.password;
    const remember = Boolean(req.body?.remember);
    if (!String(rawLogin).trim() || typeof password !== "string") {
      return res.status(400).json({ error: "Email and password are required." });
    }
    try {
      const u = normalizeUsername(rawLogin);
      let row: { id: string; password_hash: string | null } | undefined;
      if (u) {
        const r = await p.query(
          `SELECT id, password_hash FROM nebula_users WHERE provider = 'username' AND provider_user_id = $1`,
          [u]
        );
        row = r.rows[0] as { id: string; password_hash: string | null } | undefined;
      }
      if (!row) {
        const em = normalizeEmail(String(rawLogin).trim());
        if (em) {
          const r2 = await p.query(
            `SELECT id, password_hash FROM nebula_users WHERE provider = 'email' AND provider_user_id = $1`,
            [em]
          );
          row = r2.rows[0] as { id: string; password_hash: string | null } | undefined;
        }
      }
      if (!row?.password_hash || !(await verifyPassword(password, row.password_hash))) {
        return res.status(401).json({ error: "Invalid email or password." });
      }
      await ensureInitialProjectForUser(row.id);
      setSessionCookie(res, signSession(row.id), remember);
      return res.json({ ok: true });
    } catch (e) {
      console.error("[nebula] login:", e);
      return res.status(500).json({ error: "Login failed." });
    }
  });

  app.post("/api/auth/forgot-password", async (req, res) => {
    if (!hasDb()) return res.status(503).json({ error: "Database not configured" });
    const email = normalizeEmail(req.body?.email);
    if (!email) return res.status(400).json({ error: "Valid email is required." });
    try {
      const r = await p.query(`SELECT id FROM nebula_users WHERE provider = 'email' AND provider_user_id = $1`, [
        email,
      ]);
      const row = r.rows[0] as { id: string } | undefined;
      if (row) {
        const rawToken = crypto.randomBytes(32).toString("hex");
        const tokenHash = hashResetToken(rawToken);
        const expires = new Date(Date.now() + 60 * 60 * 1000);
        await p.query(`DELETE FROM nebula_password_resets WHERE user_id = $1 AND used_at IS NULL`, [row.id]);
        await p.query(
          `INSERT INTO nebula_password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
          [row.id, tokenHash, expires.toISOString()]
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
    if (!hasDb()) return res.status(503).json({ error: "Database not configured" });
    const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
    const pwErr = validateNewPassword(req.body?.password);
    if (!token || token.length < 20) return res.status(400).json({ error: "Invalid or missing reset token." });
    if (pwErr) return res.status(400).json({ error: pwErr });
    const password = req.body.password as string;
    const tokenHash = hashResetToken(token);
    try {
      const r = await p.query(
        `SELECT id, user_id FROM nebula_password_resets
         WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`,
        [tokenHash]
      );
      const row = r.rows[0] as { id: string; user_id: string } | undefined;
      if (!row) {
        return res.status(400).json({ error: "This reset link is invalid or has expired. Request a new one." });
      }
      const hash = await hashPassword(password);
      await p.query(`UPDATE nebula_users SET password_hash = $1 WHERE id = $2`, [hash, row.user_id]);
      await p.query(`UPDATE nebula_password_resets SET used_at = NOW() WHERE id = $1`, [row.id]);
      await p.query(`DELETE FROM nebula_password_resets WHERE user_id = $1 AND id <> $2`, [row.user_id, row.id]);
      return res.json({ ok: true });
    } catch (e) {
      console.error("[nebula] reset-password:", e);
      return res.status(500).json({ error: "Password reset failed." });
    }
  });

  // --- Projects API ---
  app.get("/api/projects", async (req, res) => {
    const uid = readSession(req);
    if (!uid) return res.status(401).json({ error: "Unauthorized" });
    if (!hasDb()) return res.status(503).json({ error: "Database not configured" });
    const oneName = typeof req.query.name === "string" ? req.query.name.trim() : "";
    try {
      if (oneName) {
        const r = await p.query(
          `SELECT name, pages, edges, workspace_id, updated_at FROM nebula_projects WHERE user_id = $1 AND name = $2`,
          [uid, oneName]
        );
        const rows = r.rows as ProjectListRow[];
        await backfillMissingWorkspaceIds(uid, rows);
        return res.json({ projects: rows, project: rows[0] || null });
      }
      const r = await p.query(
        `SELECT name, pages, edges, workspace_id, updated_at FROM nebula_projects WHERE user_id = $1 ORDER BY updated_at DESC`,
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
    const uid = readSession(req);
    if (!uid) return res.status(401).json({ error: "Unauthorized" });
    if (!hasDb()) return res.status(503).json({ error: "Database not configured" });
    const { name, pages, edges } = req.body || {};
    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "name is required" });
    }
    try {
      const trimmed = name.trim();
      const existing = await p.query(`SELECT workspace_id FROM nebula_projects WHERE user_id = $1 AND name = $2`, [
        uid,
        trimmed,
      ]);
      let workspaceId = existing.rows[0]?.workspace_id as string | undefined;
      if (!workspaceId || !String(workspaceId).trim()) {
        const rw = await provisionRenderWorkspaceForNewProject(uid, trimmed);
        workspaceId = rw.id;
      }
      await p.query(
        `INSERT INTO nebula_projects (user_id, name, pages, edges, workspace_id, updated_at)
         VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, NOW())
         ON CONFLICT (user_id, name) DO UPDATE
         SET pages = EXCLUDED.pages,
             edges = EXCLUDED.edges,
             workspace_id = COALESCE(
               NULLIF(TRIM(nebula_projects.workspace_id), ''),
               EXCLUDED.workspace_id
             ),
             updated_at = NOW()
         RETURNING name, pages, edges, workspace_id, updated_at`,
        [uid, trimmed, JSON.stringify(pages ?? []), JSON.stringify(edges ?? []), workspaceId]
      );
      void runProjectManagerSilently(p, uid, { projectName: trimmed }).catch(() => {});
      res.json({ ok: true });
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
      await p.query(`DELETE FROM nebula_projects WHERE user_id = $1 AND name = $2`, [uid, name]);
      res.json({ ok: true });
    } catch (e) {
      console.error("[nebula] DELETE /api/projects:", e);
      res.status(500).json({ error: "Failed to delete project" });
    }
  });
}

function oauthPopupHtml(ok: boolean, message: string): string {
  const safe = message.replace(/</g, "&lt;");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${ok ? "OK" : "Error"}</title></head>
<body style="font-family:system-ui;background:#040f1a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
<div style="text-align:center;max-width:360px;padding:2rem;">
<p>${safe}</p>
<script>
  if (window.opener) {
    window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
    setTimeout(function(){ window.close(); }, 800);
  } else {
    setTimeout(function(){ window.location.href = '/'; }, 1200);
  }
</script>
</div></body></html>`;
}
