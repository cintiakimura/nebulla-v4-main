/**
 * Compile a thin Stitch-inspired Design Brief from Master Plan §5 + ui-brief + classification.
 */

import { buildDesignTokens } from "../v2/designTokens";
import type { PageClassification } from "../v2/types";
import type { DesignBrief, ResourceDensity } from "./types";

function parsePersonality(blob: string): string[] {
  const tags: string[] = [];
  const lower = blob.toLowerCase();
  const candidates: [RegExp, string][] = [
    [/clean|minimal|simple/, "clean"],
    [/professional|enterprise|saas/, "professional"],
    [/friendly|warm|approachable/, "friendly"],
    [/bold|vibrant|energetic/, "bold"],
    [/playful|fun/, "playful"],
    [/dark|night|cosmic/, "dark"],
    [/luxury|premium|elegant/, "premium"],
  ];
  for (const [re, tag] of candidates) {
    if (re.test(lower) && !tags.includes(tag)) tags.push(tag);
  }
  if (tags.length === 0) tags.push("clean", "professional");
  return tags.slice(0, 5);
}

function densityPhilosophy(d: ResourceDensity): string {
  if (d === "spacious") return "Airy sections, generous whitespace, calm scanning.";
  if (d === "compact") return "Dense information, tighter gaps, efficient scanning.";
  return "Balanced spacing — readable cards without sparse emptiness.";
}

export function compileDesignBrief(input: {
  uiuxSection: string;
  uiBriefMarkdown?: string;
  classification: PageClassification;
  projectName?: string;
}): DesignBrief {
  const uiux = (input.uiuxSection || "").trim();
  const briefMd = (input.uiBriefMarkdown || "").trim();
  const blob = `${uiux}\n${briefMd}`;
  const gaps: string[] = [];
  if (uiux.length < 40) gaps.push("Master Plan §5 UI/UX is thin — using defaults where needed");
  if (briefMd.length < 80) gaps.push("ui-brief.md missing or short — page contracts may be weak");

  const density = input.classification.density;
  const tokens = buildDesignTokens(uiux || briefMd, uiux, density);
  const personality = parsePersonality(blob);

  const brief: DesignBrief = {
    overview: {
      personality,
      density,
      density_philosophy: densityPhilosophy(density),
      industry: input.classification.industry || undefined,
    },
    color_roles: {
      primary: {
        hex: tokens.primary,
        usage: "Main CTA buttons and key interactive accents only — not body text.",
      },
      surface: {
        hex: tokens.surface,
        usage: "Cards, panels, form surfaces.",
      },
      on_surface: {
        hex: tokens.text,
        usage: "Primary text on surface/background.",
      },
      muted: {
        hex: tokens.mutedText,
        usage: "Secondary labels, meta, placeholders.",
      },
      background: {
        hex: tokens.bg,
        usage: "Page canvas behind cards.",
      },
      border: {
        hex: tokens.border,
        usage: "Hairline dividers and card outlines.",
      },
      accent: {
        hex: tokens.accent,
        usage: "Secondary highlights; never replace primary CTA.",
      },
    },
    typography_roles: {
      display: "Hero / marketing title — short, high contrast",
      title: "Section and card titles — one line preferred",
      body: "Supporting copy — keep under ~2 lines in slots",
      label: "Buttons, tabs, form labels — verb-led CTAs",
    },
    spacing_radius: {
      gap: tokens.gap,
      pad: tokens.pad,
      radius: tokens.radius,
    },
    component_rules: [
      "Stack regions: header → content → actions → nav (mobile tabs at bottom only).",
      "One primary CTA per view; secondary is quieter.",
      "Cards share consistent gap/radius from spacing_radius.",
      `Template family must match ${input.classification.device}/${input.classification.page_type}.`,
    ],
    dos: [
      "Use role-based colors from color_roles.",
      "Map real Master Plan / ui-brief labels into slots.",
      "Prefer clear hierarchy: title → subtitle → CTA → content blocks.",
      "Keep nav patterns consistent with classification.navigation_mode.",
    ],
    donts: [
      "Do not invent freeform absolute-position layouts.",
      "Do not put route paths in titles or CTAs.",
      "Do not use primary color for all text.",
      "Do not claim Figma success when using seed fallback.",
    ],
    a11y_minimums: [
      "Body text must contrast against background/surface.",
      "CTA label must be readable on primary fill.",
      "Touch targets: prefer padded buttons (pad ≥ 12).",
    ],
    gaps,
    source: "master_plan_s5+ui_brief",
  };

  return brief;
}
