/**
 * Named palettes by industry + tone. Structure/template stays; these only recolor.
 * Do not default every product to kit teal (#0F766E / #0D9488).
 */

import type { DesignTokens } from "./types";
import { defaultTokens } from "./designTokens";

export type IndustryPaletteId =
  | "education-calm"
  | "education-playful"
  | "health"
  | "finance"
  | "retail"
  | "professional"
  | "landing-bold";

export type IndustryTone = "calm" | "playful" | "professional" | "premium";

export type IndustryPalette = {
  id: IndustryPaletteId;
  bg: string;
  surface: string;
  primary: string;
  accent: string;
  text: string;
  mutedText: string;
  border: string;
  tone: string;
};

const PACKS: Record<IndustryPaletteId, IndustryPalette> = {
  "education-calm": {
    id: "education-calm",
    bg: "#FFF8F1",
    surface: "#FFFFFF",
    primary: "#3F6F5B",
    accent: "#C45C26",
    text: "#1C1917",
    mutedText: "#78716C",
    border: "#E7E0D6",
    tone: "calm",
  },
  "education-playful": {
    id: "education-playful",
    bg: "#FFFBEB",
    surface: "#FFFFFF",
    primary: "#4F46E5",
    accent: "#D97706",
    text: "#1E1B4B",
    mutedText: "#6B7280",
    border: "#FDE68A",
    tone: "playful",
  },
  health: {
    id: "health",
    bg: "#F4F9F7",
    surface: "#FFFFFF",
    primary: "#2A6F97",
    accent: "#5B8A72",
    text: "#1A2E35",
    mutedText: "#5C6B70",
    border: "#D7E5DF",
    tone: "calm",
  },
  finance: {
    id: "finance",
    bg: "#F4F1EA",
    surface: "#FFFFFF",
    primary: "#1E3A5F",
    accent: "#B45309",
    text: "#0F172A",
    mutedText: "#64748B",
    border: "#E4DED2",
    tone: "professional",
  },
  retail: {
    id: "retail",
    bg: "#FFF7ED",
    surface: "#FFFFFF",
    primary: "#9A3412",
    accent: "#BE185D",
    text: "#1C1917",
    mutedText: "#78716C",
    border: "#FED7AA",
    tone: "playful",
  },
  professional: {
    id: "professional",
    bg: "#F5F5F4",
    surface: "#FFFFFF",
    primary: "#44403C",
    accent: "#2563EB",
    text: "#1C1917",
    mutedText: "#78716C",
    border: "#E7E5E4",
    tone: "professional",
  },
  "landing-bold": {
    id: "landing-bold",
    bg: "#FAFAF9",
    surface: "#FFFFFF",
    primary: "#6D28D9",
    accent: "#D97706",
    text: "#18181B",
    mutedText: "#71717A",
    border: "#E4E4E7",
    tone: "bold",
  },
};

const GENERIC_PRIMARY = new Set(["#0f766e", "#0d9488"]);
const GENERIC_BG = new Set(["#f7f5f2", "#f8fafc", "#fafaf9"]);

export function inferIndustryTone(text: string): IndustryTone {
  const t = (text || "").toLowerCase();
  if (/adhd|calm|low[- ]stimulus|low[- ]pressure|one-task|focus/.test(t)) return "calm";
  if (/playful|fun|friendly|kids?|child|warm/.test(t)) return "playful";
  if (/luxury|premium|elegant/.test(t)) return "premium";
  if (/professional|enterprise|saas|admin/.test(t)) return "professional";
  return "professional";
}

export function selectIndustryPalette(input: {
  industry?: string;
  text?: string;
  device?: string;
}): IndustryPalette {
  const industry = (input.industry || "").toLowerCase();
  const text = `${input.industry || ""} ${input.text || ""} ${input.device || ""}`;
  const tone = inferIndustryTone(text);
  const device = (input.device || "").toLowerCase();

  if (industry === "education" || /educat|learn|tutor|school|kids?|child/.test(text)) {
    return PACKS[tone === "playful" && !/adhd|calm|low[- ]stimulus/.test(text) ? "education-playful" : "education-calm"];
  }
  if (industry === "health" || /health|clinic|medical|wellness/.test(text)) return PACKS.health;
  if (industry === "finance" || /financ|bank|fintech|trading/.test(text)) return PACKS.finance;
  if (industry === "retail" || /retail|shop|store|commerce/.test(text)) return PACKS.retail;
  if (device === "landing" || /landing|marketing|waitlist/.test(text)) return PACKS["landing-bold"];
  return PACKS.professional;
}

export function paletteToTokens(
  pack: IndustryPalette,
  density: "spacious" | "medium" | "compact" = "medium",
): DesignTokens {
  const base = defaultTokens(density);
  return {
    ...base,
    bg: pack.bg,
    surface: pack.surface,
    primary: pack.primary,
    accent: pack.accent,
    text: pack.text,
    mutedText: pack.mutedText,
    border: pack.border,
    tone: pack.tone,
  };
}

export function looksGenericTeal(tokens: Pick<DesignTokens, "bg" | "primary">): boolean {
  return (
    GENERIC_PRIMARY.has((tokens.primary || "").toLowerCase()) &&
    GENERIC_BG.has((tokens.bg || "").toLowerCase())
  );
}

export function hasLabeledPrimaryHex(uiux: string): boolean {
  return /\bprimary\b[^#\n]{0,28}#[0-9a-fA-F]{3,8}/i.test(uiux || "");
}

/** Keep an explicit non-teal §5 primary; swap generic teal when industry is known. */
export function applyIndustryPaletteIfGeneric(
  tokens: DesignTokens,
  input: {
    industry?: string;
    text?: string;
    device?: string;
    uiuxHasLabeledPrimary?: boolean;
  },
): DesignTokens {
  if (!looksGenericTeal(tokens)) return tokens;
  const known = /^(education|health|finance|retail)$/i.test(input.industry || "");
  if (input.uiuxHasLabeledPrimary && !known) return tokens;
  const pack = selectIndustryPalette(input);
  return {
    ...tokens,
    bg: pack.bg,
    surface: pack.surface,
    primary: pack.primary,
    accent: pack.accent,
    text: pack.text,
    mutedText: pack.mutedText,
    border: pack.border,
    tone: pack.tone || tokens.tone,
  };
}

export type ParsedResearchPalette = {
  family?: string;
  bg?: string;
  primary?: string;
  accent?: string;
  text?: string;
  muted?: string;
  surface?: string;
};

function normHex(raw: string | undefined): string | undefined {
  const s = String(raw || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toUpperCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toUpperCase();
  }
  return undefined;
}

/** Parse competitor-research ## UI/UX patterns (or any blob) for a palette family + hex roles. */
export function parseResearchPalette(md: string): ParsedResearchPalette | null {
  const section =
    md.match(/##\s*UI\/UX patterns[\s\S]*?(?=\n##\s+|$)/i)?.[0] || md || "";
  if (!section.trim()) return null;
  const family =
    section.match(/family\s*[=:]\s*([a-z0-9-]+)/i)?.[1]?.toLowerCase() ||
    section.match(/palette family[:\s]+([a-z0-9-]+)/i)?.[1]?.toLowerCase();
  const grab = (role: string) =>
    normHex(
      section.match(new RegExp(`\\b${role}\\b[^#\\n]{0,24}(#[0-9a-fA-F]{3,8})`, "i"))?.[1],
    );
  const bg = grab("bg") || grab("background");
  const primary = grab("primary");
  const accent = grab("accent");
  const text = grab("text");
  const muted = grab("muted");
  const surface = grab("surface");
  if (!primary && !bg && !family) return null;
  return { family, bg, primary, accent, text, muted, surface };
}

export function researchPaletteToPack(parsed: ParsedResearchPalette): IndustryPalette {
  const fromFamily = parsed.family && parsed.family in PACKS ? PACKS[parsed.family as IndustryPaletteId] : null;
  const base = fromFamily || PACKS.professional;
  return {
    ...base,
    id: (fromFamily?.id || "professional") as IndustryPaletteId,
    bg: parsed.bg || base.bg,
    surface: parsed.surface || base.surface,
    primary: parsed.primary || base.primary,
    accent: parsed.accent || base.accent,
    text: parsed.text || base.text,
    mutedText: parsed.muted || base.mutedText,
  };
}

export function formatPaletteLine(pack: IndustryPalette): string {
  return `- **Palette:** family=${pack.id} bg \`${pack.bg}\`, surface \`${pack.surface}\`, primary \`${pack.primary}\`, accent \`${pack.accent}\`, text \`${pack.text}\`, muted \`${pack.mutedText}\``;
}

/** Replace the Palette bullet in §5; append if missing. */
export function patchUiuxPalette(section: string, pack: IndustryPalette): string {
  const line = formatPaletteLine(pack);
  const src = String(section || "").trim();
  if (!src) return line;
  if (/\*\*Palette:\*\*/i.test(src)) {
    return src.replace(/^.*\*\*Palette:\*\*.*$/im, line);
  }
  return `${src}\n${line}`;
}
