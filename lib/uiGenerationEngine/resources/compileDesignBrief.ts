/**
 * Compile a thin Stitch-inspired Design Brief from Master Plan §5 + ui-brief + classification.
 * Thin §5 still produces solid role-based defaults — never invents layout architecture.
 */

import { buildDesignTokens, defaultTokens } from "../v2/designTokens";
import {
  applyIndustryPaletteIfGeneric,
  hasLabeledPrimaryHex,
} from "../v2/industryPalettes";
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

/** Align overview.density with the spacing tokens actually produced. */
function densityFromTokens(gap: number, fallback: ResourceDensity): ResourceDensity {
  if (gap <= 9) return "compact";
  if (gap >= 15) return "spacious";
  return "medium";
}

function thinSectionDefaults(classification: PageClassification): {
  dos: string[];
  component_rules: string[];
} {
  const { device, page_type: pageType, navigation_mode: nav } = classification;
  const dos = [
    "Use role-based colors from color_roles.",
    "Map real Master Plan / ui-brief labels into slots.",
    "Prefer clear hierarchy: title → subtitle → CTA → content blocks.",
    `Keep nav patterns consistent with ${nav}.`,
  ];
  const component_rules = [
    "Stack regions: header → content → actions → nav (mobile tabs at bottom only).",
    "One primary CTA per view; secondary is quieter.",
    "Cards share consistent gap/radius from spacing_radius.",
    `Template family must match ${device}/${pageType}.`,
  ];
  if (pageType === "landing" || device === "landing") {
    dos.push("Hero title + primary CTA above the fold; features in short scannable cards.");
    component_rules.push("Landing: hero → features → CTA band; no app shell chrome.");
  } else if (pageType === "dashboard") {
    dos.push("Lead with metrics or status; keep secondary actions quiet.");
    component_rules.push("Dashboard: metrics/list regions before deep settings.");
  } else if (pageType === "auth") {
    dos.push("Single focused form; one primary continue action.");
    component_rules.push("Auth: center card, minimal chrome, clear primary submit.");
  } else if (pageType === "list") {
    dos.push("Each row/card has a clear title; actions are secondary.");
  } else if (pageType === "settings") {
    dos.push("Group related preferences; avoid a single long dump of controls.");
  } else if (pageType === "empty") {
    dos.push("Empty state: short title, one next-step CTA, no fake data tables.");
  }
  return { dos: dos.slice(0, 8), component_rules: component_rules.slice(0, 8) };
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
  const thinUx = uiux.length < 40;
  const thinBrief = briefMd.length < 80;
  if (thinUx) gaps.push("Master Plan §5 UI/UX is thin — using defaults where needed");
  if (thinBrief) gaps.push("ui-brief.md missing or short — page contracts may be weak");

  const classDensity = input.classification.density;
  let tokens = buildDesignTokens(uiux || briefMd, uiux, classDensity);
  tokens = applyIndustryPaletteIfGeneric(tokens, {
    industry: input.classification.industry,
    text: blob,
    device: input.classification.device,
    uiuxHasLabeledPrimary: hasLabeledPrimaryHex(uiux),
  });
  // Prefer token-implied density so overview and spacing_radius never disagree.
  const density = densityFromTokens(tokens.gap, classDensity);
  const spacing =
    density === classDensity
      ? { gap: tokens.gap, pad: tokens.pad, radius: tokens.radius }
      : (() => {
          const d = defaultTokens(density);
          return { gap: d.gap, pad: d.pad, radius: tokens.radius || d.radius };
        })();

  const personality = parsePersonality(blob);
  const thinDefaults = thinSectionDefaults(input.classification);
  const projectLabel = (input.projectName || "").trim();

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
    spacing_radius: spacing,
    component_rules: thinDefaults.component_rules,
    dos: thinDefaults.dos,
    donts: [
      "Do not invent freeform absolute-position layouts.",
      "Do not put route paths in titles or CTAs.",
      "Do not use primary color for all text.",
      "Do not claim Figma success when using seed fallback.",
      ...(projectLabel
        ? [`Do not invent a different product than "${projectLabel.slice(0, 48)}".`]
        : []),
    ],
    a11y_minimums: [
      "Body text must contrast against background/surface.",
      "CTA label must be readable on primary fill.",
      "Touch targets: prefer padded buttons (pad ≥ 12).",
    ],
    gaps,
    source: "master_plan_s5+ui_brief",
  };

  if (thinUx || thinBrief) {
    brief.dos = [
      ...brief.dos,
      "When §5 is thin, keep slots short and role-faithful — do not invent product features.",
    ].slice(0, 10);
  }

  return brief;
}
