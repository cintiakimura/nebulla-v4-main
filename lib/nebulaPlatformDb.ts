/**
 * Platform DB driver selection (Postgres vs Cloudflare D1).
 * Default remains `postgres` until operators set PLATFORM_DB_DRIVER=d1.
 */

export type PlatformDbDriver = "postgres" | "d1";

export function getPlatformDbDriver(): PlatformDbDriver {
  const raw = (process.env.PLATFORM_DB_DRIVER || "postgres").trim().toLowerCase();
  if (raw === "d1" || raw === "cloudflare-d1" || raw === "sqlite") return "d1";
  return "postgres";
}
