/**
 * Smoke: ensureDbReady with PLATFORM_DB_DRIVER=d1 → config flags.
 * Usage: npx tsx scripts/smoke-platform-d1-config.ts
 */
import fs from "fs";
import path from "path";

function loadDotEnv(): void {
  const p = path.join(process.cwd(), ".env");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

async function main() {
  loadDotEnv();
  process.env.PLATFORM_DB_DRIVER = "d1";
  const { ensureDbReady, getRenderPublicConfig } = await import("../renderStack");
  const ok = await ensureDbReady();
  const c = getRenderPublicConfig();
  console.log(
    JSON.stringify(
      {
        ensureDbReady: ok,
        cloudStorageReady: c.cloudStorageReady,
        credentialsAuthReady: c.credentialsAuthReady,
        databaseConnectionFailed: c.databaseConnectionFailed,
        platformDbDriver: c.platformDbDriver,
        databaseHostHint: c.databaseHostHint,
        githubOAuthReady: c.githubOAuthReady,
      },
      null,
      2,
    ),
  );
  if (!ok || !c.cloudStorageReady || c.databaseConnectionFailed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
