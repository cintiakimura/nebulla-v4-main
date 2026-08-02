/**
 * Phase E — Map content into template slots (clean human labels only).
 * Authority: ui-generation-logic-v2.md §8
 */

import { cleanHumanSubtitle, cleanHumanTitle } from "../buildPreviewEditorModel";
import type { PageClassification, SlotMap, TemplateDef, V2ProductFunction } from "./types";

export type SlotContentInput = {
  template: TemplateDef;
  classification: PageClassification;
  pageName: string;
  pagePurpose: string;
  projectName: string;
  primaryActions: string[];
  secondaryActions: string[];
  headings: string[];
  buttonLabels: string[];
  features: string[];
  preferenceFeedback?: string;
};

function cleanLabel(raw: string, fallback: string, max = 36): string {
  const t = cleanHumanTitle(raw, fallback);
  if (/^(primary|secondary)$/i.test(t)) return fallback;
  return t.slice(0, max) || fallback;
}

function pickCta(labels: string[], actions: string[], fn: V2ProductFunction, fallback: string): string {
  const candidates = [...actions, ...labels]
    .map((x) => (x || "").replace(/\*\*/g, "").trim())
    .filter(Boolean)
    .filter((x) => x.length <= 28)
    .filter((x) => !/^get started$/i.test(x))
    .filter((x) => !/\//.test(x))
    .filter((x) => !/^(primary|secondary)$/i.test(x));
  if (candidates[0]) return candidates[0];
  if (fn === "tasks") return "Start task";
  if (fn === "course") return "Start practice";
  if (fn === "ecommerce") return "Shop now";
  if (fn === "booking") return "Book now";
  return fallback;
}

function itemLabels(input: SlotContentInput, count: number): string[] {
  const fromHeadings = input.headings
    .map((h) => cleanLabel(h, ""))
    .filter((h) => h && h.length <= 32);
  const fromFeatures = input.features
    .map((f) => cleanLabel(f.replace(/^[-*•]\s*/, "").replace(/\*\*/g, ""), ""))
    .filter((f) => f && f.length <= 32 && !/^kpi\b/i.test(f));
  const merged = [...fromFeatures, ...fromHeadings];
  const uniq: string[] = [];
  for (const m of merged) {
    if (!uniq.some((u) => u.toLowerCase() === m.toLowerCase())) uniq.push(m);
  }
  const fn = input.classification.product_function;
  const page = input.classification.page_type;
  const defaults =
    page === "landing" || fn === "marketing"
      ? ["Fast setup", "Clear workflows", "Built-in quality", "Ship with confidence"]
      : fn === "tasks"
        ? ["Today’s tasks", "Focus block", "Quick capture", "Done list"]
        : fn === "course"
          ? ["Today’s lesson", "Practice round", "Review cards", "Streak bonus"]
          : page === "dashboard"
            ? ["Active items", "This week", "Completion", "Next action"]
            : ["Overview", "Details", "Activity", "Next step"];
  while (uniq.length < count) uniq.push(defaults[uniq.length % defaults.length]);
  return uniq.slice(0, count);
}

/** Fill every template slot with clean short human text. */
export function mapSlots(input: SlotContentInput): SlotMap {
  const isLanding =
    input.classification.device === "landing" ||
    input.classification.page_type === "landing" ||
    input.classification.product_function === "marketing";
  const title = cleanLabel(
    isLanding
      ? input.projectName || input.pageName || "Welcome"
      : input.pageName || input.projectName || "Home",
    input.classification.page_type === "settings"
      ? "Settings"
      : input.classification.product_function === "tasks"
        ? "Tasks"
        : isLanding
          ? input.projectName || "Welcome"
          : "Home",
  );
  const subtitle = cleanHumanSubtitle(
    input.pagePurpose,
    input.classification.page_type,
    input.classification.product_function,
    input.headings,
  );
  const primary = pickCta(
    input.buttonLabels,
    input.primaryActions,
    input.classification.product_function,
    "Continue",
  );
  const secondary =
    [...input.secondaryActions, ...input.buttonLabels]
      .map((x) => cleanLabel(x, ""))
      .find((x) => x && x !== primary && !/^get started$/i.test(x)) || "";

  const items = itemLabels(input, 4);
  const slots: SlotMap = {};

  for (const key of input.template.slots) {
    switch (key) {
      case "nav_title":
        slots[key] = title;
        break;
      case "hero_title":
        slots[key] = title;
        break;
      case "hero_subtitle":
        slots[key] = subtitle;
        break;
      case "primary_cta":
        slots[key] = primary;
        break;
      case "secondary_cta":
        slots[key] =
          secondary ||
          (input.classification.page_type === "auth"
            ? "Create account"
            : isLanding
              ? "See how it works"
              : "See all");
        break;
      case "empty_title":
        slots[key] = "Nothing here yet";
        break;
      case "empty_body":
        slots[key] = "Add your first item to get started.";
        break;
      case "field_1_label":
        slots[key] = "Email";
        break;
      case "field_1_placeholder":
        slots[key] = "you@example.com";
        break;
      case "field_2_label":
        slots[key] = "Password";
        break;
      case "field_2_placeholder":
        slots[key] = "••••••••";
        break;
      case "section_title":
        slots[key] = items[0] || "Overview";
        break;
      case "section_body":
        slots[key] = subtitle;
        break;
      default: {
        const cardTitle = key.match(/^card_(\d+)_title$/);
        const cardVal = key.match(/^card_(\d+)_value$/);
        const metricTitle = key.match(/^metric_(\d+)_title$/);
        const metricVal = key.match(/^metric_(\d+)_value$/);
        const itemTitle = key.match(/^item_(\d+)_title$/);
        const itemMeta = key.match(/^item_(\d+)_meta$/);
        const rowTitle = key.match(/^row_(\d+)_title$/);
        const rowMeta = key.match(/^row_(\d+)_meta$/);
        const secTitle = key.match(/^section_(\d+)_title$/);
        const secBody = key.match(/^section_(\d+)_body$/);
        const side = key.match(/^side_(\d+)$/);
        if (cardTitle) slots[key] = items[Number(cardTitle[1]) - 1] || `Card ${cardTitle[1]}`;
        else if (cardVal)
          slots[key] =
            input.classification.product_function === "course"
              ? `${Number(cardVal[1]) * 12}%`
              : isLanding
                ? ["Ship faster", "Stay on plan", "Fewer rewrites"][Number(cardVal[1]) - 1] || "Included"
                : "Ready";
        else if (metricTitle) slots[key] = items[Number(metricTitle[1]) - 1] || `Metric ${metricTitle[1]}`;
        else if (metricVal) slots[key] = String(12 + Number(metricVal[1]) * 7);
        else if (itemTitle) slots[key] = items[Number(itemTitle[1]) - 1] || `Item ${itemTitle[1]}`;
        else if (itemMeta) slots[key] = Number(itemMeta[1]) === 1 ? "Ready" : "5 min";
        else if (rowTitle)
          slots[key] =
            ["Account", "Preferences", "Notifications", "Privacy"][Number(rowTitle[1]) - 1] ||
            items[Number(rowTitle[1]) - 1] ||
            `Setting ${rowTitle[1]}`;
        else if (rowMeta) slots[key] = "Configure";
        else if (secTitle) slots[key] = items[Number(secTitle[1]) - 1] || `Section ${secTitle[1]}`;
        else if (secBody)
          slots[key] = isLanding
            ? "Clear sections that match your product story."
            : "Supporting details for this section.";
        else if (side) slots[key] = ["Home", "Explore", "Progress", "Profile"][Number(side[1]) - 1] || "Nav";
        else slots[key] = cleanLabel(key.replace(/_/g, " "), "—");
      }
    }
  }

  if (input.preferenceFeedback) {
    // Soft preference: if user mentioned colors/layout we keep structure; labels stay product-true.
    void input.preferenceFeedback;
  }

  return slots;
}
