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
    bg: "#FDF6E3",
    surface: "#FFFFFF",
    primary: "#8B4513",
    accent: "#D2691E",
    text: "#3E2723",
    mutedText: "#6D4C41",
    border: "#E8D5C4",
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

  if (
    industry === "retail" ||
    /retail|shop|store|commerce|baker|bakery|bread|pastry|cafe|grain bakery|loaflocal/.test(text)
  ) {
    return PACKS.retail;
  }
  if (industry === "education" || /educat|learn|tutor|school|kids?|child/.test(text)) {
    return PACKS[tone === "playful" && !/adhd|calm|low[- ]stimulus/.test(text) ? "education-playful" : "education-calm"];
  }
  if (industry === "health" || /health|clinic|medical|wellness/.test(text)) return PACKS.health;
  if (industry === "finance" || /financ|bank|fintech|trading/.test(text)) return PACKS.finance;
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

function isPaletteBullet(line: string): boolean {
  const t = String(line || "").trim();
  if (!t) return false;
  if (/\*\*Palette:\*\*/i.test(t)) return true;
  if (/family\s*=\s*[a-z0-9-]+/i.test(t) && /palette|bg\s|primary\s|#/i.test(t)) return true;
  return false;
}

function scorePaletteLine(line: string, goal: string): number {
  const t = String(line || "");
  const blob = `${goal}`.toLowerCase();
  const bakeryish = /baker|bakery|bread|pastry|cafe|café|shop|store|food|grain bakery|loaflocal/i.test(
    blob,
  );
  let s = 0;
  if (/#FDF6E3/i.test(t) || /#8B4513/i.test(t)) s += 10;
  if (/family\s*=\s*retail/i.test(t)) s += 6;
  if (bakeryish && (/#FDF6E3/i.test(t) || /#8B4513/i.test(t) || /family\s*=\s*retail/i.test(t))) {
    s += 4;
  }
  if (/family\s*=\s*education-calm/i.test(t)) s -= 8;
  if (/family\s*=\s*education-playful/i.test(t)) s -= 6;
  if (/family\s*=\s*professional/i.test(t)) s -= 5;
  if (/#4F46E5|#3F6F5B|#0F766E|#0D9488/i.test(t)) s -= 6;
  return s;
}

/**
 * Keep one Palette line. Bakery/shop/food prefers cream + saddle hex over
 * education-calm / professional / indigo leftovers.
 */
export function collapseWinningPalette(section: string, goal = ""): string {
  const src = String(section || "");
  const lines = src.split("\n");
  const idx: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (isPaletteBullet(lines[i])) idx.push(i);
  }
  const bakeryish = /baker|bakery|bread|pastry|cafe|café|shop|store|food|grain bakery|loaflocal/i.test(
    goal,
  );
  const hexHint = /#FDF6E3|#8B4513/i.test(src);
  const pack = selectIndustryPalette({
    text: bakeryish || hexHint ? `${goal} bakery retail` : goal,
  });
  let winner = formatPaletteLine(pack);
  if (idx.length) {
    let best = idx[0];
    let bestScore = scorePaletteLine(lines[best], goal);
    for (const i of idx) {
      const sc = scorePaletteLine(lines[i], goal);
      if (sc > bestScore) {
        bestScore = sc;
        best = i;
      }
    }
    if (bakeryish && (/#FDF6E3/i.test(lines[best]) || /#8B4513/i.test(lines[best]))) {
      winner = formatPaletteLine(PACKS.retail);
    } else if (bestScore >= 6 && /\*\*Palette:\*\*/i.test(lines[best])) {
      const family = lines[best].match(/family\s*=\s*([a-z0-9-]+)/i)?.[1];
      if (family === "retail" || /#FDF6E3|#8B4513/i.test(lines[best])) {
        winner = formatPaletteLine(PACKS.retail);
      } else if (family && family in PACKS) {
        winner = formatPaletteLine(PACKS[family as IndustryPaletteId]);
      }
    }
  }
  if (!idx.length) {
    return src.trim() ? `${src.replace(/\s+$/, "")}\n${winner}` : winner;
  }
  const keep = idx[0];
  const drop = new Set(idx);
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (drop.has(i)) {
      if (i === keep) out.push(winner);
      continue;
    }
    out.push(lines[i]);
  }
  return out.join("\n");
}

/** Replace every Palette bullet in §5; append if missing. */
export function patchUiuxPalette(section: string, pack: IndustryPalette): string {
  const line = formatPaletteLine(pack);
  const src = String(section || "");
  if (!src.trim()) return line;
  const lines = src.split("\n");
  const idx = lines
    .map((l, i) => (isPaletteBullet(l) ? i : -1))
    .filter((i) => i >= 0);
  if (!idx.length) return `${src.replace(/\s+$/, "")}\n${line}`;
  const keep = idx[0];
  const drop = new Set(idx);
  return lines
    .map((l, i) => {
      if (!drop.has(i)) return l;
      return i === keep ? line : null;
    })
    .filter((l): l is string => l !== null)
    .join("\n");
}
