/**
 * Phase B — Choose approved layout template family.
 * Authority: ui-generation-logic-v2.md §5
 */

import type { PageClassification, TemplateDef, V2TemplateId } from "./types";

export const TEMPLATE_DEFS: Record<V2TemplateId, TemplateDef> = {
  mobile_home_hero_cards: {
    id: "mobile_home_hero_cards",
    device: "mobile",
    regions: ["top_bar", "hero", "cards", "cta_row", "bottom_tabs"],
    slots: [
      "nav_title",
      "hero_title",
      "hero_subtitle",
      "primary_cta",
      "secondary_cta",
      "card_1_title",
      "card_1_value",
      "card_2_title",
      "card_2_value",
      "card_3_title",
      "card_3_value",
    ],
    needsPrimaryCta: true,
  },
  mobile_list_actions: {
    id: "mobile_list_actions",
    device: "mobile",
    regions: ["top_bar", "hero", "list", "cta_row", "bottom_tabs"],
    slots: [
      "nav_title",
      "hero_title",
      "hero_subtitle",
      "primary_cta",
      "secondary_cta",
      "item_1_title",
      "item_1_meta",
      "item_2_title",
      "item_2_meta",
      "item_3_title",
      "item_3_meta",
      "item_4_title",
      "item_4_meta",
    ],
    needsPrimaryCta: true,
  },
  mobile_dashboard_metrics: {
    id: "mobile_dashboard_metrics",
    device: "mobile",
    regions: ["top_bar", "metrics", "section", "cta_row", "bottom_tabs"],
    slots: [
      "nav_title",
      "hero_title",
      "hero_subtitle",
      "primary_cta",
      "metric_1_title",
      "metric_1_value",
      "metric_2_title",
      "metric_2_value",
      "metric_3_title",
      "metric_3_value",
      "section_title",
      "section_body",
    ],
    needsPrimaryCta: true,
  },
  mobile_settings_groups: {
    id: "mobile_settings_groups",
    device: "mobile",
    regions: ["top_bar", "groups", "bottom_tabs"],
    slots: [
      "nav_title",
      "hero_title",
      "hero_subtitle",
      "row_1_title",
      "row_1_meta",
      "row_2_title",
      "row_2_meta",
      "row_3_title",
      "row_3_meta",
      "row_4_title",
      "row_4_meta",
    ],
    needsPrimaryCta: false,
  },
  mobile_auth_form: {
    id: "mobile_auth_form",
    device: "mobile",
    regions: ["hero", "form", "cta_row"],
    slots: [
      "hero_title",
      "hero_subtitle",
      "field_1_label",
      "field_1_placeholder",
      "field_2_label",
      "field_2_placeholder",
      "primary_cta",
      "secondary_cta",
    ],
    needsPrimaryCta: true,
  },
  mobile_detail_sections: {
    id: "mobile_detail_sections",
    device: "mobile",
    regions: ["top_bar", "hero", "sections", "cta_row", "bottom_tabs"],
    slots: [
      "nav_title",
      "hero_title",
      "hero_subtitle",
      "primary_cta",
      "section_1_title",
      "section_1_body",
      "section_2_title",
      "section_2_body",
      "section_3_title",
      "section_3_body",
    ],
    needsPrimaryCta: true,
  },
  mobile_empty_state: {
    id: "mobile_empty_state",
    device: "mobile",
    regions: ["top_bar", "empty", "cta_row", "bottom_tabs"],
    slots: ["nav_title", "hero_title", "hero_subtitle", "primary_cta", "empty_title", "empty_body"],
    needsPrimaryCta: true,
  },
  web_dashboard_sidebar: {
    id: "web_dashboard_sidebar",
    device: "web",
    regions: ["sidebar", "header", "metrics", "content"],
    slots: [
      "nav_title",
      "hero_title",
      "hero_subtitle",
      "primary_cta",
      "metric_1_title",
      "metric_1_value",
      "metric_2_title",
      "metric_2_value",
      "metric_3_title",
      "metric_3_value",
      "section_title",
      "section_body",
      "side_1",
      "side_2",
      "side_3",
    ],
    needsPrimaryCta: true,
  },
  web_list_table: {
    id: "web_list_table",
    device: "web",
    regions: ["header", "filters", "list", "cta_row"],
    slots: [
      "nav_title",
      "hero_title",
      "hero_subtitle",
      "primary_cta",
      "secondary_cta",
      "item_1_title",
      "item_1_meta",
      "item_2_title",
      "item_2_meta",
      "item_3_title",
      "item_3_meta",
      "item_4_title",
      "item_4_meta",
    ],
    needsPrimaryCta: true,
  },
  web_settings_two_column: {
    id: "web_settings_two_column",
    device: "web",
    regions: ["sidebar", "header", "groups"],
    slots: [
      "nav_title",
      "hero_title",
      "hero_subtitle",
      "row_1_title",
      "row_1_meta",
      "row_2_title",
      "row_2_meta",
      "row_3_title",
      "row_3_meta",
      "row_4_title",
      "row_4_meta",
      "primary_cta",
      "side_1",
      "side_2",
    ],
    needsPrimaryCta: true,
  },
  web_detail_header_content: {
    id: "web_detail_header_content",
    device: "web",
    regions: ["header", "content", "side"],
    slots: [
      "nav_title",
      "hero_title",
      "hero_subtitle",
      "primary_cta",
      "section_1_title",
      "section_1_body",
      "section_2_title",
      "section_2_body",
      "section_3_title",
      "section_3_body",
    ],
    needsPrimaryCta: true,
  },
  web_auth_center_card: {
    id: "web_auth_center_card",
    device: "web",
    regions: ["auth_card"],
    slots: [
      "hero_title",
      "hero_subtitle",
      "field_1_label",
      "field_1_placeholder",
      "field_2_label",
      "field_2_placeholder",
      "primary_cta",
      "secondary_cta",
    ],
    needsPrimaryCta: true,
  },
  landing_hero_features_cta: {
    id: "landing_hero_features_cta",
    device: "landing",
    regions: ["hero", "features", "cta_band"],
    slots: [
      "hero_title",
      "hero_subtitle",
      "primary_cta",
      "secondary_cta",
      "card_1_title",
      "card_1_value",
      "card_2_title",
      "card_2_value",
      "card_3_title",
      "card_3_value",
    ],
    needsPrimaryCta: true,
  },
  landing_pricing_sections: {
    id: "landing_pricing_sections",
    device: "landing",
    regions: ["hero", "pricing", "cta_band"],
    slots: [
      "hero_title",
      "hero_subtitle",
      "primary_cta",
      "card_1_title",
      "card_1_value",
      "card_2_title",
      "card_2_value",
      "card_3_title",
      "card_3_value",
    ],
    needsPrimaryCta: true,
  },
};

/** Alternate templates when previous failed quality and regen requests a change. */
export function selectTemplate(
  classification: PageClassification,
  opts?: { preferAlternate?: boolean; previousTemplate?: V2TemplateId },
): TemplateDef {
  const { device, page_type, product_function } = classification;
  let id: V2TemplateId;

  if (device === "landing" || page_type === "landing") {
    id = opts?.preferAlternate ? "landing_pricing_sections" : "landing_hero_features_cta";
  } else if (page_type === "auth") {
    id = device === "mobile" ? "mobile_auth_form" : "web_auth_center_card";
  } else if (page_type === "settings") {
    id = device === "mobile" ? "mobile_settings_groups" : "web_settings_two_column";
  } else if (page_type === "empty") {
    id = "mobile_empty_state";
  } else if (page_type === "list" || product_function === "tasks") {
    id = device === "web" ? "web_list_table" : "mobile_list_actions";
  } else if (page_type === "detail" || page_type === "profile") {
    id = device === "web" ? "web_detail_header_content" : "mobile_detail_sections";
  } else if (page_type === "dashboard") {
    id = device === "web" ? "web_dashboard_sidebar" : "mobile_dashboard_metrics";
  } else if (page_type === "home" || page_type === "checkout" || page_type === "other") {
    if (device === "mobile") {
      id =
        product_function === "course" || /metric|kpi|streak/.test(classification.notes)
          ? "mobile_dashboard_metrics"
          : "mobile_home_hero_cards";
      if (opts?.preferAlternate) {
        id = id === "mobile_home_hero_cards" ? "mobile_dashboard_metrics" : "mobile_home_hero_cards";
      }
    } else {
      id = "web_dashboard_sidebar";
    }
  } else {
    id = device === "mobile" ? "mobile_home_hero_cards" : "web_dashboard_sidebar";
  }

  if (opts?.preferAlternate && opts.previousTemplate && id === opts.previousTemplate) {
    const alts = Object.keys(TEMPLATE_DEFS).filter(
      (t) => TEMPLATE_DEFS[t as V2TemplateId].device === device && t !== id,
    ) as V2TemplateId[];
    if (alts[0]) id = alts[0];
  }

  return TEMPLATE_DEFS[id];
}
