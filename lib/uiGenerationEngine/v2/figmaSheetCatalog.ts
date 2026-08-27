/**
 * Sheet catalog = Generate's Figma universe (offline/catalog only).
 * Live Figma stays ingest-only. Do not invent file keys.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { PageClassification } from "./types";

/** Platform repo + cwd. Cloud-project Generate must not miss committed structure/sheet. */
export function figmaPlatformRoots(extra: string[] = []): string[] {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(here, "../../..");
  const envRoot = (process.env.FIGMA_LIBRARY_ROOT || "").trim();
  const isolate = String(process.env.FIGMA_LIBRARY_ISOLATE || "").trim() === "1";
  const out: string[] = [];
  const push = (p: string) => {
    const n = path.resolve(p);
    if (n && !out.includes(n)) out.push(n);
  };
  // Tests: empty FIGMA_LIBRARY_ROOT + isolate hides committed structure/ without live Figma.
  if (isolate) {
    if (envRoot) push(envRoot);
    return out;
  }
  for (const e of extra) {
    if (e) push(e);
  }
  if (envRoot) push(envRoot);
  push(process.cwd());
  push(repoRoot);
  return out;
}

export const SHEET_PROBE_CAP = 3;

export const KNOWN_SHEET_BUCKETS = [
  "mobile",
  "landing",
  "dashboard",
  "auth",
  "web",
  "forms",
  "ds",
  "wireframe",
] as const;

export type SheetBucket = (typeof KNOWN_SHEET_BUCKETS)[number];

export type SheetCatalogRow = {
  file_key: string;
  category: string;
  bucket: SheetBucket;
  title: string;
  design_url?: string;
  community_url?: string;
  source: "sheet";
  avoid_for_education?: boolean;
};

export type SheetCatalogFile = {
  source: string;
  imported_at?: string;
  rows: SheetCatalogRow[];
};

const CORE_INGEST_BUCKETS: SheetBucket[] = ["auth", "mobile", "dashboard", "landing"];

const DASHBOARD_FALLBACK_KEY = "TgYmEqMwrWFHBxF2kAVOaF";

export function bucketFromSheetCategory(category: string): SheetBucket {
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

/** Classification → sheet bucket (never dashboard kit on kids mobile home). */
export function preferredSheetBucket(classification: PageClassification): SheetBucket {
  if (classification.page_type === "auth") return "auth";
  if (
    classification.device === "landing" ||
    classification.page_type === "landing" ||
    classification.product_function === "marketing"
  ) {
    return "landing";
  }
  if (classification.page_type === "dashboard" || classification.product_function === "saas_admin") {
    return "dashboard";
  }
  if (classification.device === "mobile") return "mobile";
  if (classification.device === "web") return "dashboard";
  return "mobile";
}

export function sheetCatalogPath(cwd: string = process.cwd()): string {
  return path.join(cwd, "nebulla-project", "figma-library", "sheet-catalog.json");
}

export function loadSheetCatalog(cwd?: string): SheetCatalogFile | null {
  const roots = cwd ? figmaPlatformRoots([cwd]) : figmaPlatformRoots();
  for (const root of roots) {
    const p = sheetCatalogPath(root);
    if (!fs.existsSync(p)) continue;
    try {
      const data = JSON.parse(fs.readFileSync(p, "utf8")) as SheetCatalogFile;
      if (data && Array.isArray(data.rows) && data.rows.length) return data;
    } catch {
      /* next root */
    }
  }
  return null;
}

export function bucketsFromSheetCatalog(
  catalog: SheetCatalogFile | null,
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  if (!catalog) return map;
  for (const row of catalog.rows) {
    const bucket = row.bucket || bucketFromSheetCategory(row.category);
    const list = map.get(bucket) || [];
    if (!list.includes(row.file_key)) list.push(row.file_key);
    map.set(bucket, list);
  }
  return map;
}

export function rowForKey(
  catalog: SheetCatalogFile | null,
  fileKey: string,
): SheetCatalogRow | null {
  if (!catalog) return null;
  return catalog.rows.find((r) => r.file_key === fileKey) || null;
}

export function hasOfflineStructure(fileKey: string, cwd?: string): boolean {
  const key = fileKey.trim();
  if (!key) return false;
  const roots = cwd ? figmaPlatformRoots([cwd]) : figmaPlatformRoots();
  return roots.some((root) =>
    fs.existsSync(
      path.join(root, "nebulla-project", "figma-library", "structure", key, "document.json"),
    ),
  );
}

function profileDirs(cwd?: string): string[] {
  const roots = cwd ? figmaPlatformRoots([cwd]) : figmaPlatformRoots();
  return roots.map((root) => path.join(root, "nebulla-project", "ui-resource-catalog", "profiles"));
}

export function hasCatalogProfileForKey(fileKey: string, cwd?: string): boolean {
  return Boolean(loadCatalogProfileForKey(fileKey, cwd));
}

export function loadCatalogProfileForKey(
  fileKey: string,
  cwd?: string,
): { id: string; tags: string[]; best_for: string[]; categoryHint: string } | null {
  for (const dir of profileDirs(cwd)) {
    if (!fs.existsSync(dir)) continue;
    try {
      for (const name of fs.readdirSync(dir)) {
        if (!name.endsWith(".json")) continue;
        try {
          const raw = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")) as {
            id?: string;
            figma_file_key?: string;
            tags?: string[];
            best_for?: string[];
          };
          if (raw.figma_file_key !== fileKey) continue;
          return {
            id: String(raw.id || name.replace(/\.json$/, "")),
            tags: Array.isArray(raw.tags) ? raw.tags : [],
            best_for: Array.isArray(raw.best_for) ? raw.best_for : [],
            categoryHint: (raw.tags || []).join(" "),
          };
        } catch {
          /* skip */
        }
      }
    } catch {
      /* next dir */
    }
  }
  return null;
}

function avoidEducation(row: SheetCatalogRow | null, titleExtra = ""): boolean {
  if (row?.avoid_for_education) return true;
  const blob = `${row?.title || ""} ${row?.category || ""} ${titleExtra}`.toLowerCase();
  return /crypto|trading|treyd|fintech/.test(blob);
}

function educationBoost(row: SheetCatalogRow | null, tags: string[]): boolean {
  const blob = `${row?.title || ""} ${row?.category || ""} ${tags.join(" ")}`.toLowerCase();
  return /educat|kids|learn|school|tutor|child/.test(blob);
}

/**
 * Rank keys in a bucket: structure/ first, then catalog profile, then listed.
 * Education/kids: prefer education-tagged; never crypto/trading kits.
 */
export function rankKeysForBucket(input: {
  keys: string[];
  classification: PageClassification;
  catalog: SheetCatalogFile | null;
  cwd?: string;
}): string[] {
  const cwd = input.cwd ?? process.cwd();
  const education =
    input.classification.industry === "education" ||
    /educat|kids|learn|tutor|child/.test(input.classification.notes || "");
  const preferred = preferredSheetBucket(input.classification);
  const scored = input.keys.map((key, idx) => {
    const row = rowForKey(input.catalog, key);
    let rank = 50 + idx;
    const rowBucket = row?.bucket;
    const aligned = !rowBucket || rowBucket === preferred || siblingSheetBuckets(preferred).includes(rowBucket);
    if (aligned && hasOfflineStructure(key, cwd)) rank -= 30;
    else if (aligned && hasCatalogProfileForKey(key, cwd)) rank -= 15;
    if (rowBucket && rowBucket !== preferred && !siblingSheetBuckets(preferred).includes(rowBucket)) {
      rank += 60;
    }
    if (education && avoidEducation(row)) rank += 80;
    if (education && educationBoost(row, [])) rank -= 10;
    if (key === DASHBOARD_FALLBACK_KEY && preferredSheetBucket(input.classification) === "mobile") {
      rank += 200;
    }
    return { key, rank, idx };
  });
  scored.sort((a, b) => a.rank - b.rank || a.idx - b.idx);
  return scored.map((s) => s.key);
}

export function capProbeKeys(keys: string[], cap: number = SHEET_PROBE_CAP): string[] {
  return keys.slice(0, Math.max(1, cap));
}

export function siblingSheetBuckets(preferred: string): string[] {
  if (preferred === "auth") return ["forms"];
  if (preferred === "forms") return ["auth"];
  if (preferred === "landing") return ["web", "ds"];
  if (preferred === "dashboard") return ["web", "ds"];
  if (preferred === "web") return ["dashboard", "landing"];
  if (preferred === "wireframe") return ["landing", "mobile"];
  if (preferred === "ds") return ["dashboard", "landing", "web"];
  return [];
}

export function prioritizeIngestKeys(
  pendingKeys: string[],
  rows: Array<{ file_key: string; bucket: string }>,
  activeBucket?: string,
): string[] {
  const byKey = new Map(rows.map((r) => [r.file_key, r]));
  const core = new Set(CORE_INGEST_BUCKETS);
  const rank = (k: string) => {
    const b = (byKey.get(k)?.bucket || "").toLowerCase();
    if (activeBucket && b === activeBucket) return 0;
    if (core.has(b as SheetBucket)) return 1;
    return 2;
  };
  return [...pendingKeys].sort((a, b) => rank(a) - rank(b) || pendingKeys.indexOf(a) - pendingKeys.indexOf(b));
}
