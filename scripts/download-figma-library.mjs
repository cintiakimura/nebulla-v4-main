/**
 * scripts/download-figma-library.mjs
 *
 * Sequential Figma library downloader (owned FileKeys only).
 * - Resume-safe via download-manifest.json
 * - 429 / 5xx backoff
 * - Permanent fail on 404 / 403
 *
 * Usage:
 *   FIGMA_API_KEY=figd_xxx node scripts/download-figma-library.mjs ./figma-keys.csv
 *
 * Optional:
 *   DELAY_MS=2500 MAX_RETRIES=4 \
 *   OUT_DIR=./nebulla-project/figma-library/raw \
 *   MANIFEST_PATH=./nebulla-project/figma-library/download-manifest.json \
 *   node scripts/download-figma-library.mjs ./nebulla-project/figma-library/figma-keys.csv
 *
 * Does NOT wire into Generate UI runtime.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

/** Load repo `.env` into process.env (does not override existing exports). */
function loadDotEnv() {
  const p = path.join(REPO_ROOT, ".env");
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

loadDotEnv();

const API = "https://api.figma.com/v1";
const TOKEN = (process.env.FIGMA_API_KEY || "").trim();
const DELAY_MS = Number(process.env.DELAY_MS || 2500);
const MAX_RETRIES = Number(process.env.MAX_RETRIES || 4);
const OUT_DIR = process.env.OUT_DIR
  ? path.resolve(process.env.OUT_DIR)
  : path.join(REPO_ROOT, "nebulla-project", "figma-library", "raw");
const MANIFEST_PATH = process.env.MANIFEST_PATH
  ? path.resolve(process.env.MANIFEST_PATH)
  : path.join(REPO_ROOT, "nebulla-project", "figma-library", "download-manifest.json");
const DEFAULT_CSV = path.join(REPO_ROOT, "nebulla-project", "figma-library", "figma-keys.csv");
const EXAMPLE_CSV = path.join(
  REPO_ROOT,
  "nebulla-project",
  "figma-library",
  "figma-keys.example.csv",
);

if (!TOKEN) {
  console.error("Missing FIGMA_API_KEY (set in .env or export FIGMA_API_KEY=figd_…)");
  process.exit(1);
}

const csvPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : fs.existsSync(DEFAULT_CSV)
    ? DEFAULT_CSV
    : EXAMPLE_CSV;
if (!fs.existsSync(csvPath)) {
  console.error(
    "Usage: npm run figma:download -- [keys.csv]\n" +
      "Copy nebulla-project/figma-library/figma-keys.example.csv → figma-keys.csv and fill owned FileKeys.",
  );
  process.exit(1);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function jitter(ms) {
  const delta = Math.floor(Math.random() * 800) - 400;
  return Math.max(500, ms + delta);
}

function parseCsv(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];

  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const iBucket = header.findIndex((h) => h === "bucket");
  const iLink = header.findIndex((h) => h === "link");
  const iKey = header.findIndex((h) => h === "filekey" || h === "file_key" || h === "key");

  if (iKey < 0) throw new Error("CSV must have a FileKey column");

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    const file_key = (cols[iKey] || "").trim();
    if (!file_key || file_key.length < 8) continue;
    // Skip CSV placeholders from the example file
    if (
      /your[_-]?owned|your[_-]?key|placeholder|xxxx/i.test(file_key) ||
      file_key.includes("…") ||
      file_key.includes("...")
    ) {
      continue;
    }
    rows.push({
      bucket: iBucket >= 0 ? cols[iBucket] || "" : "",
      link: iLink >= 0 ? cols[iLink] || "" : "",
      file_key,
    });
  }
  const seen = new Set();
  return rows.filter((r) => {
    if (seen.has(r.file_key)) return false;
    seen.add(r.file_key);
    return true;
  });
}

function loadManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  } catch {
    return {};
  }
}

function saveManifest(manifest) {
  fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

async function figmaGet(urlPath) {
  const res = await fetch(`${API}${urlPath}`, {
    headers: { "X-Figma-Token": TOKEN },
  });
  const retryAfter = res.headers.get("retry-after");
  let bodyText = "";
  try {
    bodyText = await res.text();
  } catch {
    bodyText = "";
  }
  let json = null;
  try {
    json = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    json = null;
  }
  return { status: res.status, retryAfter, json, bodyText };
}

async function downloadOne(row, manifest) {
  const { file_key, bucket, link } = row;
  const dir = path.join(OUT_DIR, file_key);
  const docPath = path.join(dir, "document.json");
  const metaPath = path.join(dir, "meta.json");

  const prev = manifest[file_key];
  if (prev?.status === "ok" && fs.existsSync(docPath)) {
    console.log(`SKIP  ${file_key} (already ok)`);
    return;
  }

  fs.mkdirSync(dir, { recursive: true });

  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    attempt++;
    console.log(`GET   ${file_key}  attempt=${attempt}/${MAX_RETRIES}  bucket=${bucket || "-"}`);

    const { status, retryAfter, json, bodyText } = await figmaGet(`/files/${file_key}`);

    if (status === 200 && json) {
      fs.writeFileSync(docPath, JSON.stringify(json, null, 2), "utf8");
      const meta = {
        file_key,
        bucket,
        link,
        status: "ok",
        http_status: 200,
        downloaded_at: new Date().toISOString(),
        bytes: Buffer.byteLength(JSON.stringify(json)),
        name: json.name || null,
        retries: attempt - 1,
      };
      fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
      manifest[file_key] = meta;
      saveManifest(manifest);
      console.log(`OK    ${file_key}  (${meta.bytes} bytes)`);
      return;
    }

    if (status === 404 || status === 403) {
      const meta = {
        file_key,
        bucket,
        link,
        status: status === 404 ? "not_found" : "forbidden",
        http_status: status,
        downloaded_at: new Date().toISOString(),
        error: (json && json.err) || bodyText.slice(0, 200),
        retries: attempt - 1,
      };
      fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
      manifest[file_key] = meta;
      saveManifest(manifest);
      console.log(`FAIL  ${file_key}  permanent ${status}`);
      return;
    }

    if (status === 429) {
      const waitSec = retryAfter ? Number(retryAfter) : Math.min(120, 10 * attempt);
      console.log(`WAIT  ${file_key}  429 → sleep ${waitSec}s`);
      await sleep(waitSec * 1000);
      continue;
    }

    if (status >= 500) {
      const waitSec = Math.min(120, 15 * attempt);
      console.log(`WAIT  ${file_key}  ${status} → sleep ${waitSec}s`);
      await sleep(waitSec * 1000);
      continue;
    }

    const meta = {
      file_key,
      bucket,
      link,
      status: "error",
      http_status: status,
      downloaded_at: new Date().toISOString(),
      error: (json && json.err) || bodyText.slice(0, 200),
      retries: attempt - 1,
    };
    fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
    manifest[file_key] = meta;
    saveManifest(manifest);
    console.log(`ERR   ${file_key}  status=${status}`);
    return;
  }

  const meta = {
    file_key,
    bucket,
    link,
    status: "exhausted_retries",
    http_status: null,
    downloaded_at: new Date().toISOString(),
    retries: MAX_RETRIES,
  };
  fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
  manifest[file_key] = meta;
  saveManifest(manifest);
  console.log(`GIVEUP ${file_key}`);
}

async function main() {
  const rows = parseCsv(fs.readFileSync(csvPath, "utf8"));
  console.log(`Loaded ${rows.length} unique FileKeys from ${csvPath}`);
  console.log(`OUT_DIR=${OUT_DIR}  DELAY_MS=${DELAY_MS}  MAX_RETRIES=${MAX_RETRIES}`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const manifest = loadManifest();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    console.log(`\n[${i + 1}/${rows.length}]`);
    await downloadOne(row, manifest);
    if (i < rows.length - 1) {
      const wait = jitter(DELAY_MS);
      console.log(`... pause ${wait}ms`);
      await sleep(wait);
    }
  }

  const values = Object.values(manifest);
  const summary = {
    ok: values.filter((v) => v.status === "ok").length,
    not_found: values.filter((v) => v.status === "not_found").length,
    forbidden: values.filter((v) => v.status === "forbidden").length,
    error: values.filter((v) => v.status === "error" || v.status === "exhausted_retries").length,
    total_tracked: values.length,
  };
  console.log("\n=== SUMMARY ===");
  console.log(summary);
  console.log(`Manifest: ${MANIFEST_PATH}`);
  console.log(`Raw files: ${OUT_DIR}/`);
  console.log("Next: npm run figma:profile-drafts");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
