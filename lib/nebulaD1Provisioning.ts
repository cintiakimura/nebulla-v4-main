/**
 * Cloudflare D1 provisioning for per–Nebulla-project application databases.
 * Platform Postgres (DATABASE_URL) stays on Render; D1 is for the user's app data only.
 *
 * Env:
 *   CLOUDFLARE_ACCOUNT_ID (or R2_ACCOUNT_ID)
 *   CLOUDFLARE_API_TOKEN  — Account API token with D1 Edit
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { ensureCloudProjectWorkspace } from "./nebulaCloudProjectRoot";

const CF_API = "https://api.cloudflare.com/client/v4";

export type D1DatabaseInfo = {
  uuid: string;
  name: string;
  accountId: string;
};

export type D1ProvisionOk = { ok: true; database: D1DatabaseInfo };
export type D1ProvisionErr = { ok: false; error: string; skipped?: boolean };
export type D1ProvisionResult = D1ProvisionOk | D1ProvisionErr;

function readEnvFirst(...keys: string[]): string {
  for (const key of keys) {
    const v = process.env[key]?.trim();
    if (v) return v;
  }
  return "";
}

/** Account id shared with R2 when only R2_ACCOUNT_ID is set. */
export function resolveCloudflareAccountId(): string {
  return readEnvFirst("CLOUDFLARE_ACCOUNT_ID", "R2_ACCOUNT_ID");
}

export function resolveCloudflareApiToken(): string {
  return readEnvFirst("CLOUDFLARE_API_TOKEN", "CF_API_TOKEN");
}

export function isD1ProvisioningConfigured(): boolean {
  return Boolean(resolveCloudflareAccountId() && resolveCloudflareApiToken());
}

export function d1ProvisioningMissingHint(): string {
  const missing: string[] = [];
  if (!resolveCloudflareAccountId()) missing.push("CLOUDFLARE_ACCOUNT_ID (or R2_ACCOUNT_ID)");
  if (!resolveCloudflareApiToken()) missing.push("CLOUDFLARE_API_TOKEN");
  return missing.length
    ? `D1 provisioning not configured — set ${missing.join(" and ")}.`
    : "";
}

/** Cloudflare D1 names: lowercase letters, numbers, hyphens. */
export function sanitizeD1DatabaseName(projectName: string, shortId?: string): string {
  const id = shortId || crypto.randomBytes(4).toString("hex");
  const safe =
    projectName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "project";
  return `nebulla-${safe}-${id}`.slice(0, 63);
}

/**
 * Create a D1 database via Cloudflare API.
 * POST /accounts/{account_id}/d1/database
 */
export async function createCloudflareD1Database(
  displayName: string,
): Promise<D1ProvisionResult> {
  const accountId = resolveCloudflareAccountId();
  const token = resolveCloudflareApiToken();
  if (!accountId || !token) {
    return {
      ok: false,
      skipped: true,
      error: d1ProvisioningMissingHint() || "D1 provisioning not configured.",
    };
  }

  const name = sanitizeD1DatabaseName(displayName);
  const url = `${CF_API}/accounts/${encodeURIComponent(accountId)}/d1/database`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ name }),
    });
    const text = await res.text();
    let payload: {
      success?: boolean;
      errors?: { message?: string; code?: number }[];
      result?: { uuid?: string; name?: string };
    } = {};
    try {
      payload = JSON.parse(text) as typeof payload;
    } catch {
      /* non-JSON */
    }

    if (!res.ok || payload.success === false) {
      const apiMsg =
        payload.errors?.map((e) => e.message).filter(Boolean).join("; ") ||
        text.slice(0, 400);
      return {
        ok: false,
        error: `Cloudflare D1 create failed (${res.status}): ${apiMsg}`,
      };
    }

    const uuid = payload.result?.uuid?.trim();
    const resultName = (payload.result?.name || name).trim();
    if (!uuid) {
      return { ok: false, error: "Cloudflare D1 response did not include database uuid." };
    }

    console.log(
      `[nebula] D1 database created: uuid=${uuid} name=${resultName} account=${accountId.slice(0, 8)}…`,
    );

    return {
      ok: true,
      database: { uuid, name: resultName, accountId },
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Cloudflare D1 create request failed.",
    };
  }
}

/** Env keys written for the generated app (IDs only — never the platform API token). */
export const D1_APP_ENV_KEYS = [
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_D1_DATABASE_ID",
  "CLOUDFLARE_D1_DATABASE_NAME",
] as const;

/**
 * Persist D1 connection info into the project workspace so generated apps / Secrets can use it.
 * Writes:
 *   - `.env.d1` (dotenv fragment)
 *   - `nebula-d1.json` (machine-readable)
 * Merges keys into existing `.env` without overwriting unrelated vars.
 * Does **not** write CLOUDFLARE_API_TOKEN (platform-scoped; keep server-only).
 */
export function injectD1EnvIntoWorkspace(
  repoRoot: string,
  nebulaProjectTemplateRoot: string,
  projectDiskKey: string,
  database: D1DatabaseInfo,
): { envPath: string; metaPath: string } {
  const { workspaceRoot } = ensureCloudProjectWorkspace(
    repoRoot,
    nebulaProjectTemplateRoot,
    projectDiskKey,
  );

  const envLines = [
    `# Auto-provisioned Cloudflare D1 for this Nebulla project (app data — not Nebulla platform DB)`,
    `CLOUDFLARE_ACCOUNT_ID=${database.accountId}`,
    `CLOUDFLARE_D1_DATABASE_ID=${database.uuid}`,
    `CLOUDFLARE_D1_DATABASE_NAME=${database.name}`,
    `# Use CLOUDFLARE_D1_DATABASE_ID as the Workers D1 binding database_id in wrangler.toml`,
    "",
  ].join("\n");

  const envPath = path.join(workspaceRoot, ".env.d1");
  fs.writeFileSync(envPath, envLines, "utf8");

  const metaPath = path.join(workspaceRoot, "nebula-d1.json");
  fs.writeFileSync(
    metaPath,
    JSON.stringify(
      {
        provider: "cloudflare-d1",
        accountId: database.accountId,
        databaseId: database.uuid,
        databaseName: database.name,
        provisionedAt: new Date().toISOString(),
        wranglerBindingHint: {
          binding: "DB",
          database_name: database.name,
          database_id: database.uuid,
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  // Merge into workspace .env (create or update D1 keys only)
  const dotenvPath = path.join(workspaceRoot, ".env");
  mergeDotEnvKeys(dotenvPath, {
    CLOUDFLARE_ACCOUNT_ID: database.accountId,
    CLOUDFLARE_D1_DATABASE_ID: database.uuid,
    CLOUDFLARE_D1_DATABASE_NAME: database.name,
  });

  // Secrets-style JSON for tooling / future server sync (no API token)
  const secretsPath = path.join(workspaceRoot, "nebula-project-secrets.d1.json");
  fs.writeFileSync(
    secretsPath,
    JSON.stringify(
      {
        entries: [
          {
            name: "CLOUDFLARE_ACCOUNT_ID",
            value: database.accountId,
            category: "variable",
            note: "Cloudflare account for this project's D1 database",
          },
          {
            name: "CLOUDFLARE_D1_DATABASE_ID",
            value: database.uuid,
            category: "variable",
            note: "D1 database UUID — use in wrangler.toml binding",
          },
          {
            name: "CLOUDFLARE_D1_DATABASE_NAME",
            value: database.name,
            category: "variable",
            note: "D1 database name",
          },
        ],
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(
    `[nebula] D1 env injected into workspace ${path.basename(workspaceRoot)} (database_id=${database.uuid})`,
  );

  return { envPath, metaPath };
}

function mergeDotEnvKeys(filePath: string, updates: Record<string, string>): void {
  let existing = "";
  if (fs.existsSync(filePath)) {
    try {
      existing = fs.readFileSync(filePath, "utf8");
    } catch {
      existing = "";
    }
  }
  const lines = existing ? existing.split(/\r?\n/) : [];
  const keys = new Set(Object.keys(updates));
  const kept = lines.filter((line) => {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (m && keys.has(m[1])) return false;
    return true;
  });
  while (kept.length && kept[kept.length - 1] === "") kept.pop();
  const block = Object.entries(updates).map(([k, v]) => `${k}=${v}`);
  const next = [...kept, "", "# Cloudflare D1 (auto-provisioned)", ...block, ""].join("\n");
  fs.writeFileSync(filePath, next, "utf8");
}

/**
 * Provision D1 for a Nebulla project: create DB + inject env.
 * Never throws — returns error for caller to surface; project creation should continue.
 */
export async function provisionD1ForNebulaProject(opts: {
  repoRoot: string;
  nebulaProjectTemplateRoot: string;
  projectName: string;
  /** Disk key = Render workspace_id / project key */
  projectDiskKey: string;
}): Promise<D1ProvisionResult> {
  const created = await createCloudflareD1Database(opts.projectName);
  if (!created.ok) {
    if (!created.skipped) {
      console.warn(`[nebula] D1 provisioning failed for "${opts.projectName}":`, created.error);
    } else {
      console.warn(`[nebula] D1 skipped for "${opts.projectName}":`, created.error);
    }
    return created;
  }

  try {
    injectD1EnvIntoWorkspace(
      opts.repoRoot,
      opts.nebulaProjectTemplateRoot,
      opts.projectDiskKey,
      created.database,
    );
  } catch (e) {
    console.warn(
      "[nebula] D1 created but env inject failed:",
      e instanceof Error ? e.message : e,
    );
    return {
      ok: false,
      error: `D1 created (${created.database.uuid}) but failed to write project env: ${
        e instanceof Error ? e.message : String(e)
      }`,
    };
  }

  return created;
}
