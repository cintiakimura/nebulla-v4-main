/**
 * Nebulla project workspace durability (Phase 4).
 *
 * Modes (WORKSPACE_STORAGE):
 *   local — disk only under data/cloud-projects/{key}/ (default; Render-safe)
 *   dual  — write disk + R2; hydrate missing files from R2 on ensure
 *   r2    — same write path as dual; on ensure, pull from R2 when local is empty/missing
 *
 * Bucket: WORKSPACE_R2_BUCKET → R2_BUCKET_2_NAME → CLOUDFLARE_R2_BUCKET_NAME / R2_BUCKET_NAME
 * Object keys: workspaces/{projectKey}/{relative/posix/path}
 *
 * Credentials reuse R2 S3 keys (CLOUDFLARE_* / R2_*).
 */

import fs from "fs";
import path from "path";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  contentTypeFromFilename,
  isR2Configured,
  resolveR2Config,
  type R2Config,
} from "./nebulaR2Storage";
import { sanitizeProjectKey } from "./nebulaProjectKey";

export type WorkspaceStorageMode = "local" | "r2" | "dual";

function readEnvFirst(...keys: string[]): string {
  for (const key of keys) {
    const v = process.env[key]?.trim();
    if (v) return v;
  }
  return "";
}

export function getWorkspaceStorageMode(): WorkspaceStorageMode {
  const raw = (process.env.WORKSPACE_STORAGE || "local").trim().toLowerCase();
  if (raw === "r2" || raw === "remote") return "r2";
  if (raw === "dual" || raw === "both") return "dual";
  return "local";
}

export function resolveWorkspaceR2BucketName(): string {
  return (
    readEnvFirst("WORKSPACE_R2_BUCKET", "R2_BUCKET_2_NAME") ||
    readEnvFirst("CLOUDFLARE_R2_BUCKET_NAME", "R2_BUCKET_NAME")
  );
}

export function isWorkspaceR2Configured(): boolean {
  if (!isR2Configured()) return false;
  return Boolean(resolveWorkspaceR2BucketName());
}

export function workspaceObjectKey(projectKey: string, relativePath: string): string {
  const key = sanitizeProjectKey(projectKey);
  const rel = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  return `workspaces/${key}/${rel}`;
}

/** `data/cloud-projects/{key}/…` — null in tests that use a temp dir. */
export function projectKeyFromWorkspaceRoot(workspaceRoot: string): string | null {
  const n = workspaceRoot.replace(/\\/g, "/").replace(/\/+$/, "");
  const marker = "/data/cloud-projects/";
  const i = n.lastIndexOf(marker);
  if (i < 0) return null;
  const key = n.slice(i + marker.length).split("/")[0]?.trim();
  return key || null;
}

let wsClient: S3Client | null = null;
let wsClientAccount: string | null = null;

function getWorkspaceS3(): { client: S3Client; config: R2Config; bucket: string } {
  const resolved = resolveR2Config();
  if (resolved.ok === false) {
    throw new Error(resolved.message);
  }
  const bucket = resolveWorkspaceR2BucketName();
  if (!bucket) {
    throw new Error("WORKSPACE_R2_BUCKET (or R2_BUCKET_2_NAME / R2_BUCKET_NAME) is not set");
  }
  const config = resolved.config;
  if (!wsClient || wsClientAccount !== config.accountId) {
    wsClientAccount = config.accountId;
    wsClient = new S3Client({
      region: "auto",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }
  return { client: wsClient, config, bucket };
}

export function getWorkspaceStoragePublicConfig() {
  const mode = getWorkspaceStorageMode();
  const bucket = resolveWorkspaceR2BucketName();
  const r2Ready = isWorkspaceR2Configured();
  return {
    workspaceStorageMode: mode,
    workspaceR2Configured: r2Ready,
    workspaceR2BucketHint: bucket ? `${bucket.slice(0, 6)}…` : "",
    /** True when mode needs R2 and credentials+bucket are present. */
    workspaceR2Ready: mode === "local" ? true : r2Ready,
  };
}

/** Upload one workspace-relative file to R2 (no-op when mode=local or R2 not configured). */
export async function syncWorkspaceFileToR2(
  projectKey: string,
  relativePath: string,
  body: string | Buffer,
): Promise<{ ok: true; key: string } | { ok: false; skipped?: boolean; error: string }> {
  const mode = getWorkspaceStorageMode();
  if (mode === "local") return { ok: false, skipped: true, error: "local mode" };
  if (!isWorkspaceR2Configured()) {
    return { ok: false, error: "Workspace R2 not configured" };
  }
  try {
    const { client, bucket } = getWorkspaceS3();
    const key = workspaceObjectKey(projectKey, relativePath);
    const buf = typeof body === "string" ? Buffer.from(body, "utf8") : body;
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buf,
        ContentType: contentTypeFromFilename(relativePath) || "application/octet-stream",
      }),
    );
    return { ok: true, key };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * After a local write under workspaceRoot, sync that file to R2 when mode is r2|dual.
 * Fire-and-forget safe: logs warnings, never throws to callers.
 */
export function scheduleWorkspaceFileR2Sync(
  projectKey: string,
  workspaceRoot: string,
  absolutePath: string,
  content?: string | Buffer,
): void {
  const mode = getWorkspaceStorageMode();
  if (mode === "local") return;
  if (!isWorkspaceR2Configured()) return;

  let rel: string;
  try {
    rel = path.relative(workspaceRoot, absolutePath);
    if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return;
    rel = rel.split(path.sep).join("/");
  } catch {
    return;
  }

  void (async () => {
    try {
      const body =
        content !== undefined
          ? content
          : fs.readFileSync(absolutePath);
      const r = await syncWorkspaceFileToR2(projectKey, rel, body);
      if (r.ok === false && !r.skipped) {
        console.warn(`[nebula] workspace R2 sync failed (${rel}):`, r.error);
      }
    } catch (e) {
      console.warn(
        "[nebula] workspace R2 sync error:",
        e instanceof Error ? e.message : e,
      );
    }
  })();
}

export function scheduleWorkspaceAbsR2Sync(
  workspaceRoot: string,
  absolutePath: string,
  content?: string | Buffer,
): void {
  const key = projectKeyFromWorkspaceRoot(workspaceRoot);
  if (!key) return;
  scheduleWorkspaceFileR2Sync(key, workspaceRoot, absolutePath, content);
}

export function scheduleWorkspaceRelPathsR2Sync(
  projectKey: string,
  workspaceRoot: string,
  relativePaths: string[],
): void {
  for (const rel of relativePaths) {
    const n = String(rel || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (!n || n.includes("..")) continue;
    const abs = path.join(workspaceRoot, ...n.split("/"));
    if (!fs.existsSync(abs)) continue;
    try {
      if (fs.statSync(abs).isDirectory()) continue;
    } catch {
      continue;
    }
    scheduleWorkspaceFileR2Sync(projectKey, workspaceRoot, abs);
  }
}

const TREE_SKIP_DIR = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "coverage",
  "out",
  "nebula-project",
  "nebulla-project",
]);

const TREE_MAX_FILES = 400;
const TREE_MAX_BYTES = 1_500_000;

/**
 * Product + plan files that must survive a Render deploy.
 * Skips node_modules / build output / huge version dumps.
 */
export function listDurableWorkspaceRelPaths(workspaceRoot: string, max = TREE_MAX_FILES): string[] {
  const root = workspaceRoot.trim();
  if (!root || !fs.existsSync(root)) return [];
  const out: string[] = [];

  const walk = (abs: string, rel: string, depth: number) => {
    if (out.length >= max || depth > 8) return;
    let ents: fs.Dirent[];
    try {
      ents = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of ents) {
      if (out.length >= max) return;
      const name = ent.name;
      if (name.startsWith(".") && name !== ".env.example") continue;
      if (ent.isDirectory()) {
        if (TREE_SKIP_DIR.has(name)) continue;
        if (rel === "generated-ui" && name === "versions") continue;
        walk(path.join(abs, name), rel ? `${rel}/${name}` : name, depth + 1);
        continue;
      }
      if (!ent.isFile()) continue;
      const fullRel = rel ? `${rel}/${name}` : name;
      try {
        const st = fs.statSync(path.join(abs, name));
        if (st.size > TREE_MAX_BYTES) continue;
      } catch {
        continue;
      }
      out.push(fullRel.replace(/\\/g, "/"));
    }
  };

  walk(root, "", 0);
  return out;
}

export function scheduleWorkspaceTreeR2Sync(projectKey: string, workspaceRoot: string): void {
  const rels = listDurableWorkspaceRelPaths(workspaceRoot);
  scheduleWorkspaceRelPathsR2Sync(projectKey, workspaceRoot, rels);
}

async function streamToBuffer(body: unknown): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (typeof (body as { transformToByteArray?: () => Promise<Uint8Array> }).transformToByteArray === "function") {
    const arr = await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
    return Buffer.from(arr);
  }
  // Node readable
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Buffer | string>) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Download objects under workspaces/{projectKey}/ into local workspaceRoot.
 * - Missing local files: always download
 * - mode=r2 and local empty tree: download all
 * - Skips .git/
 */
export async function hydrateWorkspaceFromR2(
  projectKey: string,
  workspaceRoot: string,
): Promise<{ downloaded: number; skipped: number; error?: string }> {
  const mode = getWorkspaceStorageMode();
  if (mode === "local") return { downloaded: 0, skipped: 0 };
  if (!isWorkspaceR2Configured()) {
    return { downloaded: 0, skipped: 0, error: "Workspace R2 not configured" };
  }

  const keyPrefix = `workspaces/${sanitizeProjectKey(projectKey)}/`;
  let downloaded = 0;
  let skipped = 0;

  try {
    const { client, bucket } = getWorkspaceS3();
    let token: string | undefined;
    do {
      const listed = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: keyPrefix,
          ContinuationToken: token,
        }),
      );
      for (const obj of listed.Contents || []) {
        const fullKey = obj.Key || "";
        if (!fullKey.startsWith(keyPrefix)) continue;
        const rel = fullKey.slice(keyPrefix.length);
        if (!rel || rel.endsWith("/")) continue;
        if (rel.split("/").includes(".git") || rel.split("/").includes("node_modules")) {
          skipped++;
          continue;
        }
        const dest = path.join(workspaceRoot, ...rel.split("/"));
        const exists = fs.existsSync(dest);
        if (exists && mode === "dual") {
          skipped++;
          continue;
        }
        if (exists && mode === "r2") {
          // Keep local if present; ephemeral Container will miss files and re-hydrate
          skipped++;
          continue;
        }
        const got = await client.send(
          new GetObjectCommand({ Bucket: bucket, Key: fullKey }),
        );
        const buf = await streamToBuffer(got.Body);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, buf);
        downloaded++;
      }
      token = listed.IsTruncated ? listed.NextContinuationToken : undefined;
    } while (token);

    return { downloaded, skipped };
  } catch (e) {
    return {
      downloaded,
      skipped,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * After local ensureCloudProjectWorkspace, pull missing files from R2 (r2|dual).
 */
export async function hydrateWorkspaceFromR2Safe(
  projectKey: string,
  workspaceRoot: string,
): Promise<void> {
  const mode = getWorkspaceStorageMode();
  if (mode === "local") return;
  const r = await hydrateWorkspaceFromR2(projectKey, workspaceRoot);
  if (r.error) {
    console.warn(`[nebula] workspace R2 hydrate (${projectKey}):`, r.error);
  } else if (r.downloaded > 0) {
    console.log(
      `[nebula] workspace R2 hydrate ${projectKey}: downloaded=${r.downloaded} skipped=${r.skipped}`,
    );
  }
}

/** Remove durable objects after an explicit user reset (otherwise deploy would restore the wiped app). */
export async function deleteWorkspacePrefixFromR2(
  projectKey: string,
): Promise<{ deleted: number; error?: string }> {
  const mode = getWorkspaceStorageMode();
  if (mode === "local") return { deleted: 0 };
  if (!isWorkspaceR2Configured()) {
    return { deleted: 0, error: "Workspace R2 not configured" };
  }
  const keyPrefix = `workspaces/${sanitizeProjectKey(projectKey)}/`;
  let deleted = 0;
  try {
    const { client, bucket } = getWorkspaceS3();
    let token: string | undefined;
    do {
      const listed = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: keyPrefix,
          ContinuationToken: token,
        }),
      );
      const keys = (listed.Contents || [])
        .map((o) => o.Key)
        .filter((k): k is string => Boolean(k));
      if (keys.length > 0) {
        await client.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
          }),
        );
        deleted += keys.length;
      }
      token = listed.IsTruncated ? listed.NextContinuationToken : undefined;
    } while (token);
    return { deleted };
  } catch (e) {
    return { deleted, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteWorkspacePrefixFromR2Safe(projectKey: string): Promise<void> {
  const r = await deleteWorkspacePrefixFromR2(projectKey);
  if (r.error) {
    console.warn(`[nebula] workspace R2 delete (${projectKey}):`, r.error);
  } else if (r.deleted > 0) {
    console.log(`[nebula] workspace R2 delete ${projectKey}: deleted=${r.deleted}`);
  }
}
