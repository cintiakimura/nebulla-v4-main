/**
 * Gate R — mandatory research artifact.
 * Canonical path (reuse inference-first): nebula-project/competitor-research.md
 * Authority: nebula-project/recovery-orchestration.md §11 Phase 3
 */

import fs from "fs";
import path from "path";
export {
  RESEARCH_STAGE_BRIEF,
  RESEARCH_STAGE_MERGING,
  RESEARCH_STAGE_SEARCHING,
  RESEARCH_STAGE_WRITING,
  RESEARCH_STOPPED,
} from "./researchStages";

export const RESEARCH_ARTIFACT_REL = "nebula-project/competitor-research.md";
export const RESEARCH_MIN_COMPETITORS = 5;
export const RESEARCH_MAX_COMPETITORS = 10;

/** Demo-only. Production default is research ON. */
export function isResearchSkipEnabled(workspaceRoot?: string): boolean {
  const env = String(process.env.NEBULLA_SKIP_RESEARCH || "").trim().toLowerCase();
  if (env === "1" || env === "true" || env === "yes") return true;
  if (!workspaceRoot) return false;
  try {
    const p = path.join(workspaceRoot, "nebulla-ide", "skip-research.json");
    if (!fs.existsSync(p)) return false;
    const raw = JSON.parse(fs.readFileSync(p, "utf8")) as { skip?: boolean };
    return raw.skip === true;
  } catch {
    return false;
  }
}

export function researchArtifactPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, RESEARCH_ARTIFACT_REL);
}

export function readResearchArtifact(workspaceRoot: string): string {
  const p = researchArtifactPath(workspaceRoot);
  if (!fs.existsSync(p)) return "";
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

export function writeResearchArtifact(workspaceRoot: string, content: string): string {
  const p = researchArtifactPath(workspaceRoot);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, "utf8");
  return RESEARCH_ARTIFACT_REL;
}

const INVENTED_NAME =
  /^(competitor|example|sample|acme|foo|bar|baz|test|dummy|placeholder|product)\s*\d*$/i;

function looksInvented(name: string): boolean {
  const t = name.replace(/[*_`[\]]/g, "").trim();
  if (t.length < 2) return true;
  if (INVENTED_NAME.test(t)) return true;
  if (/^n\/?a$/i.test(t)) return true;
  return false;
}

/** Bullet / numbered / table-cell names under ## Competitors. */
export function parseCompetitorNames(md: string): string[] {
  const section = sliceSection(md, /##\s*Competitors\b/i);
  if (!section) return [];
  const names: string[] = [];
  const seen = new Set<string>();
  for (const line of section.split("\n")) {
    const bullet = line.match(/^\s*[-*•]\s+(?:\*\*)?([^*|\n]+?)(?:\*\*)?(?:\s*[—–|:(-]|$)/);
    const numbered = line.match(/^\s*\d+[.)]\s+(?:\*\*)?([^*|\n]+?)(?:\*\*)?(?:\s*[—–|:(-]|$)/);
    const raw = (bullet?.[1] || numbered?.[1] || "").trim();
    if (!raw) continue;
    const name = raw.replace(/\[([^\]]+)\]\([^)]+\)/, "$1").trim();
    if (looksInvented(name)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
    if (names.length >= RESEARCH_MAX_COMPETITORS) break;
  }
  return names;
}

function sliceSection(md: string, heading: RegExp): string {
  const m = md.match(heading);
  if (!m || m.index == null) return "";
  const start = m.index;
  const rest = md.slice(start + m[0].length);
  const next = rest.search(/\n##\s+/);
  return (m[0] + (next >= 0 ? rest.slice(0, next) : rest)).trim();
}

export function countRankedFeatures(md: string): number {
  const section =
    sliceSection(md, /##\s*(Feature map|Ranked features|Recurring features)\b/i) ||
    sliceSection(md, /##\s*Features\b/i);
  if (!section) return 0;
  return section.split("\n").filter((l) => /^\s*([-*•]|\d+[.)])\s+\S/.test(l)).length;
}

export function hasEvidenceSection(md: string): boolean {
  const section = sliceSection(md, /##\s*Evidence\b/i);
  if (!section || section.length < 40) return false;
  return /no supporting studies found/i.test(section) || /\bhttps?:\/\/|\bsource\b|\bstudy\b|\breport\b/i.test(section);
}

export function hasUiPatternsSection(md: string): boolean {
  const section = sliceSection(md, /##\s*UI\/UX patterns\b/i);
  return Boolean(section && section.length > 60);
}

export function hasAssumptionsSection(md: string): boolean {
  const section = sliceSection(md, /##\s*Assumptions\b/i);
  return Boolean(section && section.length > 40);
}

export function goalFingerprint(goal: string): string {
  const t = String(goal || "").trim().toLowerCase().replace(/\s+/g, " ").slice(0, 400);
  let h = 0;
  for (let i = 0; i < t.length; i++) h = ((h << 5) - h + t.charCodeAt(i)) | 0;
  return String(h);
}

export function parseGoalFingerprint(md: string): string {
  const m = md.match(/goal[_-]?fingerprint\s*:\s*([-\d]+)/i);
  return m?.[1]?.trim() || "";
}

export type ResearchGate = {
  ok: boolean;
  skipped: boolean;
  path: string;
  competitorCount: number;
  competitors: string[];
  rankedFeatureCount: number;
  reasons: string[];
};

export function assessResearchArtifact(
  workspaceRoot: string,
  opts?: { goal?: string },
): ResearchGate {
  if (isResearchSkipEnabled(workspaceRoot)) {
    return {
      ok: true,
      skipped: true,
      path: RESEARCH_ARTIFACT_REL,
      competitorCount: 0,
      competitors: [],
      rankedFeatureCount: 0,
      reasons: ["demo skip (NEBULLA_SKIP_RESEARCH) — not production default"],
    };
  }
  const md = readResearchArtifact(workspaceRoot);
  const reasons: string[] = [];
  if (!md.trim()) {
    reasons.push("research artifact missing");
  }
  const competitors = parseCompetitorNames(md);
  if (competitors.length < RESEARCH_MIN_COMPETITORS) {
    reasons.push(
      `need ${RESEARCH_MIN_COMPETITORS}–${RESEARCH_MAX_COMPETITORS} real competitor names (found ${competitors.length})`,
    );
  }
  const rankedFeatureCount = countRankedFeatures(md);
  if (rankedFeatureCount < 3) {
    reasons.push("ranked recurring features missing or too thin");
  }
  if (!hasUiPatternsSection(md)) reasons.push("UI/UX patterns section missing");
  if (!hasEvidenceSection(md)) {
    reasons.push('evidence section missing (need sources or "No supporting studies found for this feature.")');
  }
  if (!hasAssumptionsSection(md)) reasons.push("assumptions list missing");
  if (opts?.goal && md.trim()) {
    const fp = goalFingerprint(opts.goal);
    const stored = parseGoalFingerprint(md);
    if (stored && stored !== fp) {
      reasons.push("research is stale — goal changed; re-run Web Search");
    }
  }
  return {
    ok: reasons.length === 0,
    skipped: false,
    path: RESEARCH_ARTIFACT_REL,
    competitorCount: competitors.length,
    competitors,
    rankedFeatureCount,
    reasons,
  };
}
