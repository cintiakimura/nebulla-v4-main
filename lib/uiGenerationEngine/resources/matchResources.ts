/**
 * Scored resource matching (rubric v1). Never returns a random top without score.
 */

import type { PageClassification } from "../v2/types";
import type {
  DesignBrief,
  ResourceMatchReason,
  ResourceMatchResult,
  UiResourceProfile,
} from "./types";

const WEIGHTS = {
  intent: 3,
  density: 2,
  personality: 2,
  a11y: 1,
  technical: 2,
  industry: 1,
} as const;

const MAX_SCORE =
  2 * WEIGHTS.intent +
  2 * WEIGHTS.density +
  2 * WEIGHTS.personality +
  2 * WEIGHTS.a11y +
  2 * WEIGHTS.technical +
  2 * WEIGHTS.industry;

function platformOk(profile: UiResourceProfile, classification: PageClassification): boolean {
  return profile.platform === classification.device;
}

function pageTypeOk(profile: UiResourceProfile, classification: PageClassification): boolean {
  const pt = classification.page_type;
  if (profile.page_types.includes(pt)) return true;
  if (pt === "home" && profile.page_types.includes("dashboard")) return true;
  if (pt === "dashboard" && profile.page_types.includes("home")) return true;
  if (classification.device === "landing" && profile.page_types.includes("landing")) return true;
  return false;
}

function scoreDensity(profile: UiResourceProfile, brief: DesignBrief): number {
  const a = profile.density;
  const b = brief.overview.density;
  if (a === b) return 2;
  if (a === "medium" || b === "medium") return 1;
  return 0; // spacious vs compact
}

function scorePersonality(profile: UiResourceProfile, brief: DesignBrief): number {
  const want = new Set(brief.overview.personality.map((p) => p.toLowerCase()));
  const have = profile.personality.map((p) => p.toLowerCase());
  const hits = have.filter((p) => want.has(p)).length;
  if (hits >= 2) return 2;
  if (hits === 1) return 1;
  return 0;
}

function scoreIntent(profile: UiResourceProfile, classification: PageClassification): number {
  const pt = classification.page_type;
  const exact = profile.page_types.includes(pt);
  const best = profile.best_for.some((b) => {
    const x = b.toLowerCase();
    return x.includes(pt) || x.includes(classification.product_function) || x.includes(classification.device);
  });
  if (exact && best) return 2;
  if (exact) return 1;
  return 0;
}

function scoreA11y(profile: UiResourceProfile): number {
  const tags = profile.tags.map((t) => t.toLowerCase());
  const weak = profile.weaknesses.some((w) => /a11y|contrast|accessib/i.test(w));
  if (weak) return 0;
  if (tags.some((t) => t === "a11y" || t === "wcag" || t === "accessible")) return 2;
  return 1;
}

function scoreTechnical(profile: UiResourceProfile): number {
  const hasT = Boolean(profile.template_id?.trim());
  const hasF = Boolean(profile.figma_file_key?.trim());
  if (hasT && (profile.kind === "template" || hasF)) return 2;
  if (hasT || hasF) return 1;
  return 0;
}

function scoreIndustry(profile: UiResourceProfile, brief: DesignBrief): number {
  const ind = (brief.overview.industry || "").toLowerCase();
  if (!ind || ind === "general") return 1;
  const blob = [...(profile.industry || []), ...profile.tags, ...profile.best_for].join(" ").toLowerCase();
  if (blob.includes(ind)) return 2;
  if (/educat|financ|health|retail/.test(blob) && !blob.includes(ind)) return 0;
  return 1;
}

export function scoreProfile(
  profile: UiResourceProfile,
  brief: DesignBrief,
  classification: PageClassification,
): { score: number; reasons: ResourceMatchReason[] } {
  const reasons: ResourceMatchReason[] = [];
  const intent = scoreIntent(profile, classification);
  reasons.push({ criterion: "intent", score: intent, detail: `page_types=${profile.page_types.join(",")}` });
  const density = scoreDensity(profile, brief);
  reasons.push({
    criterion: "density",
    score: density,
    detail: `${profile.density} vs brief ${brief.overview.density}`,
  });
  const personality = scorePersonality(profile, brief);
  reasons.push({
    criterion: "personality",
    score: personality,
    detail: profile.personality.slice(0, 4).join(","),
  });
  const a11y = scoreA11y(profile);
  reasons.push({ criterion: "a11y", score: a11y, detail: profile.tags.includes("a11y") ? "tagged" : "neutral" });
  const technical = scoreTechnical(profile);
  reasons.push({
    criterion: "technical",
    score: technical,
    detail: `template=${profile.template_id || "—"} figma=${profile.figma_file_key ? "yes" : "no"}`,
  });
  const industry = scoreIndustry(profile, brief);
  reasons.push({ criterion: "industry", score: industry, detail: brief.overview.industry || "general" });

  const score =
    intent * WEIGHTS.intent +
    density * WEIGHTS.density +
    personality * WEIGHTS.personality +
    a11y * WEIGHTS.a11y +
    technical * WEIGHTS.technical +
    industry * WEIGHTS.industry;

  return { score, reasons };
}

export function matchResources(input: {
  profiles: UiResourceProfile[];
  brief: DesignBrief;
  classification: PageClassification;
  /** Override default threshold (rubric: 8, or 10 if low confidence). */
  minScore?: number;
}): ResourceMatchResult {
  const min =
    input.minScore ??
    (input.classification.confidence === "low" ? 10 : 8);

  const candidates = input.profiles.filter(
    (p) => platformOk(p, input.classification) && pageTypeOk(p, input.classification),
  );

  if (candidates.length === 0) {
    return {
      id: "",
      score: 0,
      max_score: MAX_SCORE,
      reasons: [{ criterion: "filter", score: 0, detail: "No profiles passed platform/page_type filters" }],
      selection_mode: "no_candidates",
    };
  }

  const ranked = candidates
    .map((profile) => {
      const { score, reasons } = scoreProfile(profile, input.brief, input.classification);
      return { profile, score, reasons };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aT = a.profile.kind === "template" && a.profile.template_id ? 1 : 0;
      const bT = b.profile.kind === "template" && b.profile.template_id ? 1 : 0;
      if (bT !== aT) return bT - aT;
      return a.profile.id.localeCompare(b.profile.id);
    });

  const top = ranked[0];
  if (!top || top.score < min) {
    return {
      id: top?.profile.id || "",
      score: top?.score ?? 0,
      max_score: MAX_SCORE,
      reasons: top?.reasons || [],
      selection_mode: "below_threshold",
      profile: top?.profile,
      template_id: top?.profile.template_id,
      figma_file_key: top?.profile.figma_file_key,
    };
  }

  return {
    id: top.profile.id,
    score: top.score,
    max_score: MAX_SCORE,
    reasons: top.reasons,
    selection_mode: "scored_match",
    profile: top.profile,
    template_id: top.profile.template_id,
    figma_file_key: top.profile.figma_file_key,
  };
}

export { MAX_SCORE };
