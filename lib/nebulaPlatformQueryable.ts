/**
 * Shared query surface for platform auth DB (Postgres today, Cloudflare D1 when PLATFORM_DB_DRIVER=d1).
 * Matches the subset of `pg.Pool#query` used by Nebulla (rows + optional rowCount).
 */

export type PlatformQueryResult<T = Record<string, unknown>> = {
  rows: T[];
  rowCount?: number;
};

export type PlatformQueryable = {
  query: <T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ) => Promise<PlatformQueryResult<T>>;
};
