/**
 * Apply platform D1 schema (migrations/platform-d1/001_init.sql).
 * Loads .env from cwd. Never prints secrets.
 *
 * Usage: npm run migrate:platform-d1
 */

import fs from "fs";
import path from "path";
import {
  ensurePlatformD1Schema,
  isPlatformD1Configured,
  platformD1MissingHint,
  resolvePlatformD1DatabaseId,
} from "../lib/nebulaPlatformD1";
import { resolveCloudflareAccountId } from "../lib/nebulaD1Provisioning";

function loadDotEnv(): void {
  const p = path.join(process.cwd(), ".env");
  if (!fs.existsSync(p)) return;
  const text = fs.readFileSync(p, "utf8");
  for (const line of text.split("\n")) {
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
  if (!isPlatformD1Configured()) {
    console.error(platformD1MissingHint());
    process.exit(1);
  }
  const id = resolvePlatformD1DatabaseId();
  const acct = resolveCloudflareAccountId();
  console.log(
    `[migrate:platform-d1] Applying schema to D1 ${id.slice(0, 8)}… (account ${acct.slice(0, 8)}…)`,
  );
  await ensurePlatformD1Schema();
  console.log("[migrate:platform-d1] OK — platform tables ready (empty start / D4=A).");
}

main().catch((e) => {
  console.error("[migrate:platform-d1] failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
