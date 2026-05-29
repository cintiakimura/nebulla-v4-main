import { MASTER_PLAN_ALL_KEYS, normalizeMasterPlanRecord } from "./masterPlanSections";

const DEFAULT_MAX_FILES = 120;
const DEFAULT_MAX_FILE_INDEX_CHARS = 4500;
const DEFAULT_SECTION_CHARS = 900;
const DEFAULT_MASTER_PLAN_TOTAL_CHARS = 7000;

/** Bounded workspace tree for Grok — product files only (caller should filter orchestration paths). */
export function formatWorkspaceFileIndexBlock(
  relativePaths: string[],
  options?: {
    gitBranch?: string | null;
    maxFiles?: number;
    maxChars?: number;
  },
): string {
  const maxFiles = options?.maxFiles ?? DEFAULT_MAX_FILES;
  const maxChars = options?.maxChars ?? DEFAULT_MAX_FILE_INDEX_CHARS;
  const sorted = [...relativePaths]
    .map((p) => p.replace(/\\/g, "/").replace(/^\/+/, ""))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  const lines = [
    "WORKSPACE_FILE_INDEX (paths relative to workspaceRoot — authoritative; prefer these over invented paths):",
  ];
  if (options?.gitBranch) {
    lines.push(`- gitBranch: ${options.gitBranch}`);
  }
  lines.push(`- fileCount: ${sorted.length}`);

  const shown = sorted.slice(0, maxFiles);
  for (const p of shown) {
    lines.push(`  - ${p}`);
  }
  if (sorted.length > shown.length) {
    lines.push(`  … and ${sorted.length - shown.length} more file(s) not listed`);
  }

  let block = lines.join("\n");
  if (block.length > maxChars) {
    block = `${block.slice(0, maxChars)}\n… [file index truncated]`;
  }
  return block;
}

/** Readable Master Plan excerpt for chat — section-by-section, not raw JSON dumps. */
export function compactMasterPlanForChat(
  latestMP: Record<string, unknown>,
  maxTotalChars = DEFAULT_MASTER_PLAN_TOTAL_CHARS,
): string {
  if (!latestMP || typeof latestMP !== "object" || Object.keys(latestMP).length === 0) {
    return "No Master Plan saved yet.";
  }

  const normalized = normalizeMasterPlanRecord(latestMP);
  const parts: string[] = ["MASTER PLAN (saved — use for product decisions; do not contradict without reason):"];

  for (const key of MASTER_PLAN_ALL_KEYS) {
    const raw = normalized[key]?.trim();
    if (!raw) continue;
    const body =
      raw.length > DEFAULT_SECTION_CHARS ? `${raw.slice(0, DEFAULT_SECTION_CHARS)}…` : raw;
    parts.push(`\n### ${key}\n${body}`);
  }

  if (parts.length === 1) {
    try {
      const fallback = JSON.stringify(latestMP);
      return fallback.length <= maxTotalChars
        ? `MASTER PLAN (raw JSON): ${fallback}`
        : `MASTER PLAN (raw JSON, truncated): ${fallback.slice(0, maxTotalChars)}…`;
    } catch {
      return "Master Plan exists but could not be formatted.";
    }
  }

  let out = parts.join("");
  if (out.length > maxTotalChars) {
    out = `${out.slice(0, maxTotalChars)}…\n[master plan excerpt truncated]`;
  }
  return out;
}
