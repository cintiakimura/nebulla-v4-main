/**
 * Layout DB by screen job. Industry is not an input to file pick.
 * Keys must already exist under structure/<file_key>/. Do not invent keys.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { PageClassification } from "./types";
import { figmaPlatformRoots, hasOfflineStructure } from "./figmaSheetCatalog";

export const LAYOUT_JOBS = [
  "home_task",
  "catalog_grid",
  "detail",
  "form_checkout",
  "list_manage",
  "auth",
  "landing_hero",
] as const;

export type LayoutJob = (typeof LAYOUT_JOBS)[number];
export type LayoutDevice = "mobile" | "web";

export type CatalogIndexRow = {
  file_key: string;
  device: LayoutDevice;
  jobs: LayoutJob[];
  not_for: string[];
  richness?: number;
  notes?: string;
};

export type CatalogIndexFile = {
  version: number;
  jobs: string[];
  structures: CatalogIndexRow[];
  by_job?: Record<LayoutJob, string[]>;
  aliases?: Record<string, string>;
};

const CLOSED = new Set<string>(LAYOUT_JOBS);

export function isLayoutJob(raw: string): raw is LayoutJob {
  return CLOSED.has(raw);
}

export function catalogIndexPath(cwd: string = process.cwd()): string {
  return path.join(cwd, "nebulla-project", "figma-library", "catalog-index.json");
}

export function loadCatalogIndex(cwd?: string): CatalogIndexFile | null {
  const extra = cwd ? [cwd] : [];
  try {
    extra.push(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.."));
  } catch {
    /* ignore */
  }
  const roots = figmaPlatformRoots(extra);
  for (const root of roots) {
    const p = catalogIndexPath(root);
    if (!fs.existsSync(p)) continue;
    try {
      const data = JSON.parse(fs.readFileSync(p, "utf8")) as CatalogIndexFile;
      if (!data || !Array.isArray(data.structures)) continue;
      const structures = data.structures
        .map(normalizeRow)
        .filter((r): r is CatalogIndexRow => Boolean(r));
      if (!structures.length) continue;
      return {
        version: data.version || 2,
        jobs: [...LAYOUT_JOBS],
        structures,
        by_job: mergeByJob(data.by_job, structures),
        aliases: data.aliases && typeof data.aliases === "object" ? data.aliases : undefined,
      };
    } catch {
      /* next */
    }
  }
  return null;
}

function normalizeRow(raw: unknown): CatalogIndexRow | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const file_key = String(o.file_key || "").trim();
  if (!file_key) return null;
  const device = o.device === "mobile" ? "mobile" : o.device === "web" ? "web" : null;
  if (!device) return null;
  const jobs = (Array.isArray(o.jobs) ? o.jobs : [])
    .map((j) => String(j))
    .filter(isLayoutJob);
  if (!jobs.length) return null;
  const richness = typeof o.richness === "number" && Number.isFinite(o.richness) ? o.richness : 0;
  const not_for = Array.isArray(o.not_for) ? o.not_for.map((x) => String(x)) : [];
  const notes = typeof o.notes === "string" ? o.notes : undefined;
  return { file_key, device, jobs, richness, not_for, notes };
}

function emptyByJob(): Record<LayoutJob, string[]> {
  return {
    home_task: [],
    catalog_grid: [],
    detail: [],
    form_checkout: [],
    list_manage: [],
    auth: [],
    landing_hero: [],
  };
}

/** Index `by_job` wins. Missing map is rebuilt from rows — never from folders. */
export function mergeByJob(
  raw: unknown,
  structures: CatalogIndexRow[],
): Record<LayoutJob, string[]> {
  const out = emptyByJob();
  if (raw && typeof raw === "object") {
    for (const job of LAYOUT_JOBS) {
      const list = (raw as Record<string, unknown>)[job];
      if (!Array.isArray(list)) continue;
      out[job] = list.map((k) => String(k).trim()).filter(Boolean);
    }
    return out;
  }
  for (const row of structures) {
    for (const job of row.jobs) {
      if (!out[job].includes(row.file_key)) out[job].push(row.file_key);
    }
  }
  return out;
}

/** Route purpose → job. Industry string is ignored. */
export function jobFromRoutePurpose(pathName: string, purpose = ""): LayoutJob | null {
  const p = String(pathName || "").toLowerCase();
  const why = String(purpose || "").toLowerCase();
  const blob = `${p} ${why}`;
  if (/\/login|\/signup|\/sign-in|\/auth\b/.test(p) || /\b(sign[- ]?in|log[- ]?in|auth)\b/.test(why)) {
    return "auth";
  }
  if (/\/baker|\/teacher|\/queue|\/dashboard/.test(p) || /\b(order queue|teacher progress|metrics home)\b/.test(why)) {
    return "list_manage";
  }
  if (/\/order|\/checkout|\/cart/.test(p) || /\b(place pickup|checkout|cart)\b/.test(why)) {
    return "form_checkout";
  }
  if (/\/product|\/detail|\/item/.test(p) || /\b(listing detail|detail)\b/.test(why)) return "detail";
  if (/\b(hero|landing|waitlist|marketing)\b/.test(blob)) return "landing_hero";
  if (/\b(catalog|browse|menu|breads|today's bread)\b/.test(blob)) return "catalog_grid";
  if (/\b(practice|start practice|next practice|lesson|the job)\b/.test(blob)) return "home_task";
  if (p === "/" || p === "") return null;
  return null;
}

/** Classification → job. Uses page type / purpose notes — not industry. */
export function layoutJobFromClassification(c: PageClassification): LayoutJob {
  if (c.page_type === "auth") return "auth";
  if (c.device === "landing" || c.page_type === "landing") return "landing_hero";
  if (c.page_type === "checkout") return "form_checkout";
  if (c.page_type === "dashboard" || c.product_function === "saas_admin") return "list_manage";
  const notes = `${c.notes || ""} ${c.product_function || ""}`;
  if (c.page_type === "list") {
    if (c.product_function === "course" || /practice|lesson/.test(notes)) return "home_task";
    return "catalog_grid";
  }
  if (/browse|catalog|menu|bread|shop|marketplace/.test(notes)) return "catalog_grid";
  if (/practice|lesson|start|next/.test(notes) || c.product_function === "course") return "home_task";
  if (c.device === "mobile" && c.page_type === "home") return "home_task";
  if (c.device === "web" && c.page_type === "home") return "catalog_grid";
  if (c.page_type === "home") return "home_task";
  return "home_task";
}

export function layoutDeviceFromClassification(c: PageClassification): LayoutDevice {
  return c.device === "mobile" ? "mobile" : "web";
}

/** Legacy sheet tag for env-bucket tests only. catalog_grid has no first-fit bucket. */
export function jobToLegacyBucket(job: LayoutJob): string | null {
  if (job === "auth") return "auth";
  if (job === "landing_hero") return "landing";
  if (job === "list_manage") return "dashboard";
  if (job === "home_task") return "mobile";
  if (job === "form_checkout") return "forms";
  return null;
}

export function scoreStructureRichness(row: CatalogIndexRow, cwd?: string): number {
  let n = typeof row.richness === "number" ? row.richness : 0;
  if (hasOfflineStructure(row.file_key, cwd)) n += 24;
  return n;
}

export function pickLayoutForJob(input: {
  job: LayoutJob;
  device: LayoutDevice;
  /** Restrict to these keys (library / test). */
  allowKeys?: string[];
  index?: CatalogIndexFile | null;
  cwd?: string;
}): { keys: string[]; mode: "job" | "job_miss"; richness: number[] } {
  const index = input.index === undefined ? loadCatalogIndex(input.cwd) : input.index;
  const allow = input.allowKeys?.length ? new Set(input.allowKeys) : null;
  const hasJobMap = Boolean(index?.by_job && input.job in index.by_job);
  const mapped = hasJobMap ? new Set(index!.by_job![input.job] || []) : null;
  const rows = (index?.structures || []).filter((row) => {
    if (allow && !allow.has(row.file_key)) return false;
    if (mapped && !mapped.has(row.file_key)) return false;
    if (row.device !== input.device) return false;
    if (!row.jobs.includes(input.job)) return false;
    if ((row.not_for || []).includes(input.job)) return false;
    return true;
  });
  if (!rows.length) return { keys: [], mode: "job_miss", richness: [] };
  const scored = rows.map((row) => ({
    key: row.file_key,
    score: scoreStructureRichness(row, input.cwd),
  }));
  scored.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
  return {
    keys: scored.map((s) => s.key),
    mode: "job",
    richness: scored.map((s) => s.score),
  };
}

export function indexRowsByKey(): Record<string, LayoutJob[]> {
  const index = loadCatalogIndex();
  const out: Record<string, LayoutJob[]> = {};
  for (const row of index?.structures || []) out[row.file_key] = row.jobs;
  return out;
}
