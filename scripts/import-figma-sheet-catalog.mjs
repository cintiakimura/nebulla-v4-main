#!/usr/bin/env node
/**
 * Import a CSV export of the Figma catalog sheet into:
 *   nebulla-project/figma-library/sheet-catalog.json
 *   nebulla-project/figma-library/sheet-catalog.csv
 *   nebulla-project/figma-library/figma-keys.example.csv  (operator ingest list)
 *   nebulla-project/ui-resource-catalog/profiles/sheet_*.json  (thin rows; skip existing keys)
 *
 * Usage:
 *   node scripts/import-figma-sheet-catalog.mjs [path/to/export.csv]
 *
 * Accepted CSV shapes (no invented keys):
 *   A) No header — 3 columns: category, url, file_key
 *   B) Header row containing some of:
 *      category | title | bucket | design_url | community_url | url | link | file_key | filekey | key
 *
 * Sheet: https://docs.google.com/spreadsheets/d/1PYQPOWzXnRiTn2j29db7fc9mprg2Yrc-KN5ESKfzo0o
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");
const LIB = path.join(REPO, "nebulla-project", "figma-library");
const PROFILES = path.join(REPO, "nebulla-project", "ui-resource-catalog", "profiles");

function bucketFromSheetCategory(category) {
  const c = (category || "").toLowerCase();
  if (/auth|login|register|onboarding|sign[\s_-]?in|signin/.test(c)) return "auth";
  if (/form/.test(c)) return "forms";
  if (/crypto|trading/.test(c)) return "mobile";
  if (/\bwireframe|\bwirefigma/.test(c)) {
    if (/mobile/.test(c) && !/web\s*\+|website/.test(c)) return "mobile";
    if (/website|landing/.test(c)) return "landing";
    return "wireframe";
  }
  if (
    /dashboard|admin|dashstack|tailadmin|metrix|smart charts|\bcharts\b|fintech|crm dashboard/.test(
      c,
    )
  ) {
    return "dashboard";
  }
  if (
    /landing|website wire|saas landing|startup|b2base|saasto|cloudhub|brainwave|whitepace|filo|landing play|landing \/ web/.test(
      c,
    )
  ) {
    return "landing";
  }
  if (/ios|mobile screens|mobile freebie|mobile lite|mobile wire|^mobile\b/.test(c)) {
    return "mobile";
  }
  if (/mobile/.test(c)) return "mobile";
  if (
    /untitled ui|plus ui|get ui|flowbite|material|ant design|heroui|shadcn|foundational|buttons mega|glow ui/.test(
      c,
    )
  ) {
    return "ds";
  }
  return "ds";
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function titleFromUrl(url) {
  try {
    const u = new URL(url);
    const last = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() || "");
    return last.replace(/--community.*/i, "").replace(/-/g, " ").trim() || last;
  } catch {
    return "";
  }
}

function parseRows(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const first = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const looksHeader =
    first.some((h) => /category|title|bucket|file_?key|filekey|^key$|url|link/.test(h)) &&
    first.some((h) => /category|title|bucket/.test(h)) &&
    first.some((h) => /file|key|url|link/.test(h)) &&
    !/^https?:\/\//.test(first[1] || "");

  const rows = [];
  const push = (category, url, fileKey, title) => {
    const file_key = (fileKey || "").trim();
    if (!/^[A-Za-z0-9]{8,128}$/.test(file_key)) return;
    const cat = (category || "Uncategorized").trim();
    const design_url = (url || "").trim();
    rows.push({
      file_key,
      category: cat,
      bucket: bucketFromSheetCategory(cat),
      title: (title || titleFromUrl(design_url) || cat).trim(),
      design_url: design_url || undefined,
      community_url: /community/i.test(design_url) ? design_url : undefined,
      source: "sheet",
      avoid_for_education: /crypto|trading|treyd|fintech/.test(`${cat} ${title || ""}`.toLowerCase()),
    });
  };

  if (!looksHeader) {
    for (const line of lines) {
      const cols = parseCsvLine(line);
      push(cols[0], cols[1], cols[2], cols[0]);
    }
    return rows;
  }

  const idx = (names) => first.findIndex((h) => names.includes(h));
  const iCat = idx(["category", "sheet_category"]);
  const iTitle = idx(["title", "name"]);
  const iUrl = idx(["design_url", "url", "link", "community_url"]);
  const iKey = idx(["file_key", "filekey", "key"]);
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const url = iUrl >= 0 ? cols[iUrl] : "";
    const key =
      iKey >= 0
        ? cols[iKey]
        : (url.match(/figma\.com\/(?:design|file|community\/file)\/([A-Za-z0-9]+)/) || [])[1];
    push(iCat >= 0 ? cols[iCat] : "", url, key, iTitle >= 0 ? cols[iTitle] : "");
  }
  return rows;
}

function csvEscape(s) {
  const t = String(s ?? "");
  if (/[",\n]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

function platformForBucket(bucket) {
  if (bucket === "landing") return "landing";
  if (bucket === "dashboard" || bucket === "ds" || bucket === "web") return "web";
  return "mobile";
}

function pageTypesForBucket(bucket) {
  if (bucket === "auth" || bucket === "forms") return ["auth"];
  if (bucket === "landing") return ["landing"];
  if (bucket === "dashboard") return ["dashboard"];
  if (bucket === "ds") return ["home", "dashboard", "other"];
  if (bucket === "wireframe") return ["home", "landing", "other"];
  return ["home", "list", "detail"];
}

function existingProfileKeys() {
  const keys = new Set();
  if (!fs.existsSync(PROFILES)) return keys;
  for (const name of fs.readdirSync(PROFILES)) {
    if (!name.endsWith(".json")) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(PROFILES, name), "utf8"));
      if (raw.figma_file_key) keys.add(raw.figma_file_key);
    } catch {
      /* skip */
    }
  }
  return keys;
}

function writeThinProfile(row) {
  const id = `sheet_${row.file_key}`.slice(0, 64);
  const platform = platformForBucket(row.bucket);
  const tags = [
    row.bucket,
    ...String(row.category)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2)
      .slice(0, 8),
  ];
  if (row.avoid_for_education) tags.push("finance");
  const profile = {
    id,
    kind: "template",
    platform,
    page_types: pageTypesForBucket(row.bucket),
    density: "medium",
    personality: ["clean", "professional"],
    best_for: [row.category, `${row.bucket} kit from catalog sheet`],
    strengths: ["Sheet-categorized community file for offline/catalog selection"],
    weaknesses: [
      "No extracted structure/ in this profile — do not treat as a compiled Figma layout",
    ],
    tags,
    description: `Sheet catalog row: ${row.category}. File key ${row.file_key}. Generate may select this key by bucket; live Figma is ingest-only.`,
    figma_file_key: row.file_key,
    license: "community",
    source: "sheet",
    version: "1",
    industry: row.avoid_for_education ? ["finance"] : [],
  };
  const file = path.join(PROFILES, `${id}.json`);
  fs.writeFileSync(file, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
  return file;
}

const inputPath = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.join(LIB, "sheet-source.csv");

if (!fs.existsSync(inputPath)) {
  console.error(
    `Missing CSV: ${inputPath}\nExport the sheet as CSV (category, url, file_key) and pass the path.`,
  );
  process.exit(1);
}

const rowsRaw = parseRows(fs.readFileSync(inputPath, "utf8"));
const seen = new Set();
const rows = [];
for (const r of rowsRaw) {
  if (seen.has(r.file_key)) continue;
  seen.add(r.file_key);
  rows.push(r);
}

if (!rows.length) {
  console.error("No plausible file keys parsed.");
  process.exit(1);
}

fs.mkdirSync(LIB, { recursive: true });
fs.mkdirSync(PROFILES, { recursive: true });

const catalog = {
  source: "https://docs.google.com/spreadsheets/d/1PYQPOWzXnRiTn2j29db7fc9mprg2Yrc-KN5ESKfzo0o",
  imported_at: new Date().toISOString(),
  rows,
};
fs.writeFileSync(
  path.join(LIB, "sheet-catalog.json"),
  `${JSON.stringify(catalog, null, 2)}\n`,
  "utf8",
);

const sheetCsv = [
  ["file_key", "category", "bucket", "title", "design_url", "source"].join(","),
  ...rows.map((r) =>
    [r.file_key, r.category, r.bucket, r.title, r.design_url || "", r.source]
      .map(csvEscape)
      .join(","),
  ),
].join("\n");
fs.writeFileSync(path.join(LIB, "sheet-catalog.csv"), `${sheetCsv}\n`, "utf8");

const exampleCsv = [
  "Bucket,Link,FileKey",
  ...rows.map((r) => [r.bucket, r.design_url || "", r.file_key].map(csvEscape).join(",")),
].join("\n");
fs.writeFileSync(path.join(LIB, "figma-keys.example.csv"), `${exampleCsv}\n`, "utf8");

const have = existingProfileKeys();
let created = 0;
for (const row of rows) {
  if (have.has(row.file_key)) continue;
  writeThinProfile(row);
  created += 1;
}

const byBucket = {};
for (const r of rows) {
  byBucket[r.bucket] = (byBucket[r.bucket] || 0) + 1;
}

console.log(
  `Imported ${rows.length} keys → sheet-catalog.json. Thin profiles created: ${created}. Buckets: ${JSON.stringify(byBucket)}`,
);
