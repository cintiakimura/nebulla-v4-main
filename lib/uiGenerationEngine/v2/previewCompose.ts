/**
 * UI Gen v2 compose order: instantiate structure/template first, then overlay
 * kit or named-token colors. Prompt/§5 must not replace the node tree.
 * Fallback ladder is non-blocking for Foundation / Go.
 */

import { defaultTokens } from "./designTokens";
import type { DesignTokens, V2EditorModel, V2Node, V2TemplateId } from "./types";

export type PreviewSkinMode = "kit" | "tokens";
export type UiPreviewStatus = "ready" | "partial";
export type ComposeRung = 1 | 2 | 3 | 4;

export const KIT_PALETTE_ID = "kit-teal-0F766E";

/** Default for the next test pass. Live Figma is not a Generate path. */
export function readPreviewSkinMode(env: NodeJS.ProcessEnv = process.env): PreviewSkinMode {
  const raw = String(env.FIGMA_PREVIEW_SKIN || "kit").trim().toLowerCase();
  return raw === "tokens" ? "tokens" : "kit";
}

export function paletteIdFromTokens(tokens: DesignTokens, skin: PreviewSkinMode): string {
  const hex = (tokens.primary || "").replace("#", "").toUpperCase().slice(0, 6);
  if (skin === "kit") return hex ? `kit-${hex}` : KIT_PALETTE_ID;
  return hex ? `tokens-${hex}` : "tokens-s5";
}

export function kitTokensFromStructure(
  density: "spacious" | "medium" | "compact",
  structureHints: string[],
): DesignTokens {
  const tokens = defaultTokens(density);
  for (const h of structureHints) {
    const sp = h.match(/spacing rhythm ≈ (\d+)/i);
    if (sp) {
      const n = Math.min(28, Math.max(8, Number(sp[1])));
      tokens.gap = n;
      tokens.pad = Math.max(tokens.pad, n);
    }
    const rad = h.match(/corner radius ≈ (\d+)/i);
    if (rad) {
      tokens.radius = Math.min(24, Math.max(4, Number(rad[1])));
    }
  }
  return tokens;
}

export function colorsConflict(a: DesignTokens, b: DesignTokens): boolean {
  const luma = (hex: string) => {
    const h = (hex || "").replace("#", "");
    if (h.length < 6) return 0.5;
    const r = parseInt(h.slice(0, 2), 16) / 255;
    const g = parseInt(h.slice(2, 4), 16) / 255;
    const bch = parseInt(h.slice(4, 6), 16) / 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * bch;
  };
  return Math.abs(luma(a.bg) - luma(b.bg)) > 0.35;
}

/** Restyle existing nodes. Never delete or replace the tree. */
export function applyTokensToModel(model: V2EditorModel, tokens: DesignTokens): V2EditorModel {
  const pages: V2EditorModel["pages"] = {};
  for (const [pageId, page] of Object.entries(model.pages || {})) {
    const nodes: Record<string, V2Node> = {};
    for (const [id, node] of Object.entries(page.nodes || {})) {
      nodes[id] = restyleNode(node, tokens);
    }
    pages[pageId] = { rootId: page.rootId, nodes };
  }
  return {
    pages,
    meta: model.meta
      ? { ...model.meta, tokens }
      : model.meta,
  };
}

function restyleNode(node: V2Node, tokens: DesignTokens): V2Node {
  const role = `${node.role || ""} ${node.id || ""}`.toLowerCase();
  const next: V2Node = {
    ...node,
    children: node.children ? [...node.children] : node.children,
    style: { ...node.style },
  };
  if (node.type === "button") {
    const primary = /primary|cta/.test(role) || node.role === "button_primary";
    next.style.backgroundColor = primary ? tokens.primary : tokens.surface;
    next.style.color = primary ? contrastOn(tokens.primary) : tokens.text;
    next.style.borderColor = tokens.border;
    return next;
  }
  if (/logo|identity/.test(role) && node.type === "text") {
    next.style.backgroundColor = tokens.primary;
    next.style.color = contrastOn(tokens.primary);
    return next;
  }
  if (/muted|sub|meta/.test(role)) {
    next.style.backgroundColor = tokens.surface;
    next.style.color = tokens.mutedText;
    return next;
  }
  if (node.type === "text") {
    next.style.backgroundColor = node.style.backgroundColor === tokens.primary ? tokens.primary : tokens.surface;
    next.style.color = tokens.text;
    return next;
  }
  if (/root|page/.test(role)) {
    next.style.backgroundColor = tokens.bg;
    next.style.color = tokens.text;
    next.style.borderColor = tokens.border;
    return next;
  }
  next.style.backgroundColor = tokens.surface;
  next.style.color = tokens.text;
  next.style.borderColor = tokens.border;
  return next;
}

function contrastOn(hex: string): string {
  const h = (hex || "").replace("#", "");
  if (h.length < 6) return "#FFFFFF";
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luma < 0.55 ? "#FFFFFF" : "#111111";
}

export function countModelNodes(model: V2EditorModel): number {
  return Object.values(model.pages || {}).reduce(
    (n, p) => n + Object.keys(p.nodes || {}).length,
    0,
  );
}

export function modelKeepsChrome(model: V2EditorModel): boolean {
  const nodes = Object.values(model.pages || {}).flatMap((p) => Object.values(p.nodes || {}));
  const identity = nodes.some((n) => /top_bar|identity|nav_bar|header/i.test(`${n.role || ""} ${n.id || ""}`));
  const content = nodes.filter((n) => /^card$/i.test(n.role || "")).length >= 2;
  const cta = nodes.some((n) => n.type === "button");
  return identity && content && cta;
}

export function looksSingleEmptyHero(model: V2EditorModel): boolean {
  const nodes = Object.values(model.pages || {}).flatMap((p) => Object.values(p.nodes || {}));
  const cards = nodes.filter((n) => /^card$/i.test(n.role || "")).length;
  const identity = nodes.some((n) => /top_bar|identity|hero|nav_bar/i.test(`${n.role || ""} ${n.id || ""}`));
  return nodes.length < 8 || !identity || cards < 2;
}

/** Home/list/dashboard must never collapse to empty-state because §5 is dark. */
export function lockProductTemplate(
  templateId: V2TemplateId,
  pageType: string,
): V2TemplateId {
  if (templateId !== "mobile_empty_state") return templateId;
  if (pageType === "empty") return templateId;
  if (pageType === "list") return "mobile_list_actions";
  if (pageType === "dashboard") return "mobile_dashboard_metrics";
  return "mobile_home_hero_cards";
}

export function resolveComposeRung(input: {
  hasOfflineStructure: boolean;
  skin: PreviewSkinMode;
  usedKitColors: boolean;
  chromeOk: boolean;
  usedStitchFallback?: boolean;
}): ComposeRung {
  if (input.usedStitchFallback || !input.chromeOk) return 4;
  if (input.hasOfflineStructure && input.usedKitColors) return 1;
  if (input.hasOfflineStructure) return 2;
  return 3;
}

export function uiStatusForRung(rung: ComposeRung, gatePass: boolean): UiPreviewStatus {
  if (rung === 1 && gatePass) return "ready";
  return "partial";
}

/**
 * Ready pixels only on hard pass.
 * Fallback rungs still write the preview model (partial).
 */
export function shouldWriteUiPreview(opts: {
  gate?: string | null;
  uiStatus?: string | null;
}): boolean {
  if (opts.gate === "pass") return true;
  if (opts.uiStatus === "partial") return true;
  return false;
}

export const PREVIEW_FALLBACK_CHAT_LINE = "Preview used fallback.";
