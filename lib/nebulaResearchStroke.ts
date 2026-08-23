/**
 * Phase 3 research stroke: assumptions → Web Search → write competitor-research.md → merge plan.
 * One heavy Grok job. Do not invent competitors.
 */

import fs from "fs";
import path from "path";
import { callGrokWebSearch } from "./grokWebSearch";
import { readMasterPlanFile, syncUiBriefFromMasterPlan } from "./nebulaIdeWorkspaceArtifacts";
import { MASTER_PLAN_SECTION_KEYS } from "./masterPlanSections";
import {
  RESEARCH_ARTIFACT_REL,
  RESEARCH_MAX_COMPETITORS,
  RESEARCH_MIN_COMPETITORS,
  assessResearchArtifact,
  goalFingerprint,
  parseCompetitorNames,
  readResearchArtifact,
  writeResearchArtifact,
  type ResearchGate,
} from "./researchArtifact";

const researchJobs = new Set<string>();

export function isResearchJobActive(workspaceRoot: string): boolean {
  return researchJobs.has(workspaceRoot);
}

export function inferAssumptionsFromGoal(goal: string, projectType?: string): string[] {
  const g = String(goal || "");
  const lines: string[] = [];
  const type =
    projectType ||
    (/\bmobile\b/i.test(g) ? "Mobile App" : /\blanding\b/i.test(g) ? "Landing Page" : "Web App");
  lines.push(`Project type (inferred): ${type}`);
  if (/\b(adhd|kids?|child|student|teacher|tutor|classroom|school|parent)\b/i.test(g)) {
    lines.push("Education: primary users include student + teacher; parent/caregiver often secondary.");
    lines.push("Privacy: treat learner data as sensitive; accounts likely needed.");
  }
  if (/\b(pay|stripe|invoice|checkout|shop|ecommerce)\b/i.test(g)) {
    lines.push("Payments: higher security baseline; no card data in logs.");
  }
  if (/\b(adhd|focus|timer|break|pomodoro)\b/i.test(g)) {
    lines.push("ADHD-friendly UX: short sessions, clear next action, low visual noise (assumption).");
  }
  if (lines.length === 1) {
    lines.push("Industry/users inferred from goal wording; research must confirm competitors and patterns.");
  }
  return lines;
}

export function buildAssumptionStub(opts: {
  goal: string;
  projectKey: string;
  projectType?: string;
}): string {
  const assumptions = inferAssumptionsFromGoal(opts.goal, opts.projectType);
  const fp = goalFingerprint(opts.goal);
  return [
    "# Competitor research",
    "",
    `project_key: ${opts.projectKey}`,
    `goal_fingerprint: ${fp}`,
    `timestamp: ${new Date().toISOString()}`,
    "",
    "## Category",
    "",
    opts.goal.trim().slice(0, 400) || "(goal)",
    "",
    "## Assumptions",
    "",
    ...assumptions.map((a) => `- INFERRED (before search): ${a}`),
    "",
    "## Competitors",
    "",
    "(Web Search will fill 3–10 real product names — do not invent.)",
    "",
    "## Feature map",
    "",
    "(Ranked recurring features after search.)",
    "",
    "## UI/UX patterns",
    "",
    "(Layout, navigation, density, tone for the target device — after search.)",
    "",
    "## Evidence",
    "",
    "No supporting studies found for this feature.",
    "",
  ].join("\n");
}

function extractMarkdownDocument(raw: string): string {
  const fence = raw.match(/```(?:markdown|md)?\s*([\s\S]*?)```/i);
  if (fence?.[1]?.trim()) return fence[1].trim();
  const start = raw.search(/^#\s+/m);
  if (start >= 0) return raw.slice(start).trim();
  return raw.trim();
}

function ensureMeta(md: string, opts: { projectKey: string; goal: string }): string {
  let out = md.trim();
  if (!/^#\s+/m.test(out)) out = `# Competitor research\n\n${out}`;
  const fp = goalFingerprint(opts.goal);
  if (!/goal[_-]?fingerprint/i.test(out)) {
    out = out.replace(/^#.*$/m, (h) => `${h}\n\ngoal_fingerprint: ${fp}`);
  } else {
    out = out.replace(/goal[_-]?fingerprint\s*:\s*[-\d]+/i, `goal_fingerprint: ${fp}`);
  }
  if (!/project_key\s*:/i.test(out)) {
    out = out.replace(/^#.*$/m, (h) => `${h}\nproject_key: ${opts.projectKey}`);
  }
  if (!/timestamp\s*:/i.test(out)) {
    out = `${out}\n\ntimestamp: ${new Date().toISOString()}\n`;
  } else {
    out = out.replace(/timestamp\s*:\s*\S+/i, `timestamp: ${new Date().toISOString()}`);
  }
  return out;
}

export function mergeResearchIntoMasterPlan(opts: {
  workspaceRoot: string;
  masterPlanPath: string;
}): { updated: string[] } {
  const md = readResearchArtifact(opts.workspaceRoot);
  const gate = assessResearchArtifact(opts.workspaceRoot);
  if (!md.trim() || (!gate.ok && !gate.skipped)) return { updated: [] };

  const plan = readMasterPlanFile(opts.masterPlanPath);
  const names = gate.competitors.length ? gate.competitors : parseCompetitorNames(md);
  const featureSlice =
    md.match(/##\s*(Feature map|Ranked features|Recurring features)[\s\S]*?(?=\n##\s+|$)/i)?.[0] || "";
  const patternSlice = md.match(/##\s*UI\/UX patterns[\s\S]*?(?=\n##\s+|$)/i)?.[0] || "";
  const evidenceSlice = md.match(/##\s*Evidence[\s\S]*?(?=\n##\s+|$)/i)?.[0] || "";
  const researchBlock = [
    "**Research (Web Search — Gate R):**",
    names.length ? `- **Competitors:** ${names.join(", ")}` : "",
    featureSlice ? featureSlice.replace(/^##\s*/, "### ") : "",
    patternSlice ? patternSlice.replace(/^##\s*/, "### ") : "",
    evidenceSlice ? evidenceSlice.replace(/^##\s*/, "### ").slice(0, 1200) : "",
  ]
    .filter(Boolean)
    .join("\n")
    .trim();

  const key2 = MASTER_PLAN_SECTION_KEYS[1];
  const prev2 = String(plan[key2] ?? "").trim();
  const withoutOld = prev2.replace(/\*\*Research \(Web Search — Gate R\):\*\*[\s\S]*$/i, "").trim();
  const next2 = [withoutOld, researchBlock].filter(Boolean).join("\n\n");
  const updated: string[] = [];
  if (next2 && next2 !== prev2) {
    plan[key2] = next2;
    updated.push(key2);
  }

  const key3 = MASTER_PLAN_SECTION_KEYS[2];
  const prev3 = String(plan[key3] ?? "").trim();
  if (prev3.length < 80 && featureSlice.length > 40) {
    plan[key3] = `${prev3}\n\n${featureSlice}`.trim();
    updated.push(key3);
  }

  const key5 = MASTER_PLAN_SECTION_KEYS[4];
  const prev5 = String(plan[key5] ?? "").trim();
  if (prev5.length < 80 && patternSlice.length > 40) {
    plan[key5] = `${prev5}\n\n${patternSlice}`.trim();
    updated.push(key5);
  }

  if (updated.length === 0) return { updated: [] };
  fs.mkdirSync(path.dirname(opts.masterPlanPath), { recursive: true });
  fs.writeFileSync(opts.masterPlanPath, JSON.stringify(plan, null, 2), "utf8");
  return { updated };
}

function mergeResearchAndSyncBrief(opts: {
  workspaceRoot: string;
  masterPlanPath: string;
}): { updated: string[] } {
  const merged = mergeResearchIntoMasterPlan(opts);
  syncUiBriefFromMasterPlan(opts.workspaceRoot, opts.masterPlanPath);
  return merged;
}

export async function runResearchStroke(opts: {
  apiKey: string;
  workspaceRoot: string;
  masterPlanPath: string;
  projectKey: string;
  projectName: string;
  goal: string;
  projectType?: string;
  force?: boolean;
}): Promise<{
  ok: boolean;
  gate: ResearchGate;
  wrote: boolean;
  merged: string[];
  error?: string;
  reused?: boolean;
}> {
  const existing = assessResearchArtifact(opts.workspaceRoot, { goal: opts.goal });
  if (existing.ok && !opts.force) {
    const merged = mergeResearchAndSyncBrief({
      workspaceRoot: opts.workspaceRoot,
      masterPlanPath: opts.masterPlanPath,
    });
    return { ok: true, gate: existing, wrote: false, merged: merged.updated, reused: true };
  }

  if (!opts.apiKey || opts.apiKey.length < 20) {
    const stub = buildAssumptionStub({
      goal: opts.goal,
      projectKey: opts.projectKey,
      projectType: opts.projectType,
    });
    writeResearchArtifact(opts.workspaceRoot, stub);
    const gate = assessResearchArtifact(opts.workspaceRoot, { goal: opts.goal });
    return {
      ok: false,
      gate,
      wrote: true,
      merged: [],
      error: "Main AI API key missing — cannot run Web Search research.",
    };
  }

  if (researchJobs.has(opts.workspaceRoot)) {
    return {
      ok: false,
      gate: existing,
      wrote: false,
      merged: [],
      error: "Research already running for this project — wait, then continue.",
    };
  }

  researchJobs.add(opts.workspaceRoot);
  try {
    const plan = readMasterPlanFile(opts.masterPlanPath);
    const typeHint =
      opts.projectType ||
      String(plan["1. Goal of the app"] ?? "").match(/project\s*type\s*:\s*([^\n]+)/i)?.[1] ||
      "";

    const system = `You are Grok doing ONE research stroke with Web Search for Nebulla.
Write a compact markdown research file. Real product names only — never invent companies.
Short bullets are enough — do not write essays or academic citations.
If a fact is not found, write exactly: No supporting studies found for this feature.
Do not emit file fences other than the markdown body.
Output the full markdown document with these headings exactly:
# Competitor research
## Category
## Assumptions
## Competitors
## Feature map
## UI/UX patterns
## Evidence`;

    const user = `Project: ${opts.projectName}
Key: ${opts.projectKey}
Type hint: ${typeHint || "(infer)"}
Goal:
${opts.goal.slice(0, 1500)}

Search the web for:
1) at least ${RESEARCH_MIN_COMPETITORS} real competitor or analogue products (apps/sites) in this category (up to ${RESEARCH_MAX_COMPETITORS})
2) a short ranked / recurring-feature bullet list (3+ bullets)
3) optional UI/UX notes
4) optional study/stat — or the exact no-studies line

Assumptions already inferred (confirm or correct in ## Assumptions):
${inferAssumptionsFromGoal(opts.goal, opts.projectType)
  .map((a) => `- ${a}`)
  .join("\n")}

Mark each assumption CONFIRMED or CORRECTED after search.`;

    const searched = await callGrokWebSearch({
      apiKey: opts.apiKey,
      system,
      user,
    });
    if (searched.ok === false) {
      const gate = assessResearchArtifact(opts.workspaceRoot, { goal: opts.goal });
      return { ok: false, gate, wrote: true, merged: [], error: searched.error };
    }

    const body = ensureMeta(extractMarkdownDocument(searched.text), {
      projectKey: opts.projectKey,
      goal: opts.goal,
    });
    writeResearchArtifact(opts.workspaceRoot, body);
    let gate = assessResearchArtifact(opts.workspaceRoot, { goal: opts.goal });
    // Fast Prototype: one primary Web Search stroke. Second rewrite only when force: true.
    if (!gate.ok && opts.force) {
      const repaired = await callGrokWebSearch({
        apiKey: opts.apiKey,
        system: `You are rewriting a competitor-research markdown file so it passes a strict parser.
Output the full markdown document with these headings exactly:
# Competitor research
## Category
## Assumptions
## Competitors
## Feature map
## UI/UX patterns
## Evidence
Rules: ## Competitors must be a numbered list of ${RESEARCH_MIN_COMPETITORS}–${RESEARCH_MAX_COMPETITORS} real product names (one name per line, e.g. "1. Khan Academy — practice app"). No tables. ## Feature map must be a numbered list of at least 3 recurring features.
Real names only — never invent companies. If no study exists, write: No supporting studies found for this feature.`,
        user: `Gate R failed: ${gate.reasons.join("; ")}

Project: ${opts.projectName}
Goal:
${opts.goal.slice(0, 1500)}

Rewrite the draft below so ## Competitors is a numbered list of ${RESEARCH_MIN_COMPETITORS}–${RESEARCH_MAX_COMPETITORS} real products.

Previous draft:
${body.slice(0, 6000)}`,
      });
      if (repaired.ok) {
        const next = ensureMeta(extractMarkdownDocument(repaired.text), {
          projectKey: opts.projectKey,
          goal: opts.goal,
        });
        writeResearchArtifact(opts.workspaceRoot, next);
        gate = assessResearchArtifact(opts.workspaceRoot, { goal: opts.goal });
      }
    }
    if (!gate.ok) {
      return {
        ok: false,
        gate,
        wrote: true,
        merged: [],
        error: `Research below minimum: ${gate.reasons.join("; ")}`,
      };
    }
    const merged = mergeResearchAndSyncBrief({
      workspaceRoot: opts.workspaceRoot,
      masterPlanPath: opts.masterPlanPath,
    });
    return { ok: true, gate, wrote: true, merged: merged.updated };
  } finally {
    researchJobs.delete(opts.workspaceRoot);
  }
}

export function researchArtifactRelPath(): string {
  return RESEARCH_ARTIFACT_REL;
}

export function researchNotesDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, "nebula-project");
}
