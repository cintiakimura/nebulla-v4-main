/**
 * Cloudflare D1 client for Nebulla **platform** auth/data (not per-app D1).
 *
 * Env:
 *   PLATFORM_D1_DATABASE_ID (alias: d1_database_cloudflare_nebulla)
 *   CLOUDFLARE_ACCOUNT_ID / R2_ACCOUNT_ID
 *   CLOUDFLARE_API_TOKEN / CF_API_TOKEN
 *
 * See docs/migration/render-to-cloudflare.md Phase 2.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  resolveCloudflareAccountId,
  resolveCloudflareApiToken,
} from "./nebulaD1Provisioning";
import type { PlatformQueryable, PlatformQueryResult } from "./nebulaPlatformQueryable";

const CF_API = "https://api.cloudflare.com/client/v4";

function readEnvFirst(...keys: string[]): string {
  for (const key of keys) {
    const v = process.env[key]?.trim();
    if (v) return v;
  }
  return "";
}

export function resolvePlatformD1DatabaseId(): string {
  return readEnvFirst("PLATFORM_D1_DATABASE_ID", "d1_database_cloudflare_nebulla");
}

export function isPlatformD1Configured(): boolean {
  return Boolean(
    resolvePlatformD1DatabaseId() &&
      resolveCloudflareAccountId() &&
      resolveCloudflareApiToken(),
  );
}

export function platformD1MissingHint(): string {
  const missing: string[] = [];
  if (!resolvePlatformD1DatabaseId()) missing.push("PLATFORM_D1_DATABASE_ID");
  if (!resolveCloudflareAccountId()) missing.push("CLOUDFLARE_ACCOUNT_ID (or R2_ACCOUNT_ID)");
  if (!resolveCloudflareApiToken()) missing.push("CLOUDFLARE_API_TOKEN");
  return missing.length ? `Platform D1 not configured — set ${missing.join(", ")}.` : "";
}

/** Convert Postgres-style `$1` placeholders to D1 `?`, preserving param order by index. */
export function convertPgPlaceholders(
  sql: string,
  params: unknown[] = [],
): { sql: string; params: unknown[] } {
  const order: number[] = [];
  const out = sql.replace(/\$(\d+)/g, (_, n: string) => {
    order.push(Number(n) - 1);
    return "?";
  });
  return { sql: out, params: order.map((i) => params[i]) };
}

/**
 * Strip / rewrite Postgres-only syntax used in renderStack so the same SQL strings can run on D1.
 * Not a general PG→SQLite compiler — only the patterns Nebulla uses.
 */
export function postgresSqlToD1(sql: string): string {
  let s = sql;
  s = s.replace(/\bpublic\./gi, "");
  s = s.replace(/::uuid/gi, "");
  s = s.replace(/::jsonb/gi, "");
  s = s.replace(/::int\b/gi, "");
  s = s.replace(/\bNOW\(\)/gi, "datetime('now')");
  s = s.replace(/\bto_regclass\s*\(\s*'public\.nebula_users'\s*\)/gi, "name");
  // Health check companion: SELECT to_regclass(...) AS users_table → use sqlite_master in caller
  return s;
}

type D1QueryApiResult = {
  success?: boolean;
  errors?: { message?: string; code?: number }[];
  result?: Array<{
    results?: Record<string, unknown>[];
    success?: boolean;
    meta?: { changes?: number; rows_written?: number };
  }>;
};

async function d1ApiQuery(sql: string, params: unknown[]): Promise<PlatformQueryResult> {
  const accountId = resolveCloudflareAccountId();
  const token = resolveCloudflareApiToken();
  const databaseId = resolvePlatformD1DatabaseId();
  if (!accountId || !token || !databaseId) {
    throw new Error(platformD1MissingHint() || "Platform D1 not configured");
  }

  const { sql: d1Sql, params: d1Params } = convertPgPlaceholders(postgresSqlToD1(sql), params);
  const url = `${CF_API}/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}/query`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ sql: d1Sql, params: d1Params }),
  });

  const text = await res.text();
  let payload: D1QueryApiResult = {};
  try {
    payload = JSON.parse(text) as D1QueryApiResult;
  } catch {
    /* non-JSON */
  }

  if (!res.ok || payload.success === false) {
    const apiMsg =
      payload.errors?.map((e) => e.message).filter(Boolean).join("; ") || text.slice(0, 400);
    const err = new Error(`Platform D1 query failed (${res.status}): ${apiMsg}`);
    (err as { code?: string }).code = "D1_QUERY_FAILED";
    throw err;
  }

  const first = payload.result?.[0];
  const rows = (first?.results || []) as Record<string, unknown>[];
  const changes = first?.meta?.changes ?? first?.meta?.rows_written;
  return {
    rows,
    rowCount: typeof changes === "number" ? changes : rows.length,
  };
}

function splitSqlStatements(sqlFile: string): string[] {
  return sqlFile
    .split(";")
    .map((s) =>
      s
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim(),
    )
    .filter(Boolean);
}

function resolveMigrationSqlPath(): string {
  const fromCwd = path.join(process.cwd(), "migrations/platform-d1/001_init.sql");
  if (fs.existsSync(fromCwd)) return fromCwd;
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const alt = path.join(here, "../migrations/platform-d1/001_init.sql");
    if (fs.existsSync(alt)) return alt;
  } catch {
    /* CJS / bundled */
  }
  return fromCwd;
}

/** Apply 001_init.sql to the platform D1 database (idempotent CREATE IF NOT EXISTS). */
export async function ensurePlatformD1Schema(): Promise<void> {
  const sqlPath = resolveMigrationSqlPath();
  if (!fs.existsSync(sqlPath)) {
    throw new Error(`Platform D1 migration missing: ${sqlPath}`);
  }
  const body = fs.readFileSync(sqlPath, "utf8");
  const statements = splitSqlStatements(body);
  for (const stmt of statements) {
    await d1ApiQuery(stmt, []);
  }
}

export function createPlatformD1Queryable(): PlatformQueryable {
  return {
    async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
      // Special-case legacy health SQL that uses to_regclass
      const trimmed = sql.trim().replace(/\s+/g, " ");
      if (/to_regclass/i.test(trimmed)) {
        const r = await d1ApiQuery(
          `SELECT name AS users_table FROM sqlite_master WHERE type = 'table' AND name = 'nebula_users' LIMIT 1`,
          [],
        );
        return {
          rows: [{ users_table: r.rows[0]?.users_table || null }] as T[],
          rowCount: 1,
        };
      }
      return d1ApiQuery(sql, params ?? []) as Promise<PlatformQueryResult<T>>;
    },
  };
}

let d1Ready = false;
let d1InitFailed = false;
let d1FailureHint = "";
let d1RetryAt = 0;
let d1InFlight: Promise<boolean> | null = null;
const D1_RETRY_MS = 15_000;

export function isPlatformD1Ready(): boolean {
  return d1Ready;
}

export function didPlatformD1InitFail(): boolean {
  return d1InitFailed;
}

export function getPlatformD1FailureHint(): string {
  return d1FailureHint;
}

export async function ensurePlatformD1Ready(): Promise<boolean> {
  if (d1Ready) return true;
  if (!isPlatformD1Configured()) {
    d1InitFailed = true;
    d1FailureHint = platformD1MissingHint();
    return false;
  }
  const now = Date.now();
  if (d1InitFailed && now - d1RetryAt < D1_RETRY_MS) return false;
  if (d1InFlight) return d1InFlight;

  d1InFlight = (async () => {
    d1RetryAt = Date.now();
    try {
      await ensurePlatformD1Schema();
      await d1ApiQuery(`SELECT 1 AS ok`, []);
      d1Ready = true;
      d1InitFailed = false;
      d1FailureHint = "";
      console.log(
        "[nebula] Platform D1 schema ready:",
        resolvePlatformD1DatabaseId().slice(0, 8) + "…",
      );
      return true;
    } catch (e) {
      d1Ready = false;
      d1InitFailed = true;
      d1FailureHint =
        e instanceof Error
          ? e.message.slice(0, 280)
          : "Platform D1 init failed. Check PLATFORM_D1_DATABASE_ID and CLOUDFLARE_API_TOKEN (D1 Edit).";
      console.error("[nebula] Platform D1 init failed:", d1FailureHint);
      return false;
    } finally {
      d1InFlight = null;
    }
  })();

  return d1InFlight;
}

export function resetPlatformD1ReadyStateForTests(): void {
  d1Ready = false;
  d1InitFailed = false;
  d1FailureHint = "";
  d1RetryAt = 0;
  d1InFlight = null;
}
