/**
 * Resource Intelligence Layer — profiles, Design Brief, match results.
 * Catalog storage: FS (dev) or Cloudflare R2 + KV (prod) — not Render Postgres.
 */

import type { V2Device, V2PageType, V2TemplateId } from "../v2/types";

export type ResourceKind = "template" | "figma_kit" | "pattern";
export type ResourceDensity = "spacious" | "medium" | "compact";
export type ResourcePlatform = V2Device;

export type UiResourceProfile = {
  id: string;
  kind: ResourceKind;
  platform: ResourcePlatform;
  page_types: V2PageType[];
  density: ResourceDensity;
  personality: string[];
  best_for: string[];
  strengths: string[];
  weaknesses: string[];
  tags: string[];
  description: string;
  suitability?: string;
  limitations?: string;
  template_id?: V2TemplateId | string;
  figma_file_key?: string;
  preview_r2_key?: string;
  preview_local?: string;
  license: string;
  source: string;
  version: string;
  industry?: string[];
};

export type ColorRole = {
  hex: string;
  usage: string;
};

export type DesignBrief = {
  overview: {
    personality: string[];
    density: ResourceDensity;
    density_philosophy: string;
    industry?: string;
  };
  color_roles: {
    primary: ColorRole;
    surface: ColorRole;
    on_surface: ColorRole;
    muted: ColorRole;
    background: ColorRole;
    border: ColorRole;
    accent?: ColorRole;
  };
  typography_roles: {
    display: string;
    title: string;
    body: string;
    label: string;
  };
  spacing_radius: {
    gap: number;
    pad: number;
    radius: number;
  };
  component_rules: string[];
  dos: string[];
  donts: string[];
  a11y_minimums: string[];
  gaps: string[];
  source: "master_plan_s5+ui_brief";
};

export type ResourceMatchReason = {
  criterion: string;
  score: number;
  detail: string;
};

export type ResourceMatchResult = {
  id: string;
  score: number;
  max_score: number;
  reasons: ResourceMatchReason[];
  selection_mode: "scored_match" | "below_threshold" | "no_candidates" | "disabled";
  profile?: UiResourceProfile;
  template_id?: string;
  figma_file_key?: string;
};

export type CatalogMode = "fs" | "r2";
