/**
 * Map offline/catalog structure hints into slot density + render/preview flags.
 * Stitch-minimum helpers for gate + repair.
 */

import type { DesignTokens, SlotMap, V2PageType, V2TemplateId } from "./types";
import { sanitizeSlotsForPageType } from "./mapSlots";

export type StructureLayoutPlan = {
  preferCardStack: boolean;
  minContentCards: number;
  authComplete: boolean;
  spacingPx: number | null;
  radiusPx: number | null;
  verticalStack: boolean;
  /** Offline structure/ hit — bind identity, ≥2 content regions, CTA, nav. */
  enforceRegions: boolean;
  requireNav: boolean;
  summary: string;
};

export function parseStructureLayoutPlan(
  hints: string[],
  pageType: V2PageType,
  templateId: V2TemplateId,
): StructureLayoutPlan {
  const joined = hints.join("\n");
  const verticalStack = /VERTICAL auto-layout/i.test(joined);
  const hasCards = /card|content block|list|feature|metric|region:content/i.test(joined);
  const hasCta = /cta|button|primary|region:cta/i.test(joined);
  const enforceRegions = /offline-structure:enforce-regions|region:identity/i.test(joined);
  const requireNav = /region:nav/i.test(joined);

  let spacingPx: number | null = null;
  let radiusPx: number | null = null;
  for (const h of hints) {
    const sp = h.match(/spacing rhythm ≈ (\d+)/i);
    if (sp) spacingPx = Math.min(28, Math.max(8, Number(sp[1])));
    const rad = h.match(/corner radius ≈ (\d+)/i);
    if (rad) {
      const n = Number(rad[1]);
      if (n <= 28) radiusPx = Math.min(24, Math.max(4, n));
    }
  }

  const preferCardStack =
    enforceRegions ||
    verticalStack ||
    hasCards ||
    pageType === "home" ||
    pageType === "dashboard" ||
    pageType === "list" ||
    pageType === "landing";

  let minContentCards = preferCardStack ? 3 : 2;
  if (pageType === "auth") minContentCards = 2;
  if (pageType === "empty") minContentCards = 1;
  if ((hasCta || enforceRegions) && preferCardStack) {
    minContentCards = Math.max(minContentCards, 3);
  }

  const bits: string[] = [];
  if (enforceRegions) bits.push("enforce regions");
  if (verticalStack) bits.push("vertical stack");
  if (hasCards) bits.push("card groups");
  if (spacingPx != null) bits.push(`spacing≈${spacingPx}`);
  if (pageType === "auth") bits.push("auth form");

  return {
    preferCardStack,
    minContentCards,
    authComplete: pageType === "auth",
    spacingPx,
    radiusPx,
    verticalStack,
    enforceRegions,
    requireNav,
    summary: bits.length ? bits.join(", ") : "template defaults",
  };
}

export function applyPlanToTokens(tokens: DesignTokens, plan: StructureLayoutPlan): DesignTokens {
  const next = { ...tokens };
  if (plan.spacingPx != null) {
    next.gap = Math.min(tokens.gap + 6, Math.max(tokens.gap - 6, plan.spacingPx));
    next.pad = Math.min(
      tokens.pad + 6,
      Math.max(tokens.pad - 6, Math.max(tokens.pad, plan.spacingPx)),
    );
  }
  if (plan.radiusPx != null) {
    next.radius = Math.min(tokens.radius + 6, Math.max(tokens.radius - 6, plan.radiusPx));
  }
  return next;
}

function isJunkIdentity(s: string): boolean {
  const t = s.trim();
  if (!t) return true;
  if (/^web\s*app$/i.test(t)) return true;
  if (/^\/[a-z0-9/_-]+$/i.test(t)) return true;
  if (/^[a-z0-9-]+\/[a-z0-9/_-]+$/i.test(t)) return true;
  return false;
}

export function ensureSlotsForStructurePlan(
  slots: SlotMap,
  plan: StructureLayoutPlan,
  pageType: V2PageType,
  projectHint?: string,
  featureLabels?: string[],
): SlotMap {
  let next = sanitizeSlotsForPageType({ ...slots }, pageType);
  const topic = (projectHint || "").trim().slice(0, 28);
  const identity =
    topic && !isJunkIdentity(topic)
      ? topic
      : pageType === "auth"
        ? "Sign in"
        : pageType === "landing"
          ? topic || "Welcome"
          : "Home";

  if (isJunkIdentity(next.hero_title || "") || plan.enforceRegions) {
    if (isJunkIdentity(next.hero_title || "")) {
      next.hero_title =
        pageType === "auth" ? "Sign in" : pageType === "landing" ? identity : identity || "Home";
    }
  }
  if (!(next.hero_title || "").trim() || /^web\s*app$/i.test(next.hero_title || "")) {
    next.hero_title =
      pageType === "auth" ? "Sign in" : pageType === "landing" ? identity : identity || "Home";
  }
  if (!(next.nav_title || "").trim() || isJunkIdentity(next.nav_title || "")) {
    next.nav_title = next.hero_title || identity || "Home";
  }
  if (!(next.hero_subtitle || "").trim() || /^web\s*app$/i.test(next.hero_subtitle || "")) {
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
    if (!(next.field_1_placeholder || "").trim()) next.field_1_placeholder = "you@example.com";
    if (!(next.field_2_placeholder || "").trim()) next.field_2_placeholder = "••••••••";
    if (!(next.secondary_cta || "").trim()) next.secondary_cta = "Create account";
    return sanitizeSlotsForPageType(next, pageType);
  }

  if (!(next.secondary_cta || "").trim() && (plan.preferCardStack || plan.enforceRegions)) {
    next.secondary_cta = "See all";
  }

  const cleanedFeatures = (featureLabels || [])
    .map((f) =>
      String(f || "")
        .replace(/^[-*•]\s*/, "")
        .replace(/\*\*/g, "")
        .trim(),
    )
    .filter((f) => f && f.length <= 32 && !isJunkIdentity(f) && f.toLowerCase() !== identity.toLowerCase());

  const fill = (key: string, value: string) => {
    if (!(next[key] || "").trim()) next[key] = value;
  };

  const contentLabel = (i: number, fallback: string) =>
    cleanedFeatures[i - 1] || fallback;

  for (let i = 1; i <= Math.max(plan.minContentCards, plan.enforceRegions ? 2 : 0); i++) {
    if (pageType === "dashboard" || pageType === "home") {
      fill(`metric_${i}_title`, contentLabel(i, i === 1 ? "Progress" : i === 2 ? "Activity" : "Focus"));
      fill(`metric_${i}_value`, i === 1 ? "12%" : i === 2 ? "24%" : "36%");
      fill(
        `card_${i}_title`,
        contentLabel(i, i === 1 ? "Today’s lesson" : i === 2 ? "Practice" : "Review"),
      );
      fill(`card_${i}_value`, i === 1 ? "Start" : i === 2 ? "Continue" : "Done");
    } else if (pageType === "landing") {
      fill(
        `card_${i}_title`,
        contentLabel(i, i === 1 ? "Fast setup" : i === 2 ? "Clear results" : "Stay on track"),
      );
      fill(`card_${i}_value`, "Learn more");
    } else if (pageType === "list") {
      fill(`item_${i}_title`, contentLabel(i, `Item ${i}`));
      fill(`item_${i}_meta`, "Open");
    } else {
      fill(`section_${i}_title`, contentLabel(i, `Section ${i}`));
      fill(`section_${i}_body`, "Details");
    }
  }

  if ((plan.preferCardStack || plan.enforceRegions) && !(next.section_title || "").trim()) {
    next.section_title = pageType === "landing" ? "Why it works" : "Up next";
  }

  next = sanitizeSlotsForPageType(next, pageType);
  return next;
}

/** Hard regions bound for an offline structure hit (identity + ≥2 content + CTA as required). */
export function structureRegionsSatisfied(input: {
  slots: SlotMap;
  pageType: V2PageType;
  needsPrimaryCta: boolean;
  nodeRoles?: string[];
}): boolean {
  const { slots, pageType, needsPrimaryCta, nodeRoles } = input;
  const title = (slots.hero_title || slots.nav_title || "").trim();
  if (!title || isJunkIdentity(title)) return false;
  if (needsPrimaryCta && !(slots.primary_cta || "").trim()) return false;
  if (pageType === "auth") {
    return Boolean((slots.field_1_label || "").trim() && (slots.field_2_label || "").trim());
  }
  const contentKeys = Object.entries(slots).filter(
    ([k, v]) =>
      /^(card|item|metric|section)_\d+_(title|value|meta|body)$/i.test(k) &&
      Boolean(String(v || "").trim()),
  );
  const contentTitles = contentKeys.filter(([k]) => /_title$/i.test(k));
  if (contentTitles.length < 2) return false;
  if (
    nodeRoles &&
    !nodeRoles.some((r) => /top_bar|identity|hero|nav_bar/i.test(r))
  ) {
    return false;
  }
  if (nodeRoles && nodeRoles.filter((r) => /^card$/i.test(r)).length < 2 && pageType !== "empty") {
    return false;
  }
  return true;
}

/** Stitch-minimum failures — must not Ready / pass while any remain. */
export function stitchMinimumIssues(input: {
  slots: SlotMap;
  nodeCount: number;
  containerCount: number;
  buttonCount: number;
  pageType: V2PageType;
  needsPrimaryCta: boolean;
  navigationMode?: string;
  hasIdentityRegion?: boolean;
  hasNavRegion?: boolean;
  templateId?: string;
}): string[] {
  const issues: string[] = [];
  const {
    slots,
    nodeCount,
    containerCount,
    buttonCount,
    pageType,
    needsPrimaryCta,
    navigationMode,
    hasIdentityRegion,
    hasNavRegion,
    templateId,
  } = input;

  const title = (slots.hero_title || slots.nav_title || "").trim();
  const cta = (slots.primary_cta || "").trim();

  if (!title || /^web\s*app$/i.test(title)) {
    issues.push("Stitch-minimum: missing product title / identity");
  }
  if (hasIdentityRegion === false) {
    issues.push("Stitch-minimum: missing header / identity region");
  }
  if (needsPrimaryCta && !cta) {
    issues.push("Stitch-minimum: missing primary CTA");
  }
  if (needsPrimaryCta && buttonCount < 1) {
    issues.push("Stitch-minimum: no CTA button in render");
  }
  if (containerCount < 3 || nodeCount < 10) {
    issues.push("Stitch-minimum: sparse shell (need header + content + actions)");
  }

  if (pageType === "auth") {
    if (!(slots.field_1_label || "").trim() || !(slots.field_2_label || "").trim()) {
      issues.push("Stitch-minimum: auth missing fields");
    }
    if (!(slots.secondary_cta || "").trim()) {
      issues.push("Stitch-minimum: auth missing secondary link");
    }
  } else {
    // Wrong fields on non-auth (Email on Kid Home)
    for (const [k, v] of Object.entries(slots)) {
      if (/^field_\d+_/i.test(k) && String(v || "").trim()) {
        issues.push("Stitch-minimum: auth fields on non-auth page");
        break;
      }
      if (
        /^(card|item|metric|section)_/i.test(k) &&
        /^(email|password|e-?mail)$/i.test(String(v || "").trim())
      ) {
        issues.push("Stitch-minimum: wrong field label on product page");
        break;
      }
    }
    if (pageType === "home" || pageType === "dashboard" || pageType === "landing" || pageType === "list") {
      const contentTitles = Object.entries(slots).filter(
        ([k, v]) =>
          /^(card|item|metric|section)_\d+_title$/i.test(k) && Boolean(String(v || "").trim()),
      );
      if (contentTitles.length < 2) {
        issues.push("Stitch-minimum: need ≥2 primary content regions");
      }
    }
  }

  const wantsTabs =
    navigationMode === "bottom_tabs" ||
    (/^mobile_/i.test(templateId || "") && pageType !== "auth" && pageType !== "landing");
  if (wantsTabs && hasNavRegion === false && pageType !== "auth" && pageType !== "landing") {
    issues.push("Stitch-minimum: missing nav / tabs for multi-page app");
  }

  return issues;
}

/** @deprecated use stitchMinimumIssues — kept for callers */
export function isEmptyShellLayout(input: {
  slots: SlotMap;
  nodeCount: number;
  containerCount: number;
  buttonCount: number;
  pageType: V2PageType;
  needsPrimaryCta: boolean;
}): string[] {
  return stitchMinimumIssues(input);
}
