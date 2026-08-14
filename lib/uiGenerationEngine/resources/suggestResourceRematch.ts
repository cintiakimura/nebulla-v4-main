/**
 * Phase G — Optional Grok rematch when confidence/score is low.
 * May only pick from a pre-scored shortlist — never invents profiles or layouts.
 */

import { runAiChatCompletion } from "../../aiChatCompletion";
import type { PageClassification } from "../v2/types";
import type { DesignBrief, ResourceMatchResult, UiResourceProfile } from "./types";
import { matchResources, scoreProfile, MAX_SCORE } from "./matchResources";

export type RankedResource = {
  profile: UiResourceProfile;
  score: number;
  reasons: ResourceMatchResult["reasons"];
};

/** Rank hard-filtered candidates (same scoring as matchResources). */
export function rankResourceCandidates(input: {
  profiles: UiResourceProfile[];
  brief: DesignBrief;
  classification: PageClassification;
}): RankedResource[] {
  const candidates = input.profiles.filter((p) => {
    if (p.platform !== input.classification.device) return false;
    const pt = input.classification.page_type;
    if (p.page_types.includes(pt)) return true;
    if (pt === "home" && p.page_types.includes("dashboard")) return true;
    if (pt === "dashboard" && p.page_types.includes("home")) return true;
    if (input.classification.device === "landing" && p.page_types.includes("landing")) return true;
    return false;
  });

  return candidates
    .map((profile) => {
      const { score, reasons } = scoreProfile(profile, input.brief, input.classification);
      return { profile, score, reasons };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.profile.id.localeCompare(b.profile.id);
    });
}

export type RematchSuggestion = {
  profile_id: string;
  reason: string;
};

export function parseRematchSuggestion(
  raw: string,
  allowedIds: Set<string>,
): RematchSuggestion | null {
  try {
    let t = raw.trim();
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) t = fence[1].trim();
    const parsed = JSON.parse(t) as Record<string, unknown>;
    if (parsed.layout || parsed.template_invent || parsed.regions) return null;
    const id = typeof parsed.profile_id === "string" ? parsed.profile_id.trim() : "";
    if (!id || !allowedIds.has(id)) return null;
    const reason =
      typeof parsed.reason === "string" && parsed.reason.trim()
        ? parsed.reason.trim().slice(0, 200)
        : "Grok rematch from shortlist";
    return { profile_id: id, reason };
  } catch {
    return null;
  }
}

/** Apply a shortlist pick as scored_match if the id exists in ranked. */
export function applyRematchPick(
  ranked: RankedResource[],
  pickId: string,
  reason: string,
): ResourceMatchResult | null {
  const hit = ranked.find((r) => r.profile.id === pickId);
  if (!hit) return null;
  return {
    id: hit.profile.id,
    score: hit.score,
    max_score: MAX_SCORE,
    reasons: [
      ...hit.reasons,
      { criterion: "grok_rematch", score: 2, detail: reason },
    ],
    selection_mode: "scored_match",
    profile: hit.profile,
    template_id: hit.profile.template_id,
    figma_file_key: hit.profile.figma_file_key,
  };
}

export function shouldAttemptRematch(
  match: ResourceMatchResult,
  classification: PageClassification,
): boolean {
  if (match.selection_mode === "no_candidates") return false;
  if (match.selection_mode === "below_threshold") return true;
  if (classification.confidence === "low" && match.selection_mode !== "scored_match") return true;
  if (classification.confidence === "low" && match.score < 12) return true;
  return false;
}

export async function suggestResourceRematchWithGrok(options: {
  profiles: UiResourceProfile[];
  brief: DesignBrief;
  classification: PageClassification;
  currentMatch: ResourceMatchResult;
  apiKey?: string;
}): Promise<{
  match: ResourceMatchResult;
  rematched: boolean;
  skippedReason?: string;
}> {
  if (!options.apiKey?.trim()) {
    return { match: options.currentMatch, rematched: false, skippedReason: "no_api_key" };
  }
  if ((process.env.UI_RESOURCE_GROK_ASSIST || "1").trim() === "0") {
    return { match: options.currentMatch, rematched: false, skippedReason: "disabled" };
  }
  if (!shouldAttemptRematch(options.currentMatch, options.classification)) {
    return { match: options.currentMatch, rematched: false, skippedReason: "not_needed" };
  }

  const ranked = rankResourceCandidates({
    profiles: options.profiles,
    brief: options.brief,
    classification: options.classification,
  }).slice(0, 5);

  if (ranked.length < 2) {
    return { match: options.currentMatch, rematched: false, skippedReason: "shortlist_too_small" };
  }

  const allowed = new Set(ranked.map((r) => r.profile.id));
  const system = `You pick the best UI resource profile from a SHORTLIST only.
Return ONLY JSON: {"profile_id":"<id from shortlist>","reason":"<one sentence>"}.
Rules:
- profile_id MUST be one of the provided ids.
- Justify against density, personality, page type — not aesthetics alone.
- NEVER invent new profile ids, templates, or layouts.`;

  const user = JSON.stringify({
    classification: {
      device: options.classification.device,
      page_type: options.classification.page_type,
      density: options.classification.density,
      confidence: options.classification.confidence,
    },
    brief: {
      personality: options.brief.overview.personality,
      density: options.brief.overview.density,
    },
    current: {
      id: options.currentMatch.id,
      score: options.currentMatch.score,
      mode: options.currentMatch.selection_mode,
    },
    shortlist: ranked.map((r) => ({
      id: r.profile.id,
      score: r.score,
      platform: r.profile.platform,
      page_types: r.profile.page_types,
      density: r.profile.density,
      personality: r.profile.personality,
      best_for: r.profile.best_for,
      template_id: r.profile.template_id,
    })),
  });

  try {
    const result = await runAiChatCompletion({
      apiKeyOverride: options.apiKey,
      preferredProvider: "xai",
      stroke: "ui_gen",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    if (!result.ok || !result.content?.trim()) {
      return { match: options.currentMatch, rematched: false, skippedReason: "grok_failed" };
    }
    const suggestion = parseRematchSuggestion(result.content, allowed);
    if (!suggestion) {
      return { match: options.currentMatch, rematched: false, skippedReason: "invalid_pick" };
    }
    const applied = applyRematchPick(ranked, suggestion.profile_id, suggestion.reason);
    if (!applied) {
      return { match: options.currentMatch, rematched: false, skippedReason: "apply_failed" };
    }
    // Same accept floor as matchResources (8, or 10 when classification confidence is low).
    const minScore = options.classification.confidence === "low" ? 10 : 8;
    if (applied.score < minScore) {
      return {
        match: {
          ...applied,
          selection_mode: "below_threshold",
        },
        rematched: false,
        skippedReason: "score_too_low",
      };
    }
    return { match: applied, rematched: true };
  } catch {
    return { match: options.currentMatch, rematched: false, skippedReason: "parse_or_network" };
  }
}

/** Re-score after brief refine (no Grok). */
export function rematchAfterBriefRefine(input: {
  profiles: UiResourceProfile[];
  brief: DesignBrief;
  classification: PageClassification;
}): ResourceMatchResult {
  return matchResources(input);
}
