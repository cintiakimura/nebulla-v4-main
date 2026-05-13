import type pg from "pg";

/** Registered from `mountRenderStack` after PostgreSQL connects (null when DB is off). */
let shared: pg.Pool | null = null;

export function registerNebulaPgPool(p: pg.Pool | null): void {
  shared = p;
}

export function getNebulaPgPool(): pg.Pool | null {
  return shared;
}
