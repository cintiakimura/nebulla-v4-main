/**
 * Probe FIGMA_API_KEY + FIGMA_REFERENCE_FILE_KEYS (+ optional BUCKETS).
 * Never prints secrets.
 * Usage: npm run check:figma-refs
 */
import fs from "fs";
import path from "path";

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

const KNOWN = new Set(["mobile", "landing", "dashboard", "auth", "web"]);

function parseBuckets(raw: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const part of raw.split(",")) {
    const t = part.trim();
    if (!t) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const bucket = t.slice(0, eq).trim().toLowerCase();
    const fileKey = t.slice(eq + 1).trim();
    if (!KNOWN.has(bucket) || !fileKey) continue;
    const list = map.get(bucket) || [];
    if (!list.includes(fileKey)) list.push(fileKey);
    map.set(bucket, list);
  }
  return map;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(url: string, headers: Record<string, string>): Promise<Response | null> {
  const maxAttempts = Math.max(1, Number(process.env.FIGMA_PROBE_RETRIES || "4") || 4);
  let res: Response | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      res = await fetch(url, { headers });
    } catch {
      res = null;
    }
    if (!res) {
      await sleep(1000 * attempt);
      continue;
    }
    if (res.status !== 429 && res.status < 500) return res;
    // Cap wait — Figma sometimes returns huge Retry-After values that would hang the probe.
    const retryAfter = Number(res.headers.get("retry-after") || "");
    const fromHeader =
      Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(90, retryAfter) * 1000 : 0;
    const waitMs = fromHeader || Math.min(60_000, 5000 * attempt);
    if (attempt < maxAttempts) {
      console.log(`       rate-limited (HTTP ${res.status}) — waiting ${Math.round(waitMs / 1000)}s…`);
      await sleep(waitMs);
    }
  }
  return res;
}

async function main() {
  loadDotEnv();
  const token = (process.env.FIGMA_API_KEY || "").trim();
  const keys = (process.env.FIGMA_REFERENCE_FILE_KEYS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const buckets = parseBuckets(process.env.FIGMA_REFERENCE_BUCKETS || "");
  const maxFiles = Math.min(
    8,
    Math.max(1, Number(process.env.FIGMA_REFERENCE_MAX_FILES || "3") || 3),
  );

  console.log("FIGMA_API_KEY:", token ? `set (len ${token.length}, prefix ${token.slice(0, 5)})` : "MISSING");
  console.log("FIGMA_REFERENCE_FILE_KEYS:", keys.length ? keys.join(", ") : "MISSING");
  console.log("FIGMA_REFERENCE_MAX_FILES:", maxFiles);
  if (buckets.size > 0) {
    console.log(
      "FIGMA_REFERENCE_BUCKETS:",
      [...buckets.entries()].map(([b, ks]) => `${b}=${ks.join("|")}`).join(", "),
    );
  } else {
    console.log("FIGMA_REFERENCE_BUCKETS: (unset — CSV order / score only)");
  }

  if (!token) {
    console.log("\nFAIL — set FIGMA_API_KEY");
    process.exit(1);
  }

  const me = await fetch("https://api.figma.com/v1/me", {
    headers: { "X-Figma-Token": token },
  });
  console.log(
    `/v1/me: ${me.status}${me.status === 403 ? " (optional — fine without current_user:read)" : me.ok ? " PASS" : ""}`,
  );
  if (me.status === 401) {
    console.log("FAIL — token unauthorized");
    process.exit(1);
  }

  const probeKeys = [...new Set([...keys, ...[...buckets.values()].flat()])].slice(0, maxFiles);
  if (probeKeys.length === 0) {
    console.log("\nFAIL — set FIGMA_REFERENCE_FILE_KEYS (see docs/figma-reference-library.md)");
    process.exit(1);
  }

  let okCount = 0;
  const delayMs = Math.max(0, Number(process.env.FIGMA_PROBE_DELAY_MS || "1200") || 0);
  console.log("\nPer-key diagnostics:");
  for (let i = 0; i < probeKeys.length; i++) {
    const fileKey = probeKeys[i]!;
    if (i > 0 && delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
    const fr = await fetchWithRetry(
      `https://api.figma.com/v1/files/${encodeURIComponent(fileKey)}?depth=2`,
      { "X-Figma-Token": token },
    );
    if (!fr) {
      console.log(`FAIL  file ${fileKey.slice(0, 12)}… → network`);
      continue;
    }
    let name = "";
    let outcome = String(fr.status);
    if (fr.ok) {
      const data = (await fr.json()) as { name?: string };
      name = data.name || "";
      okCount += 1;
      outcome = "ok";
    } else if (fr.status === 404) outcome = "404";
    else if (fr.status === 401) outcome = "401";
    else if (fr.status === 403) outcome = "403";
    else if (fr.status === 429) outcome = "429";
    else if (fr.status >= 500) outcome = "5xx";
    console.log(
      `${fr.ok ? "PASS" : "FAIL"}  ${fileKey.slice(0, 12)}… → ${outcome} (http ${fr.status})${name ? ` (${name})` : ""}`,
    );
    if (fr.status === 404) {
      console.log("       hint: Community catalog IDs 404 — Duplicate into your account, use /design/<KEY>/");
    }
  }

  if (okCount > 0) {
    console.log(`\nALL NEEDED PASS — ${okCount}/${probeKeys.length} file(s) readable`);
    process.exit(0);
  }
  console.log("\nFAIL — no readable files");
  console.log(
    "hint: HTTP 429 = Figma rate limit. Wait a few minutes, then run:\n" +
      "  FIGMA_PROBE_DELAY_MS=5000 npm run check:figma-refs\n" +
      "(delay must be on the same line as npm, or use: export FIGMA_PROBE_DELAY_MS=5000)",
  );
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
