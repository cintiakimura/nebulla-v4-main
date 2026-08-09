/**
 * Smoke tests for daily-capped Figma ingest (no live Figma).
 * Run: npm run test:figma-ingest
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  FIGMA_INGEST_MAX_PER_DAY,
  createDefaultStatus,
  filterPendingKeys,
  hasUsableStructure,
  isStaleRunning,
  normalizeStatus,
  parseFigmaKeysCsv,
  pickBatch,
  recoverStaleRunning,
  rollDayIfNeeded,
  slotsRemainingToday,
  utcDay,
  writeStatusFile,
  readStatusFile,
  ingestStatusPath,
} from "../lib/figmaIngestStatus.ts";
import { runFigmaIngestDaily } from "./figma-ingest-daily.ts";

function section(name: string) {
  console.log(`\n✓ ${name}`);
}

function tmpLibrary(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "figma-ingest-"));
  const lib = path.join(root, "nebulla-project", "figma-library");
  fs.mkdirSync(lib, { recursive: true });
  return lib;
}

function writeStructure(lib: string, key: string) {
  const dir = path.join(lib, "structure", key);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "document.json"),
    JSON.stringify({ name: key, document: { name: "Document", type: "DOCUMENT", children: [] } }, null, 2),
    "utf8",
  );
}

{
  section("status shape + day roll");
  const now = new Date("2026-08-09T12:00:00.000Z");
  const s0 = createDefaultStatus({}, now);
  assert.equal(s0.maxPerDay, FIGMA_INGEST_MAX_PER_DAY);
  assert.equal(s0.dayUTC, "2026-08-09");
  assert.equal(s0.state, "idle");
  const rolled = rollDayIfNeeded(
    { ...s0, dayUTC: "2026-08-08", downloadedToday: 10, state: "daily_cap_reached" },
    now,
  );
  assert.equal(rolled.downloadedToday, 0);
  assert.equal(rolled.dayUTC, "2026-08-09");
  assert.equal(rolled.state, "idle");
  assert.equal(slotsRemainingToday({ ...s0, downloadedToday: 7 }), 3);
  assert.equal(slotsRemainingToday({ ...s0, downloadedToday: 10 }), 0);
}

{
  section("skip existing structure + pickBatch cap");
  const lib = tmpLibrary();
  writeStructure(lib, "AAA11111BB");
  const keys = ["AAA11111BB", "BBB22222CC", "CCC33333DD"];
  const pending = filterPendingKeys(lib, keys);
  assert.deepEqual(pending, ["BBB22222CC", "CCC33333DD"]);
  assert.equal(hasUsableStructure(lib, "AAA11111BB"), true);
  assert.deepEqual(pickBatch(pending, 1), ["BBB22222CC"]);
  assert.deepEqual(pickBatch(pending, 0), []);
}

{
  section("CSV parse skips placeholders");
  const rows = parseFigmaKeysCsv(
    "Bucket,Link,FileKey\nauth,https://x,MaFREMBRF3vQ8BhtqA2ZpK\nbad,https://x,your_owned_key_here\n",
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].file_key, "MaFREMBRF3vQ8BhtqA2ZpK");
}

{
  section("stale running recovery");
  const now = new Date("2026-08-09T12:00:00.000Z");
  const stale = createDefaultStatus(
    {
      state: "running",
      updatedAt: "2026-08-09T11:00:00.000Z",
      message: "mid",
    },
    now,
  );
  assert.equal(isStaleRunning(stale, now), true);
  const recovered = recoverStaleRunning(stale, now);
  assert.equal(recovered.state, "idle");
}

{
  section("status file round-trip");
  const lib = tmpLibrary();
  const p = ingestStatusPath(lib);
  const now = new Date("2026-08-09T15:00:00.000Z");
  writeStatusFile(
    p,
    createDefaultStatus(
      { state: "rate_limited", downloadedToday: 2, remainingKeys: 3, message: "Waiting: rate limited" },
      now,
    ),
  );
  const loaded = readStatusFile(p, now);
  assert.equal(loaded.state, "rate_limited");
  assert.equal(loaded.downloadedToday, 2);
  assert.equal(normalizeStatus({ state: "nope" }).state, "idle");
}

{
  section("daily cap enforced (mock download)");
  const lib = tmpLibrary();
  fs.writeFileSync(
    path.join(lib, "figma-keys.csv"),
    "Bucket,Link,FileKey\n" +
      Array.from({ length: 12 }, (_, i) => `b,https://x,KeyKeyKey${String(i).padStart(4, "0")}xx`).join("\n") +
      "\n",
    "utf8",
  );
  const now = new Date("2026-08-09T10:00:00.000Z");
  writeStatusFile(
    ingestStatusPath(lib),
    createDefaultStatus({ downloadedToday: 0, dayUTC: utcDay(now) }, now),
  );

  let calls = 0;
  const { status, exitCode } = await runFigmaIngestDaily({
    libraryRoot: lib,
    token: "test-token",
    now,
    betweenCallsMs: 0,
    sleepFn: async () => {},
    downloadFn: async (libraryRoot, _token, row) => {
      calls++;
      const dir = path.join(libraryRoot, "raw", row.file_key);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, "document.json"),
        JSON.stringify({
          name: row.file_key,
          document: { name: "Document", type: "DOCUMENT", children: [{ name: "F", type: "FRAME" }] },
        }),
        "utf8",
      );
      return { ok: true as const };
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(calls, 10, "max 10 downloads per day");
  assert.equal(status.downloadedToday, 10);
  assert.ok(status.state === "daily_cap_reached" || status.remainingKeys === 2);
  assert.equal(filterPendingKeys(lib, parseFigmaKeysCsv(fs.readFileSync(path.join(lib, "figma-keys.csv"), "utf8")).map((r) => r.file_key)).length, 2);
}

{
  section("429 stops with rate_limited");
  const lib = tmpLibrary();
  fs.writeFileSync(
    path.join(lib, "figma-keys.csv"),
    "Bucket,Link,FileKey\nauth,https://x,MaFREMBRF3vQ8BhtqA2ZpK\n",
    "utf8",
  );
  const { status, exitCode } = await runFigmaIngestDaily({
    libraryRoot: lib,
    token: "test-token",
    betweenCallsMs: 0,
    sleepFn: async () => {},
    downloadFn: async () => ({
      ok: false as const,
      kind: "rate_limited" as const,
      retryAfter: "60",
      error: "HTTP 429 Retry-After=60",
    }),
  });
  assert.equal(exitCode, 3);
  assert.equal(status.state, "rate_limited");
  assert.match(status.message, /rate limited/i);
}

{
  section("skip keys that already have structure");
  const lib = tmpLibrary();
  const key = "MaFREMBRF3vQ8BhtqA2ZpK";
  writeStructure(lib, key);
  fs.writeFileSync(
    path.join(lib, "figma-keys.csv"),
    `Bucket,Link,FileKey\nauth,https://x,${key}\n`,
    "utf8",
  );
  let calls = 0;
  const { status, exitCode } = await runFigmaIngestDaily({
    libraryRoot: lib,
    token: "test-token",
    betweenCallsMs: 0,
    sleepFn: async () => {},
    downloadFn: async () => {
      calls++;
      return { ok: true as const };
    },
  });
  assert.equal(exitCode, 0);
  assert.equal(calls, 0);
  assert.equal(status.state, "complete_shortlist");
}

{
  section("missing API key → error (no crash shape)");
  const lib = tmpLibrary();
  fs.writeFileSync(
    path.join(lib, "figma-keys.csv"),
    "Bucket,Link,FileKey\nauth,https://x,MaFREMBRF3vQ8BhtqA2ZpK\n",
    "utf8",
  );
  const { status, exitCode } = await runFigmaIngestDaily({
    libraryRoot: lib,
    token: "",
    betweenCallsMs: 0,
    sleepFn: async () => {},
  });
  assert.equal(exitCode, 1);
  assert.equal(status.state, "error");
  assert.match(status.message, /FIGMA_API_KEY/);
}

console.log("\nAll figma-ingest tests passed.\n");
