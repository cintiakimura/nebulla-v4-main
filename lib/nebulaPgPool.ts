import type pg from "pg";
import type { PlatformQueryable } from "./nebulaPlatformQueryable";

/**
 * Platform DB handle for BYOK / token usage / config.
 * Postgres: the `pg.Pool`. D1: HTTP queryable from `createPlatformD1Queryable()`.
 */
let sharedPool: pg.Pool | null = null;
let sharedQueryable: PlatformQueryable | null = null;

/** @deprecated Prefer registerPlatformQueryable — kept for Postgres boot path. */
export function registerNebulaPgPool(p: pg.Pool | null): void {
  sharedPool = p;
  sharedQueryable = p;
}

export function registerPlatformQueryable(q: PlatformQueryable | null): void {
  sharedQueryable = q;
  if (!q) sharedPool = null;
  else if (typeof (q as pg.Pool).connect === "function") {
    sharedPool = q as pg.Pool;
  } else {
    sharedPool = null;
  }
}

export function getNebulaPgPool(): pg.Pool | null {
  return sharedPool;
}

export function getPlatformQueryable(): PlatformQueryable | null {
  return sharedQueryable;
}
