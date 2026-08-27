/**
 * Daily-capped Figma shortlist ingest (side job).
 * Does NOT wire into Generate UI / Master Plan / Go.
 *
 *   npm run figma:ingest-daily
 *
 * Requires FIGMA_API_KEY. Max 10 keys/UTC day. Sleep 8–10s between live calls.
 * On HTTP 429: set rate_limited and stop (no hammer).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import {
  FIGMA_INGEST_MAX_PER_DAY,
  acquireIngestLock,
  createDefaultStatus,
  defaultFigmaLibraryRoot,
  filterPendingKeys,
  ingestStatusPath,
  loadIngestKeyRows,
  pickBatch,
  prioritizePendingIngest,
  readStatusFile,
  refreshIngestLock,
  releaseIngestLock,
  rollDayIfNeeded,
  slotsRemainingToday,
  touchStatus,
  writeStatusFile,
  type FigmaIngestStatus,
} from "../lib/figmaIngestStatus.ts";

const require = createRequire(import.meta.url);
const { extractStructureForKey } = require("./lib/figma-structure-extract.mjs") as {
  extractStructureForKey: (
    libraryRoot: string,
    fileKey: string,
  ) => { ok: true; path: string } | { ok: false; error: string };
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

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

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function delayBetweenCallsMs(): number {
  return 8000 + Math.floor(Math.random() * 2001);
}

function logStatus(status: FigmaIngestStatus) {
  console.log(
    `[figma-ingest] state=${status.state} day=${status.dayUTC} today=${status.downloadedToday}/${status.maxPerDay} remaining=${status.remainingKeys} | ${status.message}`,
  );
}

async function figmaGet(
  token: string,
  urlPath: string,
): Promise<{ status: number; retryAfter: string | null; json: unknown; bodyText: string }> {
  const res = await fetch(`https://api.figma.com/v1${urlPath}`, {
    headers: { "X-Figma-Token": token },
  });
  const retryAfter = res.headers.get("retry-after");
  let bodyText = "";
  try {
    bodyText = await res.text();
  } catch {
    bodyText = "";
  }
  let json: unknown = null;
  try {
    json = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    json = null;
  }
  return { status: res.status, retryAfter, json, bodyText };
}

async function downloadRaw(
  libraryRoot: string,
  token: string,
  row: { file_key: string; bucket: string; link: string },
): Promise<
  | { ok: true }
  | { ok: false; kind: "rate_limited"; retryAfter: string | null; error: string }
  | { ok: false; kind: "error"; error: string; permanent?: boolean }
> {
  const { file_key, bucket, link } = row;
  const dir = path.join(libraryRoot, "raw", file_key);
  const docPath = path.join(dir, "document.json");
  const metaPath = path.join(dir, "meta.json");
  fs.mkdirSync(dir, { recursive: true });

  const { status, retryAfter, json, bodyText } = await figmaGet(token, `/files/${file_key}`);

  if (status === 200 && json && typeof json === "object") {
    const payload = json as { name?: string };
    fs.writeFileSync(docPath, `${JSON.stringify(json, null, 2)}\n`, "utf8");
    const meta = {
      file_key,
      bucket,
      link,
      status: "ok",
      http_status: 200,
      downloaded_at: new Date().toISOString(),
      bytes: Buffer.byteLength(JSON.stringify(json)),
      name: payload.name || null,
      source: "figma-ingest-daily",
    };
    fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
    return { ok: true };
  }

  if (status === 429) {
    return {
      ok: false,
      kind: "rate_limited",
      retryAfter,
      error: retryAfter ? `HTTP 429 Retry-After=${retryAfter}` : "HTTP 429",
    };
  }

  if (status === 404 || status === 403) {
    const meta = {
      file_key,
      bucket,
      link,
      status: status === 404 ? "not_found" : "forbidden",
      http_status: status,
      downloaded_at: new Date().toISOString(),
      error: bodyText.slice(0, 200),
      source: "figma-ingest-daily",
    };
    fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
    return {
      ok: false,
      kind: "error",
      permanent: true,
      error: `HTTP ${status} for ${file_key}`,
    };
  }

  return {
    ok: false,
    kind: "error",
    error: `HTTP ${status}: ${bodyText.slice(0, 160)}`,
  };
}

export type RunFigmaIngestOptions = {
  libraryRoot?: string;
  token?: string | null;
  now?: Date;
  /** Test hook: skip live network */
  downloadFn?: typeof downloadRaw;
  sleepFn?: (ms: number) => Promise<void>;
  betweenCallsMs?: number;
};

export async function runFigmaIngestDaily(
  opts: RunFigmaIngestOptions = {},
): Promise<{ status: FigmaIngestStatus; exitCode: number }> {
  const now0 = opts.now ?? new Date();
  const libraryRoot = opts.libraryRoot ?? defaultFigmaLibraryRoot(REPO_ROOT);
  const statusFile = ingestStatusPath(libraryRoot);
  const sleepFn = opts.sleepFn ?? sleep;
  const downloadFn = opts.downloadFn ?? downloadRaw;

  fs.mkdirSync(libraryRoot, { recursive: true });

  const lock = acquireIngestLock(libraryRoot, now0);
  if (lock.ok === false) {
    const reason = lock.reason;
    let status = rollDayIfNeeded(readStatusFile(statusFile, now0), now0);
    status = touchStatus(
      status,
      {
        message: `Rejected: ${reason === "already_running" || reason === "lock_held" ? "ingest already running" : reason}`,
      },
      now0,
    );
    writeStatusFile(statusFile, status);
    logStatus(status);
    return { status, exitCode: 2 };
  }

  let status = rollDayIfNeeded(readStatusFile(statusFile, now0), now0);
  const token = (opts.token !== undefined ? opts.token : process.env.FIGMA_API_KEY || "").trim();

  try {
    const rows = loadIngestKeyRows(libraryRoot);
    if (!rows.length) {
      status = touchStatus(
        createDefaultStatus({}, now0),
        {
          state: "error",
          lastError: "missing_keys_csv",
          message: "Missing sheet-catalog.json and figma-keys.csv / figma-keys.example.csv",
        },
        now0,
      );
      writeStatusFile(statusFile, status);
      logStatus(status);
      return { status, exitCode: 1 };
    }

    const allKeys = rows.map((r) => r.file_key);
    const pending = filterPendingKeys(libraryRoot, allKeys);
    const slots = slotsRemainingToday(status);
    const activeBucket = (process.env.FIGMA_INGEST_ACTIVE_BUCKET || "").trim().toLowerCase();
    const orderedPending = prioritizePendingIngest(pending, rows, activeBucket || undefined);

    status = touchStatus(
      status,
      {
        state: "running",
        remainingKeys: pending.length,
        currentFileKey: null,
        lastError: null,
        maxPerDay: FIGMA_INGEST_MAX_PER_DAY,
        message:
          pending.length === 0
            ? "Shortlist complete — nothing to download"
            : `Starting ingest — ${pending.length} pending, ${slots} slots today`,
      },
      now0,
    );
    writeStatusFile(statusFile, status);
    logStatus(status);

    if (!token) {
      status = touchStatus(
        status,
        {
          state: "error",
          lastError: "missing_FIGMA_API_KEY",
          message: "Missing FIGMA_API_KEY — set in .env or export; side ingest only",
          currentFileKey: null,
        },
        new Date(),
      );
      writeStatusFile(statusFile, status);
      logStatus(status);
      return { status, exitCode: 1 };
    }

    if (pending.length === 0) {
      status = touchStatus(
        status,
        {
          state: "complete_shortlist",
          remainingKeys: 0,
          currentFileKey: null,
          message: "Idle — shortlist already has usable structure for all keys",
        },
        new Date(),
      );
      writeStatusFile(statusFile, status);
      logStatus(status);
      return { status, exitCode: 0 };
    }

    if (slots <= 0) {
      status = touchStatus(
        status,
        {
          state: "daily_cap_reached",
          remainingKeys: pending.length,
          currentFileKey: null,
          message: `Daily cap reached (${status.downloadedToday}/${status.maxPerDay} UTC ${status.dayUTC}) — ${pending.length} left in shortlist`,
        },
        new Date(),
      );
      writeStatusFile(statusFile, status);
      logStatus(status);
      return { status, exitCode: 0 };
    }

    const batchKeys = pickBatch(orderedPending, slots);
    const byKey = new Map(rows.map((r) => [r.file_key, r]));
    let first = true;

    for (const fileKey of batchKeys) {
      const now = new Date();
      if (!first) {
        const wait = opts.betweenCallsMs ?? delayBetweenCallsMs();
        status = touchStatus(
          status,
          {
            message: `Pacing ${Math.round(wait / 1000)}s before next key…`,
            currentFileKey: null,
          },
          now,
        );
        writeStatusFile(statusFile, status);
        refreshIngestLock(libraryRoot, now);
        logStatus(status);
        await sleepFn(wait);
      }
      first = false;

      const row = byKey.get(fileKey);
      if (!row) continue;

      const tBefore = new Date();
      status = touchStatus(
        status,
        {
          state: "running",
          currentFileKey: fileKey,
          remainingKeys: filterPendingKeys(libraryRoot, allKeys).length,
          message: `Downloading ${row.bucket || "file"} key ${fileKey}…`,
        },
        tBefore,
      );
      writeStatusFile(statusFile, status);
      refreshIngestLock(libraryRoot, tBefore);
      logStatus(status);

      const dl = await downloadFn(libraryRoot, token, row);
      if (dl.ok === false) {
        const t = new Date();
        const left = filterPendingKeys(libraryRoot, allKeys).length;
        if (dl.kind === "rate_limited") {
          const err = dl.error;
          const retryAfter = dl.retryAfter;
          status = touchStatus(
            status,
            {
              state: "rate_limited",
              currentFileKey: fileKey,
              remainingKeys: left,
              lastError: err,
              message: retryAfter
                ? `Waiting: rate limited (Retry-After=${retryAfter}) — stopped run`
                : "Waiting: rate limited — stopped run",
            },
            t,
          );
          writeStatusFile(statusFile, status);
          logStatus(status);
          return { status, exitCode: 3 };
        }
        const err = dl.error;
        if (dl.permanent) {
          // 403/404: leave without structure (do not invent). Count attempt toward daily cap; continue.
          status = touchStatus(
            status,
            {
              state: "running",
              downloadedToday: status.downloadedToday + 1,
              currentFileKey: null,
              remainingKeys: left,
              lastError: err,
              message: `Skip permanent fail ${fileKey}: ${err}`,
            },
            t,
          );
          writeStatusFile(statusFile, status);
          refreshIngestLock(libraryRoot, t);
          logStatus(status);
          continue;
        }
        status = touchStatus(
          status,
          {
            state: "error",
            currentFileKey: null,
            remainingKeys: left,
            lastError: err,
            message: `Error on ${fileKey}: ${err}`,
          },
          t,
        );
        writeStatusFile(statusFile, status);
        logStatus(status);
        return { status, exitCode: 1 };
      }

      const extracted = extractStructureForKey(libraryRoot, fileKey);
      const tAfter = new Date();
      if (extracted.ok === false) {
        const extractErr = extracted.error;
        status = touchStatus(
          status,
          {
            state: "error",
            downloadedToday: status.downloadedToday + 1,
            currentFileKey: null,
            lastError: extractErr,
            remainingKeys: filterPendingKeys(libraryRoot, allKeys).length,
            message: `Downloaded ${fileKey} but extract failed: ${extractErr}`,
          },
          tAfter,
        );
        writeStatusFile(statusFile, status);
        logStatus(status);
        return { status, exitCode: 1 };
      }

      const left = filterPendingKeys(libraryRoot, allKeys).length;
      status = touchStatus(
        status,
        {
          state: "running",
          downloadedToday: status.downloadedToday + 1,
          lastSuccessKey: fileKey,
          currentFileKey: null,
          remainingKeys: left,
          lastError: null,
          message: `OK ${fileKey} — structure written (${left} left in shortlist)`,
        },
        tAfter,
      );
      writeStatusFile(statusFile, status);
      refreshIngestLock(libraryRoot, tAfter);
      logStatus(status);
    }

    const tEnd = new Date();
    const leftEnd = filterPendingKeys(libraryRoot, allKeys).length;
    if (leftEnd === 0) {
      status = touchStatus(
        status,
        {
          state: "complete_shortlist",
          remainingKeys: 0,
          currentFileKey: null,
          message: "Complete — shortlist has usable structure for all keys",
        },
        tEnd,
      );
    } else if (slotsRemainingToday(status) <= 0) {
      status = touchStatus(
        status,
        {
          state: "daily_cap_reached",
          remainingKeys: leftEnd,
          currentFileKey: null,
          message: `Daily cap reached — Idle — ${leftEnd} left in shortlist`,
        },
        tEnd,
      );
    } else {
      status = touchStatus(
        status,
        {
          state: "idle",
          remainingKeys: leftEnd,
          currentFileKey: null,
          message: `Idle — ${leftEnd} left in shortlist`,
        },
        tEnd,
      );
    }
    writeStatusFile(statusFile, status);
    logStatus(status);
    return { status, exitCode: 0 };
  } finally {
    releaseIngestLock(libraryRoot);
  }
}

async function main() {
  loadDotEnv();
  const { exitCode } = await runFigmaIngestDaily();
  process.exit(exitCode);
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
