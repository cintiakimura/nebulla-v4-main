/**
 * Map offline/catalog structure hints into slot density + render/preview flags.
 * Keeps the template system — strengthens hierarchy, cards, CTAs, auth fields.
 */

import type { DesignTokens, SlotMap, V2PageType, V2TemplateId } from "./types";

export type StructureLayoutPlan = {
  /** Prefer stacked card sections over a single sparse hero card. */
  preferCardStack: boolean;
  /** Ensure ≥ N content cards/items after repair. */
  minContentCards: number;
  /** Auth: require fields + primary + secondary link semantics. */
  authComplete: boolean;
  /** Spacing rhythm extracted from hints (px), if any. */
  spacingPx: number | null;
  /** Corner radius extracted from hints (px), if any. */
  radiusPx: number | null;
  /** Vertical auto-layout detected. */
  verticalStack: boolean;
  /** Human label for status / meta. */
  summary: string;
};

export function parseStructureLayoutPlan(
  hints: string[],
  pageType: V2PageType,
  templateId: V2TemplateId,
): StructureLayoutPlan {
  const joined = hints.join("\n");
  const verticalStack = /VERTICAL auto-layout/i.test(joined);
  const hasCards = /card|content block|list|feature|metric/i.test(joined);
  const hasCta = /cta|button|primary/i.test(joined);
  const authComplete =
    pageType === "auth" || /auth/i.test(templateId)
      ? /field|form|password|email|cta|button/i.test(joined) || true
      : false;

  let spacingPx: number | null = null;
  let radiusPx: number | null = null;
  for (const h of hints) {
    const sp = h.match(/spacing rhythm ≈ (\d+)/i);
    if (sp) spacingPx = Math.min(28, Math.max(8, Number(sp[1])));
    const rad = h.match(/corner radius ≈ (\d+)/i);
    if (rad) {
      const n = Number(rad[1]);
      // Ignore pill radii from buttons (e.g. 100)
      if (n <= 28) radiusPx = Math.min(24, Math.max(4, n));
    }
  }

  const preferCardStack =
    verticalStack ||
    hasCards ||
    pageType === "home" ||
    pageType === "dashboard" ||
    pageType === "list" ||
    pageType === "landing";

  let minContentCards = preferCardStack ? 3 : 2;
  if (pageType === "auth") minContentCards = 2; // fields
  if (pageType === "empty") minContentCards = 1;
  if (hasCta && preferCardStack) minContentCards = Math.max(minContentCards, 3);

  const bits: string[] = [];
  if (verticalStack) bits.push("vertical stack");
  if (hasCards) bits.push("card groups");
  if (spacingPx != null) bits.push(`spacing≈${spacingPx}`);
  if (pageType === "auth") bits.push("auth form");

  return {
    preferCardStack,
    minContentCards,
    authComplete: pageType === "auth" ? true : authComplete,
    spacingPx,
    radiusPx,
    verticalStack,
    summary: bits.length ? bits.join(", ") : "template defaults",
  };
}

/** Soft-apply spacing/radius from plan within ±6 of brief tokens. */
export function applyPlanToTokens(tokens: DesignTokens, plan: StructureLayoutPlan): DesignTokens {
  const next = { ...tokens };
  if (plan.spacingPx != null) {
    next.gap = Math.min(tokens.gap + 6, Math.max(tokens.gap - 6, plan.spacingPx));
    next.pad = Math.min(tokens.pad + 6, Math.max(tokens.pad - 6, Math.max(tokens.pad, plan.spacingPx)));
  }
  if (plan.radiusPx != null) {
    next.radius = Math.min(tokens.radius + 6, Math.max(tokens.radius - 6, plan.radiusPx));
  }
  return next;
}

/**
 * Ensure slots have enough real content regions for the layout plan.
 * Fills missing card/item/metric/field slots with short non-empty labels.
 */
export function ensureSlotsForStructurePlan(
  slots: SlotMap,
  plan: StructureLayoutPlan,
  pageType: V2PageType,
  projectHint?: string,
): SlotMap {
  const next = { ...slots };
  const topic = (projectHint || next.hero_title || next.nav_title || "App").trim().slice(0, 28);

  if (!(next.hero_title || "").trim()) {
    next.hero_title =
      pageType === "auth" ? "Sign in" : pageType === "landing" ? topic : topic || "Home";
  }
  if (!(next.hero_subtitle || "").trim()) {
    next.hero_subtitle =
      pageType === "auth"
        ? "Welcome back"
        : pageType === "landing"
          ? "Built for real users"
          : "Ready when you are";
  }
  if (!(next.primary_cta || "").trim()) {
    next.primary_cta =
      pageType === "auth" ? "Continue" : pageType === "landing" ? "Get started" : "Continue";
  }
  if (pageType === "auth") {
    if (!(next.field_1_label || "").trim()) next.field_1_label = "Email";
    if (!(next.field_2_label || "").trim()) next.field_2_label = "Password";
    if (!(next.secondary_cta || "").trim()) next.secondary_cta = "Create account";
  } else if (!(next.secondary_cta || "").trim() && plan.preferCardStack) {
    next.secondary_cta = "See all";
  }

  if (pageType === "auth") return next;

  const fill = (key: string, value: string) => {
    if (!(next[key] || "").trim()) next[key] = value;
  };

  for (let i = 1; i <= plan.minContentCards; i++) {
    if (pageType === "dashboard" || pageType === "home") {
      fill(`metric_${i}_title`, i === 1 ? "Progress" : i === 2 ? "Activity" : "Focus");
      fill(`metric_${i}_value`, i === 1 ? "12%" : i === 2 ? "24%" : "36%");
      fill(`card_${i}_title`, i === 1 ? "Today" : i === 2 ? "Practice" : "Review");
      fill(`card_${i}_value`, i === 1 ? "Start" : i === 2 ? "Continue" : "Done");
    } else if (pageType === "landing") {
      fill(`card_${i}_title`, i === 1 ? "Fast setup" : i === 2 ? "Clear results" : "Stay on track");
      fill(`card_${i}_value`, "Learn more");
    } else if (pageType === "list") {
      fill(`item_${i}_title`, `Item ${i}`);
      fill(`item_${i}_meta`, "Open");
    } else {
      fill(`section_${i}_title`, `Section ${i}`);
      fill(`section_${i}_body`, "Details");
    }
  }

  if (plan.preferCardStack && !(next.section_title || "").trim()) {
    next.section_title = pageType === "landing" ? "Why it works" : "Up next";
  }

  return next;
}

/** Detect empty-shell / single blank card layouts for quality gate. */
export function isEmptyShellLayout(input: {
  slots: SlotMap;
  nodeCount: number;
  containerCount: number;
  buttonCount: number;
  pageType: V2PageType;
  needsPrimaryCta: boolean;
}): string[] {
  const issues: string[] = [];
  const { slots, nodeCount, containerCount, buttonCount, pageType, needsPrimaryCta } = input;
  const title = (slots.hero_title || slots.nav_title || "").trim();
  const cta = (slots.primary_cta || "").trim();

  if (!title) issues.push("Empty shell: missing title");
  if (needsPrimaryCta && !cta) issues.push("Empty shell: missing primary CTA");
  if (needsPrimaryCta && buttonCount < 1) issues.push("Empty shell: no CTA button node");
  if (containerCount <= 1 && nodeCount < 10) {
    issues.push("Empty shell: single blank card / sparse regions");
  }
  if (pageType === "auth") {
    if (!(slots.field_1_label || "").trim() || !(slots.field_2_label || "").trim()) {
      issues.push("Auth incomplete: missing fields");
    }
    if (!(slots.secondary_cta || "").trim()) {
      issues.push("Auth incomplete: missing secondary link");
    }
  }
  if (pageType === "home" || pageType === "dashboard" || pageType === "landing") {
    const hasContent = Object.entries(slots).some(
      ([k, v]) =>
        /^(card|item|metric|section)_\d/i.test(k) && Boolean(String(v || "").trim()),
    );
    if (!hasContent) issues.push("Empty shell: no content cards/metrics");
  }
  return issues;
}
