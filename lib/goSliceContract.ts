/**
 * Go slice contract — one coherent slice per Go.
 * Authority: nebulla-project/incremental-development.md
 */

export const GO_SLICE_LABELS = [
  "Foundation",
  "Auth",
  "Data+API",
  "Primary",
  "Secondary",
  "Polish",
] as const;

export type GoSliceLabel = (typeof GO_SLICE_LABELS)[number];

const ALIASES: Record<string, GoSliceLabel> = {
  foundation: "Foundation",
  setup: "Foundation",
  shell: "Foundation",
  auth: "Auth",
  authentication: "Auth",
  access: "Auth",
  "data+api": "Data+API",
  data: "Data+API",
  api: "Data+API",
  "core data": "Data+API",
  primary: "Primary",
  "primary feature": "Primary",
  secondary: "Secondary",
  polish: "Polish",
  ui: "Polish",
};

/** Parse slice label from PRE_CODING_SUMMARY or user note. */
export function parseGoSliceLabel(text: string | undefined | null): GoSliceLabel | null {
  if (!text?.trim()) return null;
  const t = text.trim();
  const tagged = t.match(
    /\bSLICE\s*:\s*(Foundation|Auth|Data\+API|Primary|Secondary|Polish)\b/i,
  );
  if (tagged?.[1]) {
    const key = tagged[1].toLowerCase().replace(/\s+/g, " ");
    return ALIASES[key] || (GO_SLICE_LABELS.find((l) => l.toLowerCase() === key) ?? null);
  }
  for (const label of GO_SLICE_LABELS) {
    if (new RegExp(`\\b${label.replace("+", "\\+")}\\b`, "i").test(t)) return label;
  }
  for (const [alias, label] of Object.entries(ALIASES)) {
    if (alias.length < 3) continue;
    if (new RegExp(`\\b${alias.replace("+", "\\+")}\\b`, "i").test(t)) return label;
  }
  return null;
}

export function formatSlicePromptLine(slice: GoSliceLabel): string {
  return `SLICE: ${slice}`;
}

/** Soft warn when apply looks like a full-app dump for a non-Foundation slice. */
export function assessOversizedGoApply(opts: {
  sliceLabel?: GoSliceLabel | null;
  writtenPaths: string[];
}): { oversized: boolean; message: string | null } {
  const appFiles = (opts.writtenPaths || []).filter((p) =>
    /^(app|components|src|pages)\//.test(p),
  );
  const threshold = opts.sliceLabel === "Foundation" ? 24 : 14;
  if (appFiles.length <= threshold) return { oversized: false, message: null };
  return {
    oversized: true,
    message: `This Go wrote ${appFiles.length} app files — consider narrowing to one slice (${opts.sliceLabel || "Foundation"}) and validating before the next Go.`,
  };
}
