/**
 * Cloudflare R2 object storage (S3-compatible API).
 * Env: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_ACCESS_KEY_ID, CLOUDFLARE_SECRET_ACCESS_KEY,
 *      CLOUDFLARE_R2_BUCKET_NAME, CLOUDFLARE_R2_PUBLIC_URL (optional custom domain / public bucket URL).
 */

import {
  DeleteObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const REQUIRED_ENV = [
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_ACCESS_KEY_ID",
  "CLOUDFLARE_SECRET_ACCESS_KEY",
  "CLOUDFLARE_R2_BUCKET_NAME",
] as const;

export type R2EnvVar = (typeof REQUIRED_ENV)[number];

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  /** Optional public base URL (no trailing slash), e.g. https://pub-xxx.r2.dev or custom domain */
  publicUrl?: string;
};

export type R2ResolveOk = { ok: true; config: R2Config };
export type R2ResolveErr = {
  ok: false;
  missing: R2EnvVar[];
  message: string;
};
export type R2ResolveResult = R2ResolveOk | R2ResolveErr;

export class R2NotConfiguredError extends Error {
  readonly missing: R2EnvVar[];
  readonly hint: string;

  constructor(missing: R2EnvVar[]) {
    const hint =
      "Cloudflare R2 is not configured. Set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_ACCESS_KEY_ID, CLOUDFLARE_SECRET_ACCESS_KEY, and CLOUDFLARE_R2_BUCKET_NAME in .env (optional: CLOUDFLARE_R2_PUBLIC_URL).";
    super(hint);
    this.name = "R2NotConfiguredError";
    this.missing = missing;
    this.hint = hint;
  }
}

let cachedClient: S3Client | null = null;
let cachedConfig: R2Config | null = null;

export function getMissingR2EnvVars(): R2EnvVar[] {
  const missing: R2EnvVar[] = [];
  for (const key of REQUIRED_ENV) {
    const v = process.env[key]?.trim() ?? "";
    if (!v) missing.push(key);
  }
  return missing;
}

export function isR2Configured(): boolean {
  return getMissingR2EnvVars().length === 0;
}

export function resolveR2Config(): R2ResolveResult {
  const missing = getMissingR2EnvVars();
  if (missing.length > 0) {
    return {
      ok: false,
      missing,
      message: `Missing R2 environment variable(s): ${missing.join(", ")}`,
    };
  }
  const publicRaw = process.env.CLOUDFLARE_R2_PUBLIC_URL?.trim();
  return {
    ok: true,
    config: {
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID!.trim(),
      accessKeyId: process.env.CLOUDFLARE_ACCESS_KEY_ID!.trim(),
      secretAccessKey: process.env.CLOUDFLARE_SECRET_ACCESS_KEY!.trim(),
      bucketName: process.env.CLOUDFLARE_R2_BUCKET_NAME!.trim(),
      publicUrl: publicRaw ? publicRaw.replace(/\/+$/, "") : undefined,
    },
  };
}

function r2Endpoint(accountId: string): string {
  return `https://${accountId}.r2.cloudflarestorage.com`;
}

export function getR2Client(): { client: S3Client; config: R2Config } {
  const resolved = resolveR2Config();
  if (resolved.ok === false) {
    throw new R2NotConfiguredError(resolved.missing);
  }
  const config = resolved.config;
  if (cachedClient && cachedConfig && cachedConfig.bucketName === config.bucketName) {
    return { client: cachedClient, config: cachedConfig };
  }
  cachedConfig = config;
  cachedClient = new S3Client({
    region: "auto",
    endpoint: r2Endpoint(config.accountId),
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  return { client: cachedClient, config };
}

export function buildObjectPublicUrl(config: R2Config, objectKey: string): string | undefined {
  if (!config.publicUrl) return undefined;
  const key = objectKey.replace(/^\/+/, "");
  return `${config.publicUrl}/${key}`;
}

export function sanitizeStorageFilename(name: string): string {
  const base = name.replace(/\\/g, "/").split("/").pop() || "file";
  const cleaned = base.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned.slice(0, 120) || "file";
}

export type UploadToR2Params = {
  objectKey: string;
  body: Buffer | Uint8Array | string;
  contentType: string;
  cacheControl?: string;
};

export type UploadToR2Result = {
  bucket: string;
  key: string;
  etag?: string;
  url?: string;
};

export async function uploadToR2(params: UploadToR2Params): Promise<UploadToR2Result> {
  const { client, config } = getR2Client();
  const key = params.objectKey.replace(/^\/+/, "");
  const out = await client.send(
    new PutObjectCommand({
      Bucket: config.bucketName,
      Key: key,
      Body: params.body,
      ContentType: params.contentType,
      ...(params.cacheControl ? { CacheControl: params.cacheControl } : {}),
    })
  );
  return {
    bucket: config.bucketName,
    key,
    etag: out.ETag,
    url: buildObjectPublicUrl(config, key),
  };
}

export async function deleteFromR2(objectKey: string): Promise<void> {
  const { client, config } = getR2Client();
  await client.send(
    new DeleteObjectCommand({
      Bucket: config.bucketName,
      Key: objectKey.replace(/^\/+/, ""),
    })
  );
}

/** Verify bucket credentials (lightweight HeadBucket). */
export async function probeR2Bucket(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { client, config } = getR2Client();
    await client.send(new HeadBucketCommand({ Bucket: config.bucketName }));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function buildProjectAssetKey(
  projectKey: string,
  category: "images" | "assets" | "generated",
  filename: string
): string {
  const safeProject = projectKey.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 64) || "project";
  const safeName = sanitizeStorageFilename(filename);
  const ts = Date.now();
  return `projects/${safeProject}/${category}/${ts}-${safeName}`;
}

export function contentTypeFromFilename(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".pdf")) return "application/pdf";
  return "application/octet-stream";
}

export async function uploadProjectAsset(params: {
  projectKey: string;
  category: "images" | "assets" | "generated";
  filename: string;
  body: Buffer | Uint8Array | string;
  contentType?: string;
}): Promise<UploadToR2Result> {
  const contentType = params.contentType || contentTypeFromFilename(params.filename);
  const key = buildProjectAssetKey(params.projectKey, params.category, params.filename);
  return uploadToR2({
    objectKey: key,
    body: params.body,
    contentType,
    cacheControl: "public, max-age=31536000, immutable",
  });
}
