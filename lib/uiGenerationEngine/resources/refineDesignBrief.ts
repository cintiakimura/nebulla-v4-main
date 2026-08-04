/**
 * Phase G — Optional Grok refine of Design Brief (structured JSON only).
 * Must not invent layout architecture / templates / freeform structure.
 */

import { runAiChatCompletion } from "../../aiChatCompletion";
import { defaultTokens } from "../v2/designTokens";
import type { DesignBrief, ResourceDensity } from "./types";

function densityPhilosophy(d: ResourceDensity): string {
  if (d === "spacious") return "Airy sections, generous whitespace, calm scanning.";
  if (d === "compact") return "Dense information, tighter gaps, efficient scanning.";
  return "Balanced spacing — readable cards without sparse emptiness.";
}

const DENSITIES = new Set<ResourceDensity>(["spacious", "medium", "compact"]);

export type BriefRefinePatch = {
  personality?: string[];
  density?: ResourceDensity;
  density_philosophy?: string;
  dos?: string[];
  donts?: string[];
  component_rules?: string[];
  a11y_minimums?: string[];
  primary_usage?: string;
  /** Hex only if clearly present in intent; otherwise ignored. */
  primary_hex?: string;
};

function stripFence(raw: string): string {
  let t = raw.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  return t;
}

function asStringArray(v: unknown, max: number): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .filter((x): x is string => typeof x === "string" && Boolean(x.trim()))
    .map((s) => s.trim().slice(0, 120))
    .slice(0, max);
  return out.length ? out : undefined;
}

/** Pure merge — used by tests and after Grok parse. Layout fields never accepted. */
export function applyBriefRefinePatch(brief: DesignBrief, patch: BriefRefinePatch): DesignBrief {
  const next: DesignBrief = {
    ...brief,
    overview: { ...brief.overview },
    color_roles: {
      ...brief.color_roles,
      primary: { ...brief.color_roles.primary },
      surface: { ...brief.color_roles.surface },
      on_surface: { ...brief.color_roles.on_surface },
      muted: { ...brief.color_roles.muted },
      background: { ...brief.color_roles.background },
      border: { ...brief.color_roles.border },
      accent: brief.color_roles.accent ? { ...brief.color_roles.accent } : undefined,
    },
    dos: [...brief.dos],
    donts: [...brief.donts],
    component_rules: [...brief.component_rules],
    a11y_minimums: [...brief.a11y_minimums],
    gaps: [...brief.gaps],
  };

  if (patch.personality?.length) {
    next.overview.personality = patch.personality.slice(0, 5);
  }
  if (patch.density && DENSITIES.has(patch.density)) {
    next.overview.density = patch.density;
    // Keep spacing_radius in lockstep with density (Phase D reads brief spacing).
    const spacing = defaultTokens(patch.density);
    next.spacing_radius = {
      gap: spacing.gap,
      pad: spacing.pad,
      radius: next.spacing_radius.radius || spacing.radius,
    };
    if (!patch.density_philosophy?.trim()) {
      next.overview.density_philosophy = densityPhilosophy(patch.density);
    }
  }
  if (patch.density_philosophy?.trim()) {
    next.overview.density_philosophy = patch.density_philosophy.trim().slice(0, 160);
  }
  if (patch.dos?.length) {
    next.dos = [...new Set([...next.dos, ...patch.dos])].slice(0, 10);
  }
  if (patch.donts?.length) {
    next.donts = [...new Set([...next.donts, ...patch.donts])].slice(0, 10);
  }
  if (patch.component_rules?.length) {
    next.component_rules = [...new Set([...next.component_rules, ...patch.component_rules])].slice(
      0,
      10,
    );
  }
  if (patch.a11y_minimums?.length) {
    next.a11y_minimums = [...new Set([...next.a11y_minimums, ...patch.a11y_minimums])].slice(0, 8);
  }
  if (patch.primary_usage?.trim()) {
    next.color_roles.primary.usage = patch.primary_usage.trim().slice(0, 160);
  }
  if (patch.primary_hex && /^#[0-9A-Fa-f]{6}$/.test(patch.primary_hex.trim())) {
    next.color_roles.primary.hex = patch.primary_hex.trim().toUpperCase();
  }

  // Strip any accidental layout invention cues from donts reinforcement
  if (!next.donts.some((d) => /freeform|layout invent/i.test(d))) {
    next.donts.push("Do not invent freeform absolute-position layouts.");
  }

  next.gaps = next.gaps.filter((g) => !/thin|missing or short/i.test(g));
  if (patch.personality?.length || patch.dos?.length) {
    next.gaps = next.gaps.filter((g) => !/defaults where needed/i.test(g));
  }

  return next;
}

export function parseBriefRefinePatch(raw: string): BriefRefinePatch | null {
  try {
    const parsed = JSON.parse(stripFence(raw)) as Record<string, unknown>;
    // Reject layout invention payloads
    if (
      parsed.template_id ||
      parsed.layout ||
      parsed.regions ||
      parsed.nodes ||
      parsed.absolute_positions
    ) {
      return null;
    }
    const density =
      typeof parsed.density === "string" && DENSITIES.has(parsed.density as ResourceDensity)
        ? (parsed.density as ResourceDensity)
        : undefined;
    const patch: BriefRefinePatch = {
      personality: asStringArray(parsed.personality, 5),
      density,
      density_philosophy:
        typeof parsed.density_philosophy === "string"
          ? parsed.density_philosophy.trim().slice(0, 160)
          : undefined,
      dos: asStringArray(parsed.dos, 6),
      donts: asStringArray(parsed.donts, 6),
      component_rules: asStringArray(parsed.component_rules, 6),
      a11y_minimums: asStringArray(parsed.a11y_minimums, 4),
      primary_usage:
        typeof parsed.primary_usage === "string"
          ? parsed.primary_usage.trim().slice(0, 160)
          : undefined,
      primary_hex:
        typeof parsed.primary_hex === "string" ? parsed.primary_hex.trim() : undefined,
    };
    const hasAny = Object.values(patch).some((v) =>
      Array.isArray(v) ? v.length > 0 : Boolean(v),
    );
    return hasAny ? patch : null;
  } catch {
    return null;
  }
}

export async function refineDesignBriefWithGrok(options: {
  brief: DesignBrief;
  uiuxSection: string;
  uiBriefMarkdown?: string;
  projectName?: string;
  apiKey?: string;
}): Promise<{ brief: DesignBrief; refined: boolean; skippedReason?: string }> {
  if (!options.apiKey?.trim()) {
    return { brief: options.brief, refined: false, skippedReason: "no_api_key" };
  }
  if ((process.env.UI_RESOURCE_GROK_ASSIST || "1").trim() === "0") {
    return { brief: options.brief, refined: false, skippedReason: "disabled" };
  }

  const system = `You refine a thin Design Brief for UI generation.
Return ONLY a JSON object with optional keys:
personality (string[]), density ("spacious"|"medium"|"compact"), density_philosophy,
dos, donts, component_rules, a11y_minimums (string[]), primary_usage (string), primary_hex (#RRGGBB only if stated in intent).
Rules:
- Role-based design language only (colors, density, personality, a11y).
- NEVER invent layout architecture, templates, regions, node trees, or absolute positions.
- Keep arrays short. No markdown.`;

  const user = JSON.stringify({
    project: options.projectName || "",
    uiux: (options.uiuxSection || "").slice(0, 1200),
    ui_brief_excerpt: (options.uiBriefMarkdown || "").slice(0, 800),
    current_brief: {
      personality: options.brief.overview.personality,
      density: options.brief.overview.density,
      gaps: options.brief.gaps,
      primary: options.brief.color_roles.primary,
    },
  });

  try {
    const result = await runAiChatCompletion({
      apiKeyOverride: options.apiKey,
      preferredProvider: "xai",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    if (!result.ok || !result.content?.trim()) {
      return { brief: options.brief, refined: false, skippedReason: "grok_failed" };
    }
    const patch = parseBriefRefinePatch(result.content);
    if (!patch) {
      return { brief: options.brief, refined: false, skippedReason: "invalid_json" };
    }
    return { brief: applyBriefRefinePatch(options.brief, patch), refined: true };
  } catch {
    return { brief: options.brief, refined: false, skippedReason: "parse_or_network" };
  }
}
