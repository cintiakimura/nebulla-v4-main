/**
 * Diagnose platform D1 token: list / SELECT vs CREATE.
 * Never prints secret values.
 *
 * Usage: npm run check:platform-d1
 */

import fs from "fs";
import path from "path";
import {
  resolveCloudflareAccountId,
  resolveCloudflareApiToken,
} from "../lib/nebulaD1Provisioning";
import { resolvePlatformD1DatabaseId } from "../lib/nebulaPlatformD1";

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

async function d1Query(sql: string): Promise<{ ok: boolean; body: string }> {
  const accountId = resolveCloudflareAccountId();
  const token = resolveCloudflareApiToken();
  const databaseId = resolvePlatformD1DatabaseId();
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}/query`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql }),
  });
  const body = await res.text();
  let success = false;
  try {
    success = Boolean((JSON.parse(body) as { success?: boolean }).success);
  } catch {
    /* ignore */
  }
  return { ok: res.ok && success, body: body.slice(0, 300) };
}

async function main() {
  loadDotEnv();
  const accountId = resolveCloudflareAccountId();
  const token = resolveCloudflareApiToken();
  const databaseId = resolvePlatformD1DatabaseId();
  if (!accountId || !token || !databaseId) {
    console.error("Missing PLATFORM_D1_DATABASE_ID / CLOUDFLARE_API_TOKEN / account id");
    process.exit(1);
  }
  console.log("account:", accountId.slice(0, 8) + "…");
  console.log("d1:", databaseId.slice(0, 8) + "…");
  console.log("token length:", token.length, "prefix:", token.slice(0, 5));

  const select = await d1Query("SELECT 1 AS ok");
  console.log(select.ok ? "PASS  SELECT 1" : "FAIL  SELECT 1", select.ok ? "" : select.body);

  const create = await d1Query(
    "CREATE TABLE IF NOT EXISTS nebula_token_probe (id TEXT PRIMARY KEY)",
  );
  console.log(create.ok ? "PASS  CREATE TABLE" : "FAIL  CREATE TABLE", create.ok ? "" : create.body);

  if (select.ok && !create.ok) {
    console.log(`
DIAGNOSIS: Token can READ D1 but cannot WRITE/DDL.
Fix:
  1) dash.cloudflare.com → My Profile → API Tokens → Create Token
  2) Custom token → Permissions:
       Account | D1 | Edit
  3) Account Resources → Include → your Nebulla account
  4) Create → copy token → replace CLOUDFLARE_API_TOKEN in .env → Cmd+S
  5) npm run check:platform-d1
  6) npm run migrate:platform-d1
`);
    process.exit(1);
  }
  if (!select.ok) {
    console.log("\nDIAGNOSIS: Token cannot query this D1 at all. Recreate token with D1 Edit.\n");
    process.exit(1);
  }
  // cleanup probe table best-effort
  await d1Query("DROP TABLE IF EXISTS nebula_token_probe");
  console.log("\nALL PASS — run: npm run migrate:platform-d1\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
