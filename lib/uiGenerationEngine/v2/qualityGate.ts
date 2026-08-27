/**
 * Phase G — Hard quality gate for constrained v2 generation.
 * Stitch-minimum must fail Ready when structure/binding is broken.
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
import type { DesignBrief } from "../resources/types";
import { stitchMinimumIssues } from "./applyStructureHints";
import { sanitizeSlotsForPageType } from "./mapSlots";

function looksSeedEmptyShell(input: {
  nodes: { role?: string; id?: string; type?: string; text?: string }[];
  pageType: V2PageType;
  containers: number;
}): boolean {
  const { nodes, pageType, containers } = input;
  if (nodes.length < 8 || containers < 3) return true;
  const cards = nodes.filter((n) => /^card$/i.test(n.role || "")).length;
  const identity = nodes.some((n) => /top_bar|identity|hero|nav_bar/i.test(`${n.role || ""} ${n.id || ""}`));
  const buttons = nodes.filter((n) => n.type === "button").length;
  if (pageType === "auth") return buttons < 1 || !identity;
  if (pageType === "empty") return !identity;
  return !identity || cards < 2;
}

function luma(hex: string): number {
  const h = (hex || "").replace("#", "");
  if (h.length < 6) return 0.5;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function isRouteLike(s: string): boolean {
  return /^\/[a-z0-9/_-]+$/i.test(s.trim()) || /\/[a-z0-9-]{6,}/i.test(s);
}

function isProseDump(s: string): boolean {
  return s.length > 42 || s.split(/\s+/).length > 6 || /[.!?]/.test(s);
}

function modelHasRole(nodes: { role?: string; id?: string }[], re: RegExp): boolean {
  return nodes.some((n) => re.test(`${n.role || ""} ${n.id || ""}`));
}

export function validateV2Quality(input: {
  model: V2EditorModel;
  template: TemplateDef;
  tokens: DesignTokens;
  slots: SlotMap;
  figmaStatus: FigmaStatusV2;
  pageType: V2PageType;
  designBrief?: DesignBrief | null;
  selectionMode?: string;
  navigationMode?: string;
  /** Offline structure/ missing — fail Ready, still allow fallback preview. */
  structureMissing?: boolean;
  /** kit: brief is copy only — do not fail Ready on §5 hex/spacing. */
  skinMode?: "kit" | "tokens";
}): QualityGateV2 {
  const issues: string[] = [];
  const {
    model,
    template,
    tokens,
    slots,
    figmaStatus,
    pageType,
    designBrief,
    selectionMode,
    navigationMode,
    structureMissing,
    skinMode,
  } = input;

  if (!model?.pages || !Object.keys(model.pages).length) {
    return { gate: "weak", issues: ["No editor model pages"] };
  }
  const page = Object.values(model.pages)[0];
  const nodes = Object.values(page?.nodes || {});
  if (!nodes.length) return { gate: "weak", issues: ["Empty node tree"] };

  const title = (slots.hero_title || slots.nav_title || "").trim();
  const subtitle = (slots.hero_subtitle || "").trim();
  const containers = nodes.filter((n) => n.type === "container" || n.type === "box");
  const buttons = nodes.filter((n) => n.type === "button");
  const hasIdentityRegion = modelHasRole(nodes, /top_bar|nav_bar|hero|identity|auth/i);
  const hasNavRegion = modelHasRole(nodes, /bottom_tabs|nav-sidebar|nav-tab/i);

  const stitch = stitchMinimumIssues({
    slots,
    nodeCount: nodes.length,
    containerCount: containers.length,
    buttonCount: buttons.length,
    pageType,
    needsPrimaryCta: template.needsPrimaryCta,
    navigationMode,
    hasIdentityRegion,
    hasNavRegion,
    templateId: template.id,
  });
  issues.push(...stitch);

  const claimedLibrary =
    figmaStatus === "offline" ||
    figmaStatus === "success" ||
    Boolean(selectionMode?.startsWith("offline:")) ||
    Boolean(selectionMode?.includes(":catalog:"));
  const seedEmpty = looksSeedEmptyShell({
    nodes,
    pageType,
    containers: containers.length,
  });

  // Offline/catalog claimed must show product layout — never Ready on a seed-empty shell.
  if (claimedLibrary) {
    if (!hasIdentityRegion) {
      issues.push("Library hit missing identity / header region");
    }
    if (pageType !== "auth" && pageType !== "empty") {
      const cardCount = nodes.filter((n) => /^card$/i.test(n.role || "")).length;
      if (cardCount < 2) {
        issues.push("Library hit missing ≥2 content regions");
      }
    }
    if (template.needsPrimaryCta && (buttons.length < 1 || !(slots.primary_cta || "").trim())) {
      issues.push("Library hit missing required primary CTA");
    }
    if (seedEmpty) {
      issues.push("Library/offline claimed but nodes look seed-empty — not Ready");
    }
  }

  if (pageType !== "auth") {
    const leakedAuth = nodes.some((n) => /^(email|password)$/i.test(String(n.text || "").trim()));
    if (leakedAuth) {
      issues.push("Stitch-minimum: auth fields on non-auth page");
    }
  }

  if (seedEmpty && (pageType === "home" || pageType === "landing" || pageType === "dashboard" || pageType === "list")) {
    issues.push("Stitch-minimum: empty / single blank hero-only shell");
  }

  // Offline/library success without structure still failing stitch → call out honesty
  if (
    (figmaStatus === "offline" || figmaStatus === "success") &&
    stitch.length > 0
  ) {
    issues.push("Library hit without Stitch-minimum structure (enforcement fail)");
  }

  if (structureMissing) {
    issues.push("Stitch-minimum: Missing structure/ — not Ready");
  }

  if (!title || isProseDump(title) || isRouteLike(title)) {
    issues.push("Title slot missing or looks like prose/route dump");
  }
  if (containers.length < 2) issues.push("Insufficient content regions");
  if (nodes.length < 8) issues.push("Skeleton node count too low");
  if (template.needsPrimaryCta) {
    if (buttons.length < 1) issues.push("Missing primary action");
    const cta = (slots.primary_cta || "").trim();
    if (!cta) issues.push("Primary CTA slot empty");
    else if (isProseDump(cta) || isRouteLike(cta)) {
      issues.push("Primary CTA looks like prose/route dump (keep verb-led, short)");
    }
  }
  if (
    (selectionMode?.includes(":seed:") || figmaStatus === "weak_matches") &&
    containers.length < 3
  ) {
    issues.push("Seed fallback layout still sparse — needs repair");
  }
  if (!model.meta?.template_id) issues.push("Template name not recorded on model");

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
  if (!tokenColors.some((c) => used.has(c))) {
    issues.push("Design tokens not applied to node styles");
  }

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

  if (!figmaStatus) issues.push("figma_status missing");
  if (
    (figmaStatus === "success" || figmaStatus === "offline") &&
    model.meta?.figma_status !== "success" &&
    model.meta?.figma_status !== "offline"
  ) {
    issues.push("library success claimed without model meta");
  }

  if (designBrief && skinMode !== "kit") {
    const primaryHex = designBrief.color_roles.primary.hex.toLowerCase();
    const primaryOnButton = buttons.some(
      (b) => (b.style?.backgroundColor || "").toLowerCase() === primaryHex,
    );
    if (template.needsPrimaryCta && buttons.length > 0 && !primaryOnButton) {
      issues.push("Design Brief: primary color role not applied to any CTA button");
    }
    const textNodes = nodes.filter((n) => n.type === "text");
    const primaryAsBody = textNodes.filter(
      (t) => (t.style?.color || "").toLowerCase() === primaryHex,
    ).length;
    if (primaryAsBody >= 3) {
      issues.push("Design Brief: primary color overused on body text (CTA-only role)");
    }
    const wantGap = designBrief.spacing_radius.gap;
    const wantPad = designBrief.spacing_radius.pad;
    if (Math.abs(tokens.gap - wantGap) > 8) {
      issues.push(
        `Design Brief: density/spacing mismatch (token gap ${tokens.gap} vs brief ${wantGap})`,
      );
    }
    if (Math.abs(tokens.pad - wantPad) > 8) {
      issues.push(
        `Design Brief: density/padding mismatch (token pad ${tokens.pad} vs brief ${wantPad})`,
      );
    }
    if (wantPad < 12) {
      issues.push("Design Brief: touch pad below a11y minimum (pad ≥ 12)");
    }
    const bgL = luma(designBrief.color_roles.background.hex);
    const textL = luma(designBrief.color_roles.on_surface.hex);
    if (Math.abs(bgL - textL) < 0.25) {
      issues.push("Design Brief: weak text/background contrast (a11y minimum)");
    }
    const primaryBtn = buttons.find(
      (b) => (b.style?.backgroundColor || "").toLowerCase() === primaryHex,
    );
    if (primaryBtn) {
      const labelL = luma(primaryBtn.style?.color || designBrief.color_roles.on_surface.hex);
      const fillL = luma(primaryHex);
      if (Math.abs(labelL - fillL) < 0.28) {
        issues.push("Design Brief: weak CTA label contrast on primary fill");
      }
    }
  }

  const uniq = [...new Set(issues)];
  const stitchRemain = uniq.filter(
    (i) =>
      i.startsWith("Stitch-minimum:") ||
      i.includes("Library hit") ||
      i.includes("seed-empty") ||
      i.includes("hero-only"),
  );

  // Stitch-minimum / library honesty is the exam: fail/repair until cleared.
  // Soft brief polish does not block Ready. Weak/fail must not Ready.
  if (stitchRemain.length > 0) {
    if (uniq.length <= 2) return { gate: "repair", issues: uniq };
    return { gate: "weak", issues: uniq };
  }
  return { gate: "pass", issues: uniq };
}

/**
 * Controlled repair: strip wrong-page slots, fix dumps, ensure minimum labels.
 * Caller must re-render + re-validate before Ready.
 */
export function repairSlots(slots: SlotMap, pageType: V2PageType): SlotMap {
  let next = sanitizeSlotsForPageType({ ...slots }, pageType);
  const titleKey = next.hero_title ? "hero_title" : "nav_title";
  if (
    !next[titleKey] ||
    isProseDump(next[titleKey]) ||
    isRouteLike(next[titleKey]) ||
    /^web\s*app$/i.test(next[titleKey] || "") ||
    /^(email|password|e-?mail)$/i.test(next[titleKey] || "")
  ) {
    next[titleKey] =
      pageType === "settings"
        ? "Settings"
        : pageType === "auth"
          ? "Sign in"
          : pageType === "list"
            ? "Tasks"
            : "Home";
  }
  if (!(next.nav_title || "").trim()) next.nav_title = next.hero_title || next[titleKey] || "Home";
  if (
    !next.hero_subtitle ||
    isProseDump(next.hero_subtitle) ||
    isRouteLike(next.hero_subtitle) ||
    /^web\s*app$/i.test(next.hero_subtitle)
  ) {
    next.hero_subtitle =
      pageType === "auth"
        ? "Welcome back"
        : pageType === "list"
          ? "Today’s micro-tasks"
          : pageType === "settings"
            ? "Preferences and account"
            : "Ready when you are";
  }
  if (
    !next.primary_cta ||
    /^get started$/i.test(next.primary_cta) ||
    isProseDump(next.primary_cta) ||
    isRouteLike(next.primary_cta)
  ) {
    next.primary_cta = pageType === "auth" ? "Continue" : "Continue";
  }
  if (pageType === "auth") {
    if (!(next.field_1_label || "").trim()) next.field_1_label = "Email";
    if (!(next.field_2_label || "").trim()) next.field_2_label = "Password";
    if (!(next.secondary_cta || "").trim()) next.secondary_cta = "Create account";
  } else {
    for (let i = 1; i <= 3; i++) {
      if (!(next[`card_${i}_title`] || "").trim() && !(next[`metric_${i}_title`] || "").trim()) {
        next[`card_${i}_title`] =
          i === 1 ? "Today’s lesson" : i === 2 ? "Practice round" : "Review";
        next[`card_${i}_value`] = i === 1 ? "Start" : i === 2 ? "5 min" : "Done";
        next[`metric_${i}_title`] = next[`card_${i}_title`];
        next[`metric_${i}_value`] = `${i * 12}%`;
      }
    }
    if (!(next.section_title || "").trim()) next.section_title = "Up next";
    if (!(next.secondary_cta || "").trim()) next.secondary_cta = "See all";
  }
  for (const [k, v] of Object.entries(next)) {
    if (v && isRouteLike(v)) next[k] = k.includes("cta") ? "Continue" : "Details";
  }
  next = sanitizeSlotsForPageType(next, pageType);
  return next;
}
