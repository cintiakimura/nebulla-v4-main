/**
 * Figma shortlist side-ingest status (offline library builder).
 * Main Generate / workflow MUST NOT wait on this job.
 */
import fs from "node:fs";
import path from "node:path";

export const FIGMA_INGEST_MAX_PER_DAY = 10;
export const FIGMA_INGEST_STALE_RUNNING_MS = 15 * 60 * 1000;

export type FigmaIngestState =
  | "idle"
  | "running"
  | "rate_limited"
  | "error"
  | "daily_cap_reached"
  | "complete_shortlist";

export type FigmaIngestStatus = {
  state: FigmaIngestState;
  updatedAt: string;
  dayUTC: string;
  downloadedToday: number;
  maxPerDay: number;
  currentFileKey: string | null;
  lastSuccessKey: string | null;
  lastError: string | null;
  remainingKeys: number;
  message: string;
};

export function defaultFigmaLibraryRoot(cwd: string = process.cwd()): string {
  return path.join(cwd, "nebulla-project", "figma-library");
}

export function ingestStatusPath(libraryRoot: string): string {
  return path.join(libraryRoot, "ingest-status.json");
}

export function ingestLockPath(libraryRoot: string): string {
  return path.join(libraryRoot, "ingest.lock");
}

export function utcDay(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function createDefaultStatus(
  overrides: Partial<FigmaIngestStatus> = {},
  now: Date = new Date(),
): FigmaIngestStatus {
  return {
    state: "idle",
    updatedAt: now.toISOString(),
    dayUTC: utcDay(now),
    downloadedToday: 0,
    maxPerDay: FIGMA_INGEST_MAX_PER_DAY,
    currentFileKey: null,
    lastSuccessKey: null,
    lastError: null,
    remainingKeys: 0,
    message: "Idle",
    ...overrides,
  };
}

export function normalizeStatus(raw: unknown, now: Date = new Date()): FigmaIngestStatus {
  const base = createDefaultStatus({}, now);
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  const state = String(o.state || "idle") as FigmaIngestState;
  const allowed: FigmaIngestState[] = [
    "idle",
    "running",
    "rate_limited",
    "error",
    "daily_cap_reached",
    "complete_shortlist",
  ];
  return {
    state: allowed.includes(state) ? state : "idle",
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : base.updatedAt,
    dayUTC: typeof o.dayUTC === "string" ? o.dayUTC : base.dayUTC,
    downloadedToday: Math.max(0, Number(o.downloadedToday) || 0),
    maxPerDay: Math.max(1, Number(o.maxPerDay) || FIGMA_INGEST_MAX_PER_DAY),
    currentFileKey: typeof o.currentFileKey === "string" ? o.currentFileKey : null,
    lastSuccessKey: typeof o.lastSuccessKey === "string" ? o.lastSuccessKey : null,
    lastError: typeof o.lastError === "string" ? o.lastError : null,
    remainingKeys: Math.max(0, Number(o.remainingKeys) || 0),
    message: typeof o.message === "string" ? o.message : base.message,
  };
}

export function rollDayIfNeeded(status: FigmaIngestStatus, now: Date = new Date()): FigmaIngestStatus {
  const day = utcDay(now);
  if (status.dayUTC === day) return status;
  return {
    ...status,
    dayUTC: day,
    downloadedToday: 0,
    updatedAt: now.toISOString(),
    message:
      status.state === "daily_cap_reached"
        ? "New UTC day — daily counter reset"
        : status.message,
    state: status.state === "daily_cap_reached" ? "idle" : status.state,
  };
}

export function isStaleRunning(
  status: FigmaIngestStatus,
  now: Date = new Date(),
  staleMs: number = FIGMA_INGEST_STALE_RUNNING_MS,
): boolean {
  if (status.state !== "running") return false;
  const t = Date.parse(status.updatedAt);
  if (!Number.isFinite(t)) return true;
  return now.getTime() - t > staleMs;
}

/** If running but heartbeat is stale, treat as killed mid-run → idle. */
export function recoverStaleRunning(
  status: FigmaIngestStatus,
  now: Date = new Date(),
  staleMs: number = FIGMA_INGEST_STALE_RUNNING_MS,
): FigmaIngestStatus {
  if (!isStaleRunning(status, now, staleMs)) return status;
  return {
    ...status,
    state: "idle",
    currentFileKey: null,
    updatedAt: now.toISOString(),
    message: "Recovered stale running lock (process likely killed mid-run)",
    lastError: status.lastError || "stale_running_recovered",
  };
}

export function slotsRemainingToday(status: FigmaIngestStatus): number {
  return Math.max(0, status.maxPerDay - status.downloadedToday);
}

export function hasUsableStructure(libraryRoot: string, fileKey: string): boolean {
  const p = path.join(libraryRoot, "structure", fileKey, "document.json");
  if (!fs.existsSync(p)) return false;
  try {
    const st = fs.statSync(p);
    if (st.size < 40) return false;
    const j = JSON.parse(fs.readFileSync(p, "utf8")) as { document?: unknown };
    return Boolean(j && j.document);
  } catch {
    return false;
  }
}

export function filterPendingKeys(libraryRoot: string, fileKeys: string[]): string[] {
  return fileKeys.filter((k) => !hasUsableStructure(libraryRoot, k));
}

export function pickBatch(pendingKeys: string[], slots: number): string[] {
  if (slots <= 0) return [];
  return pendingKeys.slice(0, slots);
}

/** Operator ingest order: active bucket missing structure → core buckets → rest of sheet. */
export function prioritizePendingIngest(
  pendingKeys: string[],
  rows: Array<{ file_key: string; bucket: string }>,
  activeBucket?: string,
): string[] {
  const byKey = new Map(rows.map((r) => [r.file_key, r]));
  const core = new Set(["auth", "mobile", "dashboard", "landing"]);
  const rank = (k: string) => {
    const b = (byKey.get(k)?.bucket || "").toLowerCase();
    if (activeBucket && b === activeBucket) return 0;
    if (core.has(b)) return 1;
    return 2;
  };
  return [...pendingKeys].sort(
    (a, b) => rank(a) - rank(b) || pendingKeys.indexOf(a) - pendingKeys.indexOf(b),
  );
}

export function readStatusFile(statusFile: string, now: Date = new Date()): FigmaIngestStatus {
  if (!fs.existsSync(statusFile)) return createDefaultStatus({}, now);
  try {
    return normalizeStatus(JSON.parse(fs.readFileSync(statusFile, "utf8")), now);
  } catch {
    return createDefaultStatus({ state: "error", lastError: "corrupt_status_file", message: "Corrupt ingest-status.json" }, now);
  }
}

export function writeStatusFile(statusFile: string, status: FigmaIngestStatus): void {
  fs.mkdirSync(path.dirname(statusFile), { recursive: true });
  fs.writeFileSync(statusFile, `${JSON.stringify(status, null, 2)}\n`, "utf8");
}

export function touchStatus(
  status: FigmaIngestStatus,
  patch: Partial<FigmaIngestStatus>,
  now: Date = new Date(),
): FigmaIngestStatus {
  return {
    ...status,
    ...patch,
    updatedAt: now.toISOString(),
  };
}

export function resolveKeysCsvPath(libraryRoot: string): string {
  const preferred = path.join(libraryRoot, "figma-keys.csv");
  const example = path.join(libraryRoot, "figma-keys.example.csv");
  if (fs.existsSync(preferred)) return preferred;
  return example;
}

/** Placeholder / junk keys must never be invented or fetched. */
export function isPlausibleFigmaFileKey(fileKey: string): boolean {
  const k = fileKey.trim();
  if (k.length < 8 || k.length > 128) return false;
  if (!/^[A-Za-z0-9]+$/.test(k)) return false;
  if (/your[_-]?owned|your[_-]?key|placeholder|xxxx/i.test(k)) return false;
  if (k.includes("…") || k.includes("...")) return false;
  return true;
}

export function parseSheetCatalogJson(
  text: string,
): Array<{ bucket: string; link: string; file_key: string }> {
  const data = JSON.parse(text) as {
    rows?: Array<{ file_key?: string; bucket?: string; design_url?: string; community_url?: string }>;
  };
  const rows: Array<{ bucket: string; link: string; file_key: string }> = [];
  for (const r of data.rows || []) {
    const file_key = String(r.file_key || "").trim();
    if (!isPlausibleFigmaFileKey(file_key)) continue;
    rows.push({
      bucket: String(r.bucket || ""),
      link: String(r.design_url || r.community_url || ""),
      file_key,
    });
  }
  return rows;
}

export function loadIngestKeyRows(libraryRoot: string): Array<{ bucket: string; link: string; file_key: string }> {
  const sheet = path.join(libraryRoot, "sheet-catalog.json");
  if (fs.existsSync(sheet)) {
    try {
      const rows = parseSheetCatalogJson(fs.readFileSync(sheet, "utf8"));
      if (rows.length) return rows;
    } catch {
      /* fall through to CSV */
    }
  }
  const csvPath = resolveKeysCsvPath(libraryRoot);
  if (!fs.existsSync(csvPath)) return [];
  return parseFigmaKeysCsv(fs.readFileSync(csvPath, "utf8"));
}

export function parseFigmaKeysCsv(text: string): Array<{ bucket: string; link: string; file_key: string }> {
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

  const rows: Array<{ bucket: string; link: string; file_key: string }> = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    const file_key = (cols[iKey] || "").trim();
    if (!isPlausibleFigmaFileKey(file_key)) continue;
    rows.push({
      bucket: iBucket >= 0 ? cols[iBucket] || "" : "",
      link: iLink >= 0 ? cols[iLink] || "" : "",
      file_key,
    });
  }
  const seen = new Set<string>();
  return rows.filter((r) => {
    if (seen.has(r.file_key)) return false;
    seen.add(r.file_key);
    return true;
  });
}

export function acquireIngestLock(
  libraryRoot: string,
  now: Date = new Date(),
  staleMs: number = FIGMA_INGEST_STALE_RUNNING_MS,
): { ok: true } | { ok: false; reason: string } {
  const lock = ingestLockPath(libraryRoot);
  const statusFile = ingestStatusPath(libraryRoot);
  let status = recoverStaleRunning(rollDayIfNeeded(readStatusFile(statusFile, now), now), now, staleMs);
  if (status.state === "running" && !isStaleRunning(status, now, staleMs)) {
    return { ok: false, reason: "already_running" };
  }
  if (fs.existsSync(lock)) {
    try {
      const meta = JSON.parse(fs.readFileSync(lock, "utf8")) as { updatedAt?: string; pid?: number };
      const t = Date.parse(String(meta.updatedAt || ""));
      if (Number.isFinite(t) && now.getTime() - t <= staleMs) {
        return { ok: false, reason: "lock_held" };
      }
    } catch {
      /* stale/corrupt lock → take over */
    }
    try {
      fs.unlinkSync(lock);
    } catch {
      /* ignore */
    }
  }
  if (status.state === "running") {
    status = recoverStaleRunning(status, now, staleMs);
    writeStatusFile(statusFile, status);
  }
  fs.mkdirSync(libraryRoot, { recursive: true });
  fs.writeFileSync(
    lock,
    `${JSON.stringify({ pid: process.pid, updatedAt: now.toISOString() }, null, 2)}\n`,
    "utf8",
  );
  return { ok: true };
}

export function releaseIngestLock(libraryRoot: string): void {
  const lock = ingestLockPath(libraryRoot);
  try {
    if (fs.existsSync(lock)) fs.unlinkSync(lock);
  } catch {
    /* ignore */
  }
}

export function refreshIngestLock(libraryRoot: string, now: Date = new Date()): void {
  const lock = ingestLockPath(libraryRoot);
  if (!fs.existsSync(lock)) return;
  try {
    const meta = JSON.parse(fs.readFileSync(lock, "utf8")) as Record<string, unknown>;
    meta.updatedAt = now.toISOString();
    meta.pid = process.pid;
    fs.writeFileSync(lock, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
  } catch {
    /* ignore */
  }
}

export function describeStuckHint(status: FigmaIngestStatus, now: Date = new Date()): string | null {
  if (isStaleRunning(status, now)) {
    return "Likely stuck: state=running but updatedAt older than 15 minutes. Re-run ingest to recover.";
  }
  return null;
}
