/**
 * Resource catalog store: filesystem (default) or Cloudflare R2 (+ KV index when configured).
 * Not Render Postgres / classic SQL.
 */

import fs from "fs";
import path from "path";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { isR2Configured, getR2Client, uploadToR2 } from "../../nebulaR2Storage";
import type { CatalogMode, UiResourceProfile } from "./types";

const CATALOG_REL = path.join("nebulla-project", "ui-resource-catalog");
const R2_PREFIX = "ui-resources";

export function resolveCatalogMode(): CatalogMode {
  const raw = (process.env.UI_RESOURCE_CATALOG || "fs").trim().toLowerCase();
  if (raw === "r2" && isR2Configured()) return "r2";
  return "fs";
}

export function catalogRootFromCwd(cwd = process.cwd()): string {
  return path.join(cwd, CATALOG_REL);
}

function isProfile(x: unknown): x is UiResourceProfile {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.kind === "string" &&
    typeof o.platform === "string" &&
    Array.isArray(o.page_types) &&
    typeof o.density === "string" &&
    Array.isArray(o.personality) &&
    typeof o.description === "string"
  );
}

export async function listProfilesFs(catalogRoot: string): Promise<UiResourceProfile[]> {
  const dir = path.join(catalogRoot, "profiles");
  if (!fs.existsSync(dir)) return [];
  const out: UiResourceProfile[] = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
      if (isProfile(raw)) out.push(raw);
    } catch {
      /* skip bad file */
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

export async function getProfileFs(
  catalogRoot: string,
  id: string,
): Promise<UiResourceProfile | null> {
  const p = path.join(catalogRoot, "profiles", `${id}.json`);
  if (!fs.existsSync(p)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf8"));
    return isProfile(raw) ? raw : null;
  } catch {
    return null;
  }
}

export async function putProfileFs(
  catalogRoot: string,
  profile: UiResourceProfile,
): Promise<void> {
  const dir = path.join(catalogRoot, "profiles");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${profile.id}.json`), `${JSON.stringify(profile, null, 2)}\n`, "utf8");
}

/** KV-style index document stored on R2 when Workers KV env is unset. */
export type CatalogIndexDoc = {
  updated_at: string;
  by_platform_page: Record<string, string[]>;
  by_density: Record<string, string[]>;
  ids: string[];
};

function buildIndex(profiles: UiResourceProfile[]): CatalogIndexDoc {
  const by_platform_page: Record<string, string[]> = {};
  const by_density: Record<string, string[]> = {};
  for (const p of profiles) {
    for (const pt of p.page_types) {
      const k = `${p.platform}:${pt}`;
      (by_platform_page[k] ||= []).push(p.id);
    }
    (by_density[p.density] ||= []).push(p.id);
  }
  return {
    updated_at: new Date().toISOString(),
    by_platform_page,
    by_density,
    ids: profiles.map((p) => p.id),
  };
}

async function streamToString(body: unknown): Promise<string> {
  if (!body) return "";
  if (typeof body === "string") return body;
  const b = body as { transformToString?: () => Promise<string> };
  if (typeof b.transformToString === "function") return b.transformToString();
  // Node.js Readable
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Buffer>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function listProfilesR2(): Promise<UiResourceProfile[]> {
  if (!isR2Configured()) return [];
  const { client, config } = getR2Client();
  const indexKey = `${R2_PREFIX}/index.json`;
  try {
    const res = await client.send(
      new GetObjectCommand({ Bucket: config.bucketName, Key: indexKey }),
    );
    const text = await streamToString(res.Body);
    const index = JSON.parse(text) as CatalogIndexDoc;
    const profiles: UiResourceProfile[] = [];
    for (const id of index.ids || []) {
      const p = await getProfileR2(id);
      if (p) profiles.push(p);
    }
    return profiles;
  } catch {
    return [];
  }
}

export async function getProfileR2(id: string): Promise<UiResourceProfile | null> {
  if (!isR2Configured()) return null;
  const { client, config } = getR2Client();
  const key = `${R2_PREFIX}/resources/${id}/profile.json`;
  try {
    const res = await client.send(
      new GetObjectCommand({ Bucket: config.bucketName, Key: key }),
    );
    const text = await streamToString(res.Body);
    const raw = JSON.parse(text);
    return isProfile(raw) ? raw : null;
  } catch {
    return null;
  }
}

export async function putProfileR2(profile: UiResourceProfile): Promise<void> {
  const key = `${R2_PREFIX}/resources/${profile.id}/profile.json`;
  await uploadToR2({
    objectKey: key,
    body: JSON.stringify(profile, null, 2),
    contentType: "application/json",
  });
}

/** Sync all FS profiles → R2 and rewrite index.json (KV-substitute index on R2). */
export async function syncFsCatalogToR2(catalogRoot: string): Promise<{
  uploaded: number;
  index_key: string;
}> {
  const profiles = await listProfilesFs(catalogRoot);
  for (const p of profiles) {
    await putProfileR2(p);
    if (p.preview_local) {
      const local = path.join(catalogRoot, p.preview_local);
      if (fs.existsSync(local)) {
        const buf = fs.readFileSync(local);
        const ext = path.extname(local).toLowerCase() || ".png";
        await uploadToR2({
          objectKey: `${R2_PREFIX}/resources/${p.id}/preview${ext}`,
          body: buf,
          contentType: ext === ".webp" ? "image/webp" : ext === ".jpg" ? "image/jpeg" : "image/png",
        });
      }
    }
  }
  const index = buildIndex(profiles);
  const index_key = `${R2_PREFIX}/index.json`;
  await uploadToR2({
    objectKey: index_key,
    body: JSON.stringify(index, null, 2),
    contentType: "application/json",
  });
  // Optional Workers KV namespace via REST is env-specific; index on R2 is enough for v1.
  void process.env.UI_RESOURCE_KV_NAMESPACE;
  return { uploaded: profiles.length, index_key };
}

export async function listProfiles(cwd = process.cwd()): Promise<UiResourceProfile[]> {
  const mode = resolveCatalogMode();
  if (mode === "r2") {
    const remote = await listProfilesR2();
    if (remote.length > 0) return remote;
  }
  return listProfilesFs(catalogRootFromCwd(cwd));
}
