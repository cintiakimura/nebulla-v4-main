/**
 * Phase G — Hard quality gate for constrained v2 generation.
 * Authority: ui-generation-logic-v2.md §10
 */

import type {
  DesignTokens,
  FigmaStatusV2,
  QualityGateV2,
  SlotMap,
  TemplateDef,
  V2EditorModel,
  V2PageType,
} from "./types";

function isRouteLike(s: string): boolean {
  return /^\/[a-z0-9/_-]+$/i.test(s.trim()) || /\/[a-z0-9-]{6,}/i.test(s);
}

function isProseDump(s: string): boolean {
  return s.length > 42 || s.split(/\s+/).length > 6 || /[.!?]/.test(s);
}

export function validateV2Quality(input: {
  model: V2EditorModel;
  template: TemplateDef;
  tokens: DesignTokens;
  slots: SlotMap;
  figmaStatus: FigmaStatusV2;
  pageType: V2PageType;
}): QualityGateV2 {
  const issues: string[] = [];
  const { model, template, tokens, slots, figmaStatus, pageType } = input;

  if (!model?.pages || !Object.keys(model.pages).length) {
    return { gate: "weak", issues: ["No editor model pages"] };
  }
  const page = Object.values(model.pages)[0];
  const nodes = Object.values(page?.nodes || {});
  if (!nodes.length) return { gate: "weak", issues: ["Empty node tree"] };

  const title = (slots.hero_title || slots.nav_title || "").trim();
  const subtitle = (slots.hero_subtitle || "").trim();

  // G.1 Structure
  if (!title || isProseDump(title) || isRouteLike(title)) {
    issues.push("Title slot missing or looks like prose/route dump");
  }
  const containers = nodes.filter((n) => n.type === "container" || n.type === "box");
  if (containers.length < 2) issues.push("Insufficient content regions");
  if (nodes.length < 8) issues.push("Skeleton node count too low");
  if (template.needsPrimaryCta) {
    const buttons = nodes.filter((n) => n.type === "button");
    if (buttons.length < 1) issues.push("Missing primary action");
    const cta = (slots.primary_cta || "").trim();
    if (!cta) issues.push("Primary CTA slot empty");
    if (
      buttons.length === 1 &&
      /^get started$/i.test(buttons[0].text || "") &&
      pageType !== "empty"
    ) {
      issues.push("Only generic Get started CTA");
    }
  }
  // Seed-path: home/list should carry at least one content label (not empty skeleton)
  if (pageType === "home" || pageType === "list" || pageType === "dashboard") {
    const hasContent = Object.entries(slots).some(
      ([k, v]) =>
        /^(card|item|metric|row|section)_\d/i.test(k) && Boolean(String(v || "").trim()),
    );
    if (!hasContent) issues.push("No content region labels mapped");
  }
  if (!model.meta?.template_id) issues.push("Template name not recorded on model");

  // G.2 Visual / style safety
  for (const n of nodes) {
    if (!n.style || typeof n.style !== "object") {
      issues.push(`Style corruption on node ${n.id}`);
      break;
    }
    if (typeof n.style.backgroundColor !== "string" || !n.style.backgroundColor.startsWith("#")) {
      issues.push(`Invalid backgroundColor on ${n.id}`);
      break;
    }
  }
  const used = new Set<string>();
  for (const n of nodes) {
    if (typeof n.style?.backgroundColor === "string") used.add(n.style.backgroundColor.toLowerCase());
    if (typeof n.style?.color === "string") used.add(n.style.color.toLowerCase());
  }
  const tokenColors = [tokens.bg, tokens.surface, tokens.primary, tokens.text].map((c) =>
    c.toLowerCase(),
  );
  const appliedToken = tokenColors.some((c) => used.has(c));
  if (!appliedToken) issues.push("Design tokens not applied to node styles");

  // G.3 Content
  if (subtitle && (isRouteLike(subtitle) || isProseDump(subtitle))) {
    issues.push("Subtitle looks like route/prose dump");
  }
  for (const [k, v] of Object.entries(slots)) {
    if (!v) continue;
    if (isRouteLike(v) && /title|subtitle|cta|label/i.test(k)) {
      issues.push(`Slot ${k} contains route-like text`);
      break;
    }
  }

  // G.4 Metadata
  if (!figmaStatus) issues.push("figma_status missing");
  if (figmaStatus === "success" && model.meta?.figma_status !== "success") {
    issues.push("figma success claimed without model meta");
  }

  if (issues.length === 0) return { gate: "pass", issues };
  if (issues.length <= 2) return { gate: "repair", issues };
  return { gate: "weak", issues };
}

/** One controlled repair: re-clean slots that look like dumps. */
export function repairSlots(slots: SlotMap, pageType: V2PageType): SlotMap {
  const next = { ...slots };
  const titleKey = next.hero_title ? "hero_title" : "nav_title";
  if (next[titleKey] && (isProseDump(next[titleKey]) || isRouteLike(next[titleKey]))) {
    next[titleKey] =
      pageType === "settings"
        ? "Settings"
        : pageType === "auth"
          ? "Sign in"
          : pageType === "list"
            ? "Tasks"
            : "Home";
  }
  if (next.hero_subtitle && (isProseDump(next.hero_subtitle) || isRouteLike(next.hero_subtitle))) {
    next.hero_subtitle =
      pageType === "list"
        ? "Today’s micro-tasks"
        : pageType === "settings"
          ? "Preferences and account"
          : "Ready when you are";
  }
  if (next.primary_cta && /^get started$/i.test(next.primary_cta)) {
    next.primary_cta = pageType === "auth" ? "Continue" : "Continue";
  }
  // Strip any remaining path-like slot values
  for (const [k, v] of Object.entries(next)) {
    if (isRouteLike(v)) next[k] = k.includes("cta") ? "Continue" : "Details";
  }
  return next;
}
