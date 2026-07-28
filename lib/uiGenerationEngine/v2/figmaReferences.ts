/**
 * Phase C — Forced Figma reference retrieval (honest status, seed fallback).
 * Authority: ui-generation-logic-v2.md §6
 */

import { rankSeedPatterns } from "../seedPatterns";
import type { UiGenContextState } from "../types";
import type { FigmaRecord, FigmaStatusV2, PageClassification, V2TemplateId } from "./types";

const FIGMA_LIBRARY_KEYS = (process.env.FIGMA_REFERENCE_FILE_KEYS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function mapSeedToTemplateHints(templateId: V2TemplateId, structure: string): string[] {
  return [
    `template=${templateId}`,
    `structure=${structure}`,
    "Prefer stacked regions: header → content → actions → nav",
    "Card grouping with consistent gap/padding",
  ];
}

/** Always attempt Figma when key exists; never claim success without usable refs. */
export async function retrieveFigmaReferences(input: {
  classification: PageClassification;
  templateId: V2TemplateId;
  /** Minimal state for seed ranking compatibility. */
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
    why: `Seed fallback for ${input.classification.device}/${input.classification.page_type}: ${s.structure}`,
  }));
  const seedHints = mapSeedToTemplateHints(input.templateId, topSeeds[0]?.structure || "stacked sections");

  if (!key) {
    return {
      figma_used: "no",
      figma_status: "missing_key",
      figma_error: "FIGMA_API_KEY not set",
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
        figma_used: "no",
        figma_status: "failed",
        figma_error: `Figma API probe failed (${me.status})`,
        candidates: seedCandidates,
        selected_refs: seedSelected,
        fallback_used: "yes",
        structure_hints: seedHints,
      };
    }

    // Optional curated file keys — soft structural probe only.
    const figmaCandidates: { id: string; reason: string }[] = [];
    for (const fileKey of FIGMA_LIBRARY_KEYS.slice(0, 3)) {
      try {
        const fr = await fetch(`https://api.figma.com/v1/files/${encodeURIComponent(fileKey)}?depth=1`, {
          headers: { "X-Figma-Token": key },
        });
        if (!fr.ok) continue;
        const data = (await fr.json()) as { name?: string };
        figmaCandidates.push({
          id: `figma:${fileKey}`,
          reason: `File "${data.name || fileKey}" matched criteria device=${input.classification.device} page=${input.classification.page_type}`,
        });
      } catch {
        /* continue */
      }
    }

    if (figmaCandidates.length === 0) {
      return {
        figma_used: "no",
        figma_status: "weak_matches",
        figma_error:
          FIGMA_LIBRARY_KEYS.length === 0
            ? "Figma key valid but FIGMA_REFERENCE_FILE_KEYS not configured — seed fallback"
            : "Figma files probed but no strong structural matches — seed fallback",
        candidates: [...figmaCandidates, ...seedCandidates],
        selected_refs: seedSelected,
        fallback_used: "yes",
        structure_hints: seedHints,
      };
    }

    // Success only when we have selected Figma refs used as structural guidance.
    const selected = figmaCandidates.slice(0, 2).map((c) => ({
      id: c.id,
      why: `Structural guidance for template ${input.templateId}: ${c.reason}`,
    }));
    return {
      figma_used: "yes",
      figma_status: "success",
      figma_error: "",
      candidates: [...figmaCandidates, ...seedCandidates],
      selected_refs: selected,
      fallback_used: "no",
      structure_hints: [
        ...seedHints,
        "Use Figma section order / card grouping only — do not copy decorative noise",
      ],
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Figma request failed";
    return {
      figma_used: "no",
      figma_status: "failed" as FigmaStatusV2,
      figma_error: msg,
      candidates: seedCandidates,
      selected_refs: seedSelected,
      fallback_used: "yes",
      structure_hints: seedHints,
    };
  }
}
