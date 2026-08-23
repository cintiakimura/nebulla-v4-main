/**
 * Gate R — mandatory research artifact.
 * Canonical path (reuse inference-first): nebula-project/competitor-research.md
 * Authority: nebula-project/recovery-orchestration.md §11 Phase 3
 */

import fs from "fs";
import path from "path";
import {
  RESEARCH_MAX_COMPETITORS,
  RESEARCH_MIN_COMPETITORS,
} from "./researchStages";
export {
  RESEARCH_STAGE_BRIEF,
  RESEARCH_STAGE_MERGING,
  RESEARCH_STAGE_SEARCHING,
  RESEARCH_STAGE_WRITING,
  RESEARCH_STOPPED,
  RESEARCH_MIN_COMPETITORS,
  RESEARCH_MAX_COMPETITORS,
} from "./researchStages";

export const RESEARCH_ARTIFACT_REL = "nebula-project/competitor-research.md";

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

const COMPETITOR_HEADER =
  /^(name|competitor|product|app|source|url|link|notes|description|ranking|rank)$/i;

function cleanCompetitorName(raw: string): string {
  let name = String(raw || "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`]/g, "")
    .replace(/\(https?:\/\/[^)]+\)/gi, "")
    .trim();
  name = name.split("|")[0].trim();
  name = name.replace(/\s+[—–].*$/, "").replace(/\s+:\s+.*$/, "").trim();
  if (name.length > 80) name = name.slice(0, 80).trim();
  if (COMPETITOR_HEADER.test(name)) return "";
  return name;
}

function addCompetitorName(raw: string, names: string[], seen: Set<string>): void {
  const name = cleanCompetitorName(raw);
  if (!name || looksInvented(name)) return;
  const key = name.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  names.push(name);
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-{2,}.*\|/.test(line) || /^\s*\|?\s*[-:| ]+$/.test(line);
}

/** Bullet / numbered / table / bold names under ## Competitors. */
export function parseCompetitorNames(md: string): string[] {
  const section = sliceSection(md, /##\s*Competitors\b/i);
  if (!section) return [];
  const names: string[] = [];
  const seen = new Set<string>();
  for (const line of section.split("\n")) {
    if (!line.trim() || isTableSeparator(line)) continue;
    const bullet = line.match(/^\s*[-*•]\s+(?:\*\*)?([^*|\n]+?)(?:\*\*)?(?:\s*[—–|:(-]|$)/);
    const numbered = line.match(/^\s*\d+[.)]\s+(?:\*\*)?([^*|\n]+?)(?:\*\*)?(?:\s*[—–|:(-]|$)/);
    const bold = line.match(/^\s*\*\*([^*]+)\*\*/);
    const table = line.match(/^\s*\|\s*([^|\n]+)\|/);
    const raw = (bullet?.[1] || numbered?.[1] || bold?.[1] || table?.[1] || "").trim();
    if (!raw) continue;
    addCompetitorName(raw, names, seen);
    if (names.length >= RESEARCH_MAX_COMPETITORS) break;
  }
  return names;
}

/** Competitors listed in Master Plan §2 (`- **Competitors:** A, B, C`). */
export function parseCompetitorNamesFromPlan(plan: Record<string, unknown> | null | undefined): string[] {
  const text = [
    pickPlanSection(plan, "2. Tech and Research"),
    pickPlanSection(plan, "2. Tech Research"),
    pickPlanSection(plan, "2. Tech & Research"),
  ]
    .filter(Boolean)
    .join("\n");
  if (!text.trim()) return [];
  const names: string[] = [];
  const seen = new Set<string>();
  const inline = text.match(/\*\*Competitors:\*\*\s*([^\n]+)/i)?.[1] || text.match(/Competitors:\s*([^\n]+)/i)?.[1];
  if (inline) {
    for (const part of inline.split(/[,;]/)) {
      addCompetitorName(part, names, seen);
      if (names.length >= RESEARCH_MAX_COMPETITORS) return names;
    }
  }
  for (const n of parseCompetitorNames(text)) {
    addCompetitorName(n, names, seen);
    if (names.length >= RESEARCH_MAX_COMPETITORS) break;
  }
  return names;
}

function pickPlanSection(plan: Record<string, unknown> | null | undefined, key: string): string {
  return String(plan?.[key] || "").trim();
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
    sliceSection(md, /##\s*(Feature map|Ranked features|Recurring features|Recurring patterns)\b/i) ||
    sliceSection(md, /##\s*Features\b/i);
  if (!section) return 0;
  const bullets = section.split("\n").filter((l) => /^\s*([-*•]|\d+[.)])\s+\S/.test(l)).length;
  if (bullets >= 3) return bullets;
  const tableRows = section.split("\n").filter((l) => {
    if (!/^\s*\|/.test(l) || isTableSeparator(l)) return false;
    const first = (l.split("|").map((c) => c.trim()).filter(Boolean)[0] || "");
    return first.length > 1 && !COMPETITOR_HEADER.test(first) && !/^(feature|recurring)$/i.test(first);
  }).length;
  return Math.max(bullets, tableRows);
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

export function stableGoalCore(goal: string): string {
  const lines = String(goal || "")
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const kept: string[] = [];
  for (const line of lines) {
    if (/^Project Type:/i.test(line)) continue;
    if (/^Users, problem, and MVP scope/i.test(line)) continue;
    if (/^Pages:/i.test(line)) continue;
    if (/^Features:/i.test(line)) continue;
    kept.push(line);
  }
  return kept.join(" ").trim().toLowerCase().slice(0, 160);
}

function hashGoalString(t: string): string {
  const s = String(t || "").trim().toLowerCase().replace(/\s+/g, " ");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return String(h);
}

export function goalFingerprint(goal: string): string {
  const core = stableGoalCore(goal);
  return hashGoalString(core || String(goal || "").trim());
}

/** Raw 400-char hash used before seed boilerplate was stripped. */
export function legacyGoalFingerprint(goal: string): string {
  return hashGoalString(String(goal || "").trim().toLowerCase().replace(/\s+/g, " ").slice(0, 400));
}

export function goalFingerprintMatches(stored: string, goal: string): boolean {
  if (!stored) return true;
  const g = String(goal || "");
  return stored === goalFingerprint(g) || stored === legacyGoalFingerprint(g);
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
  opts?: { goal?: string; goalCandidates?: string[]; plan?: Record<string, unknown> | null },
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
    reasons.push("need at least 3 recurring-feature bullets (short list is enough)");
  }
  if (md.trim()) {
    const stored = parseGoalFingerprint(md);
    const candidates = [opts?.goal, ...(opts?.goalCandidates || [])]
      .map((g) => String(g || "").trim())
      .filter(Boolean);
    if (stored && candidates.length && !candidates.some((g) => goalFingerprintMatches(stored, g))) {
      reasons.push("research is stale — goal changed; re-run Web Search");
    }
  }
  const planNames = parseCompetitorNamesFromPlan(opts?.plan);
  if (reasons.length > 0 && planNames.length >= RESEARCH_MIN_COMPETITORS) {
    return {
      ok: true,
      skipped: false,
      path: RESEARCH_ARTIFACT_REL,
      competitorCount: Math.max(competitors.length, planNames.length),
      competitors: planNames.length >= competitors.length ? planNames : competitors,
      rankedFeatureCount: Math.max(rankedFeatureCount, 3),
      reasons: [],
    };
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
