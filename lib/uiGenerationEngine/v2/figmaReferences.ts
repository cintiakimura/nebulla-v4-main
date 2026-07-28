/**
 * Phase C — Forced Figma reference retrieval (honest status, seed fallback).
 * Authority: ui-generation-logic-v2.md §6
 *
 * Env (Render + local .env):
 * - FIGMA_API_KEY — personal access token (secret)
 * - FIGMA_REFERENCE_FILE_KEYS — comma-separated file keys from figma.com/file/<KEY>/...
 *
 * Success requires usable structural guidance extracted from Figma frames —
 * not merely "file opened". Without FIGMA_REFERENCE_FILE_KEYS → weak_matches + seeds.
 */

import { rankSeedPatterns } from "../seedPatterns";
import type { UiGenContextState } from "../types";
import type { FigmaRecord, FigmaStatusV2, PageClassification, V2TemplateId } from "./types";

const FIGMA_LIBRARY_KEYS = (process.env.FIGMA_REFERENCE_FILE_KEYS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

type FigmaNode = {
  id?: string;
  name?: string;
  type?: string;
  children?: FigmaNode[];
  absoluteBoundingBox?: { width?: number; height?: number };
  layoutMode?: string;
  itemSpacing?: number;
  paddingTop?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  paddingRight?: number;
  cornerRadius?: number;
};

function mapSeedToTemplateHints(templateId: V2TemplateId, structure: string): string[] {
  return [
    `template=${templateId}`,
    `structure=${structure}`,
    "Prefer stacked regions: header → content → actions → nav",
    "Card grouping with consistent gap/padding",
    "Mobile: single vertical column, no free-float absolute chaos",
    "Bottom tabs as one horizontal row at the bottom only",
  ];
}

/** Walk Figma document tree and collect structural layout hints. */
function extractStructureHints(
  root: FigmaNode | undefined,
  classification: PageClassification,
  templateId: V2TemplateId,
): { hints: string[]; frameNames: string[]; score: number } {
  const hints: string[] = [];
  const frameNames: string[] = [];
  let score = 0;
  if (!root) return { hints, frameNames, score };

  const walk = (n: FigmaNode, depth: number) => {
    if (!n || depth > 6) return;
    const name = (n.name || "").trim();
    const type = (n.type || "").toUpperCase();
    if ((type === "FRAME" || type === "COMPONENT" || type === "INSTANCE") && name) {
      frameNames.push(name);
      const lower = name.toLowerCase();
      if (/header|hero|nav|tab|list|card|metric|cta|button|setting|auth|form/i.test(lower)) {
        score += 2;
      }
      if (n.layoutMode === "VERTICAL") {
        hints.push(`frame "${name}" uses VERTICAL auto-layout`);
        score += 3;
      } else if (n.layoutMode === "HORIZONTAL") {
        hints.push(`frame "${name}" uses HORIZONTAL auto-layout`);
        score += 2;
      }
      if (typeof n.itemSpacing === "number") {
        hints.push(`spacing rhythm ≈ ${n.itemSpacing}px (${name})`);
        score += 1;
      }
      if (typeof n.cornerRadius === "number" && n.cornerRadius > 0) {
        hints.push(`corner radius ≈ ${Math.round(n.cornerRadius)}px (${name})`);
        score += 1;
      }
    }
    for (const c of n.children || []) walk(c, depth + 1);
  };
  walk(root, 0);

  const deviceHint =
    classification.device === "mobile"
      ? frameNames.find((n) => /mobile|iphone|ios|phone/i.test(n))
      : frameNames.find((n) => /desktop|web|dashboard/i.test(n));
  if (deviceHint) {
    hints.unshift(`preferred frame: ${deviceHint}`);
    score += 4;
  }
  const pageHint = frameNames.find((n) =>
    new RegExp(classification.page_type.replace(/_/g, "[-_ ]?"), "i").test(n),
  );
  if (pageHint) {
    hints.unshift(`page-type frame: ${pageHint}`);
    score += 3;
  }

  hints.push(`adapt into template slots for ${templateId} — keep section order, discard decorative noise`);
  const uniq = [...new Set(hints)].slice(0, 12);
  return { hints: uniq, frameNames: frameNames.slice(0, 24), score };
}

function redactSecrets(msg: string): string {
  return msg.replace(/figd_[A-Za-z0-9_-]+/g, "[redacted-token]");
}

/** Always attempt Figma when key exists; never claim success without usable structural refs. */
export async function retrieveFigmaReferences(input: {
  classification: PageClassification;
  templateId: V2TemplateId;
  seedState: Pick<
    UiGenContextState,
    "device" | "page_type" | "function" | "navigation_type" | "industry_class" | "visual_tone" | "density"
  >;
}): Promise<FigmaRecord> {
  const key = (process.env.FIGMA_API_KEY || "").trim();
  const seeds = rankSeedPatterns({
    ...({} as UiGenContextState),
    device: input.seedState.device || "web",
    page_type: input.seedState.page_type || "other",
    function: input.seedState.function || "general",
    navigation_type: input.seedState.navigation_type || "none",
    industry_class: input.seedState.industry_class || "general",
    visual_tone: input.seedState.visual_tone || "",
    density: input.seedState.density || "medium",
  } as UiGenContextState);
  const topSeeds = seeds.slice(0, 3);
  const seedCandidates = topSeeds.map((s) => ({
    id: s.id,
    reason: `${s.reason} — ${s.structure}`,
  }));
  const seedSelected = topSeeds.slice(0, 2).map((s) => ({
    id: s.id,
    why: `Strong seed fallback for ${input.classification.device}/${input.classification.page_type}: ${s.structure}`,
  }));
  const seedHints = mapSeedToTemplateHints(input.templateId, topSeeds[0]?.structure || "stacked sections");
  const keysConfigured = FIGMA_LIBRARY_KEYS.length;
  const envGuidance =
    !key && keysConfigured === 0
      ? "Set FIGMA_API_KEY and FIGMA_REFERENCE_FILE_KEYS on Render (and local .env). File key = ID in figma.com/file/<KEY>/..."
      : !key
        ? "Set FIGMA_API_KEY (token). FIGMA_REFERENCE_FILE_KEYS alone is not enough."
        : keysConfigured === 0
          ? "FIGMA_API_KEY is set, but FIGMA_REFERENCE_FILE_KEYS is missing — add comma-separated Figma file keys or seed fallback stays on."
          : "Both FIGMA_API_KEY and FIGMA_REFERENCE_FILE_KEYS are configured.";

  const base = {
    reference_file_keys_configured: keysConfigured,
    env_guidance: envGuidance,
  };

  if (!key) {
    return {
      ...base,
      figma_used: "no",
      figma_status: "missing_key",
      figma_error: "FIGMA_API_KEY not set — using polished seed templates",
      candidates: seedCandidates,
      selected_refs: seedSelected,
      fallback_used: "yes",
      structure_hints: seedHints,
    };
  }

  try {
    const me = await fetch("https://api.figma.com/v1/me", {
      headers: { "X-Figma-Token": key },
    });
    if (me.status === 401 || me.status === 403) {
      return {
        ...base,
        figma_used: "no",
        figma_status: "unauthorized",
        figma_error: `Figma unauthorized (${me.status})`,
        candidates: seedCandidates,
        selected_refs: seedSelected,
        fallback_used: "yes",
        structure_hints: seedHints,
      };
    }
    if (me.status === 429) {
      return {
        ...base,
        figma_used: "no",
        figma_status: "rate_limited",
        figma_error: "Figma rate limited",
        candidates: seedCandidates,
        selected_refs: seedSelected,
        fallback_used: "yes",
        structure_hints: seedHints,
      };
    }
    if (!me.ok) {
      return {
        ...base,
        figma_used: "no",
        figma_status: "failed",
        figma_error: `Figma API probe failed (${me.status})`,
        candidates: seedCandidates,
        selected_refs: seedSelected,
        fallback_used: "yes",
        structure_hints: seedHints,
      };
    }

    if (FIGMA_LIBRARY_KEYS.length === 0) {
      return {
        ...base,
        figma_used: "no",
        figma_status: "weak_matches",
        figma_error:
          "FIGMA_API_KEY valid but FIGMA_REFERENCE_FILE_KEYS not set — cannot extract layout; seed fallback",
        candidates: seedCandidates,
        selected_refs: seedSelected,
        fallback_used: "yes",
        structure_hints: seedHints,
      };
    }

    const figmaCandidates: { id: string; reason: string }[] = [];
    const allHints: string[] = [];
    let bestScore = 0;
    let bestKey = "";

    for (const fileKey of FIGMA_LIBRARY_KEYS.slice(0, 3)) {
      try {
        const fr = await fetch(
          `https://api.figma.com/v1/files/${encodeURIComponent(fileKey)}?depth=3`,
          { headers: { "X-Figma-Token": key } },
        );
        if (fr.status === 429) {
          return {
            ...base,
            figma_used: "no",
            figma_status: "rate_limited",
            figma_error: "Figma rate limited while reading reference files",
            candidates: seedCandidates,
            selected_refs: seedSelected,
            fallback_used: "yes",
            structure_hints: seedHints,
          };
        }
        if (!fr.ok) continue;
        const data = (await fr.json()) as {
          name?: string;
          document?: FigmaNode;
        };
        const extracted = extractStructureHints(data.document, input.classification, input.templateId);
        figmaCandidates.push({
          id: `figma:${fileKey}`,
          reason: `File "${data.name || fileKey}" frames=${extracted.frameNames.slice(0, 5).join(", ") || "(none)"} score=${extracted.score}`,
        });
        if (extracted.score > bestScore) {
          bestScore = extracted.score;
          bestKey = fileKey;
          allHints.length = 0;
          allHints.push(...extracted.hints);
        }
      } catch {
        /* continue */
      }
    }

    if (figmaCandidates.length === 0 || bestScore < 4) {
      return {
        ...base,
        figma_used: "no",
        figma_status: "weak_matches",
        figma_error:
          bestScore === 0
            ? "Figma files probed but no auto-layout/structure extracted — seed fallback"
            : `Figma structure score too weak (${bestScore}) — seed fallback`,
        candidates: [...figmaCandidates, ...seedCandidates],
        selected_refs: seedSelected,
        fallback_used: "yes",
        structure_hints: [...allHints, ...seedHints].slice(0, 14),
      };
    }

    const selected = figmaCandidates
      .filter((c) => c.id.includes(bestKey))
      .slice(0, 2)
      .map((c) => ({
        id: c.id,
        why: `Structural guidance for ${input.templateId}: ${c.reason}`,
      }));
    if (!selected.length) {
      selected.push({
        id: figmaCandidates[0].id,
        why: figmaCandidates[0].reason,
      });
    }

    return {
      ...base,
      figma_used: "yes",
      figma_status: "success" as FigmaStatusV2,
      figma_error: "",
      candidates: [...figmaCandidates, ...seedCandidates],
      selected_refs: selected,
      fallback_used: "no",
      structure_hints: [
        ...allHints,
        "Use Figma section order / card grouping / spacing only — do not copy decorative noise",
      ],
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Figma request failed";
    return {
      ...base,
      figma_used: "no",
      figma_status: "failed",
      figma_error: redactSecrets(msg),
      candidates: seedCandidates,
      selected_refs: seedSelected,
      fallback_used: "yes",
      structure_hints: seedHints,
    };
  }
}
