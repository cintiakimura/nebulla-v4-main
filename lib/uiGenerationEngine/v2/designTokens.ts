/**
 * Phase D — Design tokens from Master Plan §5 (hard law when present).
 * Authority: ui-generation-logic-v2.md §7
 */

import type { DesignTokens } from "./types";

function normalizeHex(raw: string, fallback: string): string {
  const s = (raw || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toLowerCase();
  }
  if (/^#[0-9a-fA-F]{8}$/.test(s)) return `#${s.slice(1, 7)}`.toLowerCase();
  return fallback;
}

function luminance(hex: string): number {
  const h = normalizeHex(hex, "#ffffff").slice(1);
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Neutral professional defaults when §5 is missing. */
export function defaultTokens(density: "spacious" | "medium" | "compact" = "medium"): DesignTokens {
  return {
    bg: "#F7F5F2",
    surface: "#FFFFFF",
    primary: "#0F766E",
    accent: "#CA8A04",
    text: "#1C1917",
    mutedText: "#78716C",
    border: "#E7E5E4",
    radius: 12,
    gap: density === "spacious" ? 16 : density === "compact" ? 8 : 12,
    pad: density === "spacious" ? 20 : density === "compact" ? 12 : 16,
    shadow: "none",
    tone: "neutral professional",
  };
}

/**
 * Build a single token object from §5 / palette text.
 * Never assign hex strings as whole style objects — tokens only.
 */
export function buildDesignTokens(
  uiux: string,
  paletteField: string,
  density: "spacious" | "medium" | "compact" = "medium",
): DesignTokens {
  const blob = `${uiux}\n${paletteField}`.trim();
  if (!blob || blob === "(not found)") return defaultTokens(density);

  const labeled: Partial<Record<keyof DesignTokens, string>> = {};
  const labelMap: Array<[RegExp, keyof DesignTokens]> = [
    [/\b(?:bg|background)\b[^#\n]{0,20}(#[0-9a-fA-F]{3,8})/i, "bg"],
    [/\b(?:card|surface)\b[^#\n]{0,20}(#[0-9a-fA-F]{3,8})/i, "surface"],
    [/\bprimary\b[^#\n]{0,20}(#[0-9a-fA-F]{3,8})/i, "primary"],
    [/\b(?:accent|purple|secondary)\b[^#\n]{0,20}(#[0-9a-fA-F]{3,8})/i, "accent"],
    [/\b(?:text|foreground)\b[^#\n]{0,20}(#[0-9a-fA-F]{3,8})/i, "text"],
    [/\b(?:muted|secondary text)\b[^#\n]{0,20}(#[0-9a-fA-F]{3,8})/i, "mutedText"],
    [/\bborder\b[^#\n]{0,20}(#[0-9a-fA-F]{3,8})/i, "border"],
  ];
  for (const [re, key] of labelMap) {
    const m = blob.match(re);
    if (m?.[1]) labeled[key] = normalizeHex(m[1], "");
  }

  // Named color hints from the Cosmic / brand examples
  const blue = blob.match(/\bblue\b[^#\n]{0,12}(#[0-9a-fA-F]{3,8})/i)?.[1];
  const purple = blob.match(/\bpurple\b[^#\n]{0,12}(#[0-9a-fA-F]{3,8})/i)?.[1];
  if (blue && !labeled.primary) labeled.primary = normalizeHex(blue, "");
  if (purple && !labeled.accent) labeled.accent = normalizeHex(purple, "");

  const hexes = [...blob.matchAll(/#([0-9a-fA-F]{3,8})\b/g)]
    .map((m) => normalizeHex(`#${m[1]}`, ""))
    .filter(Boolean);

  const radiusMatch = blob.match(/(?:radius|rounded|corner)[^\d]{0,12}(\d{1,2})/i);
  const radius = radiusMatch ? Math.min(24, Math.max(4, Number(radiusMatch[1]))) : 12;
  const spacious = /spacious|airy|generous/i.test(blob) || density === "spacious";
  const compact = /compact|dense|tight/i.test(blob) || density === "compact";
  const tone =
    blob.match(/\b(calm|soft|lively|bold|minimal|dark|warm|professional)[a-z]*\b/i)?.[0] ||
    "from §5";

  const base = defaultTokens(spacious ? "spacious" : compact ? "compact" : density);

  if (hexes.length === 0 && !labeled.bg && !labeled.primary) {
    if (/dark|night|black/i.test(blob) && !/soft|cream|warm/i.test(blob)) {
      return {
        ...base,
        bg: "#0A0B14",
        surface: "#11131F",
        primary: "#3B82F6",
        accent: "#7C3AED",
        text: "#FFFFFF",
        mutedText: "#A1A1AA",
        border: "#1F2937",
        radius,
        tone,
      };
    }
    return { ...base, radius, tone };
  }

  const sorted = [...hexes].sort((a, b) => luminance(a) - luminance(b));
  const darkest = sorted[0] || base.text;
  const lightest = sorted[sorted.length - 1] || base.bg;
  const mid = sorted[Math.floor(sorted.length / 2)] || darkest;
  const mostlyDark = hexes.filter((h) => luminance(h) < 0.35).length >= Math.max(1, hexes.length / 2);

  let tokens: DesignTokens;
  if (mostlyDark) {
    tokens = {
      bg: labeled.bg || darkest,
      surface: labeled.surface || mid,
      primary: labeled.primary || hexes.find((h) => h !== darkest && h !== lightest) || "#3B82F6",
      accent: labeled.accent || purple || "#7C3AED",
      text: labeled.text || lightest,
      mutedText: labeled.mutedText || "#A1A1AA",
      border: labeled.border || mid,
      radius,
      gap: base.gap,
      pad: base.pad,
      shadow: /shadow|elevat/i.test(blob) ? "0 8px 24px rgba(0,0,0,0.35)" : "none",
      tone,
    };
  } else {
    tokens = {
      bg: labeled.bg || lightest || base.bg,
      surface: labeled.surface || "#FFFFFF",
      primary: labeled.primary || hexes.find((h) => h !== lightest && h !== darkest) || mid || base.primary,
      accent: labeled.accent || mid || base.accent,
      text: labeled.text || darkest,
      mutedText: labeled.mutedText || mid || base.mutedText,
      border: labeled.border || "#E7E5E4",
      radius,
      gap: base.gap,
      pad: base.pad,
      shadow: "none",
      tone,
    };
  }

  // Never use Nebulla IDE platform cyan as the full page canvas (cyan-only App Preview shell).
  const platformCyan = new Set(["#00d4d4", "#22d3ee", "#06b6d4"]);
  if (platformCyan.has((tokens.bg || "").toLowerCase())) {
    tokens.bg = mostlyDark ? "#0A0B14" : base.bg;
  }
  if (platformCyan.has((tokens.surface || "").toLowerCase())) {
    tokens.surface = mostlyDark ? "#11131F" : base.surface;
  }
  // Platform cyan may accent CTAs, but not replace a missing product primary as body wash.
  if (platformCyan.has((tokens.primary || "").toLowerCase()) && /nebulla|cosmic|#080a14/i.test(blob)) {
    tokens.primary = mostlyDark ? "#3B82F6" : base.primary;
  }

  // Ensure primary contrast text usability via luminance check later in render
  return tokens;
}

/** Always return a fresh valid style object — never a hex string. */
export function styleFromTokens(
  tokens: DesignTokens,
  opts?: Partial<{
    backgroundColor: string;
    color: string;
    pad: number;
    radius: number;
    width: string;
    height: string;
    borderWidth: number;
    marginTop: number;
    marginBottom: number;
    boxShadow: string;
  }>,
): import("./types").V2NodeStyle {
  const pad = opts?.pad ?? tokens.pad;
  return {
    backgroundColor: opts?.backgroundColor ?? tokens.surface,
    color: opts?.color ?? tokens.text,
    paddingTop: pad,
    paddingRight: pad,
    paddingBottom: pad,
    paddingLeft: pad,
    marginTop: opts?.marginTop ?? 0,
    marginRight: 0,
    marginBottom: opts?.marginBottom ?? 0,
    marginLeft: 0,
    width: opts?.width ?? "100%",
    height: opts?.height ?? "auto",
    borderRadius: opts?.radius ?? tokens.radius,
    borderWidth: opts?.borderWidth ?? 0,
    borderColor: tokens.border,
    boxShadow: opts?.boxShadow ?? tokens.shadow,
    opacity: 1,
  };
}
