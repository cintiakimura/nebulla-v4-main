import fs from "fs";
import path from "path";
import {
  MASTER_PLAN_SECTION_KEYS,
  masterPlanKeyForTabIndex,
  parseMasterPlanBlock,
} from "./masterPlanSections";
import {
  fillMissingMasterPlanSectionsLocal,
  listMissingMasterPlanSections,
  readMasterPlanFile,
  syncUiBriefFromMasterPlan,
} from "./nebulaIdeWorkspaceArtifacts";
import {
  readMasterPlanStrictMode,
  type MasterPlanCompletenessResult,
} from "./masterPlanCompleteness";
import { assessMasterPlanCompletenessWithWorkspace } from "./masterPlanCompletenessIo";
import { resolveMasterPlanStrictMode } from "./masterPlanStrictPolicy";
import { mergeResearchIntoMasterPlan } from "./nebulaResearchStroke";
import { readResearchArtifact } from "./researchArtifact";

export { listMissingMasterPlanSections, fillMissingMasterPlanSectionsLocal };
export { readMasterPlanStrictMode };
export { assessMasterPlanCompletenessWithWorkspace as assessMasterPlanCompleteness };

export function persistParsedMasterPlanSections(
  masterPlanPath: string,
  parsed: Partial<Record<number, string>>,
): string[] {
  const existing = readMasterPlanFile(masterPlanPath);
  const next = { ...existing };
  const written: string[] = [];

  for (let tabIndex = 1; tabIndex <= MASTER_PLAN_SECTION_KEYS.length; tabIndex++) {
    const key = masterPlanKeyForTabIndex(tabIndex);
    const content = (parsed[tabIndex] ?? "").trim();
    if (!key || !content) continue;
    const prev = String(next[key] ?? "").trim();
    if (!prev || content.length > prev.length * 0.85) {
      next[key] = content;
      written.push(key);
    }
  }

  if (written.length === 0) return [];
  fs.mkdirSync(path.dirname(masterPlanPath), { recursive: true });
  fs.writeFileSync(masterPlanPath, JSON.stringify(next, null, 2), "utf8");
  return written;
}

/** Grok 4: synthesize Master Plan sections from conversation memory. */
export async function synthesizeMasterPlanSectionsWithGrok(opts: {
  apiKey: string;
  masterPlanPath: string;
  workspaceRoot: string;
  planSnapshot: Record<string, string>;
  memoryContent: string;
  projectName: string;
  userNote?: string;
}): Promise<{ written: string[]; error?: string }> {
  const missing = listMissingMasterPlanSections(opts.planSnapshot);
  if (missing.length === 0) return { written: [] };

  const researchMd = readResearchArtifact(opts.workspaceRoot).trim();
  const researchNote = researchMd
    ? `\n\nCanonical research artifact (prefer over invention; never invent competitor names):\n${researchMd.slice(0, 6000)}`
    : "";

  const system = `You are Grok 4 (Master Plan writer only). Follow nebula-project/project-execution-rules.md (Master Plan contract).

Output EXACTLY one block: <START_MASTERPLAN>...</END_MASTERPLAN>

Inside, use these five headers exactly (### prefix recommended):
### 1. Goal of the app
### 2. Tech and Research
### 3. Features and KPIs
### 4. Pages and navigation
### 5. UI/UX design

Rules:
- Synthesize ALL five sections from discovery — implementation-grade depth, no empty placeholders.
- §1: Project Type (Web App / Mobile App / Landing Page) + goal + users + in/out of scope only.
- §2: Research Pillars — **8–12 real competitor names** (never invent), ranked features, evidence or exact "No supporting studies found for this feature.", UI patterns. When auth/private data applies, **include a security baseline draft** (auth model, tenant/RLS, roles, secrets, PII, deny-by-default) so the product can offer Accept — do not hide security; the IDE may still ask the user to confirm.
- §3: MVP features as verbs + **testable** KPIs (not slogans).
- §4: every page with required fields — name, route \`/path\`, purpose, primary_actions, data_entities, authz, empty_state, error_state, nav_links. This drives Mind Map + ui-brief. Vague page-name lists forbidden.
- §5: **15–25 lines max** — mood, hex palette, typography, density, radius, motion, component style, nav pattern. NO code; NO §4 copy; page detail belongs in ui-brief.md (written after plan save).
- Research must visibly shape §4/§5. Do NOT emit START_CODING, file blocks, or chat prose outside the tags.`;

  const user = `Project: ${opts.projectName}
Thin or missing sections: ${missing.join(", ")}
Go focus: ${opts.userNote?.trim() || "(none)"}

Current master-plan.json:
${JSON.stringify(opts.planSnapshot, null, 2)}

Discovery conversation:
${opts.memoryContent.slice(0, 90_000)}${researchNote}`;

  try {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4-1-fast-reasoning",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        stream: false,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { written: [], error: errText.slice(0, 400) };
    }

    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content?.trim() || "";
    const blockMatch = text.match(/<START_MASTERPLAN>([\s\S]*?)<\/?END_MASTERPLAN>/i);
    const inner = blockMatch?.[1]?.trim() || text;
    const parsed = parseMasterPlanBlock(inner);
    let written = persistParsedMasterPlanSections(opts.masterPlanPath, parsed);

    if (written.length === 0) {
      const local = fillMissingMasterPlanSectionsLocal({
        workspaceRoot: opts.workspaceRoot,
        masterPlanPath: opts.masterPlanPath,
        projectName: opts.projectName,
        userNote: opts.userNote,
      });
      written = local.updated;
    }

    return { written };
  } catch (e) {
    const local = fillMissingMasterPlanSectionsLocal({
      workspaceRoot: opts.workspaceRoot,
      masterPlanPath: opts.masterPlanPath,
      projectName: opts.projectName,
      userNote: opts.userNote,
    });
    return {
      written: local.updated,
      error: e instanceof Error ? e.message : "Master Plan synthesis failed — used local fill",
    };
  }
}

/** Fill missing sections before Go — Grok from chat when memory exists, else local routes. Phase 2 then Phase 3 brief sync. */
export async function ensureMasterPlanBeforeGo(opts: {
  apiKey: string;
  workspaceRoot: string;
  masterPlanPath: string;
  planSnapshot: Record<string, string>;
  memoryContent: string;
  projectName: string;
  userNote?: string;
}): Promise<{
  written: string[];
  source: "local" | "grok" | "none";
  completeness: MasterPlanCompletenessResult;
}> {
  const thinSections = listMissingMasterPlanSections(opts.planSnapshot);
  const hasMemory = opts.memoryContent.trim().length > 200;
  let written: string[] = [];
  let source: "local" | "grok" | "none" = "none";

  if (hasMemory && thinSections.length > 0) {
    const grok = await synthesizeMasterPlanSectionsWithGrok({
      ...opts,
      planSnapshot: opts.planSnapshot,
    });
    if (grok.written.length > 0) {
      written = grok.written;
      source = "grok";
    }
  }

  if (written.length === 0) {
    const local = fillMissingMasterPlanSectionsLocal({
      workspaceRoot: opts.workspaceRoot,
      masterPlanPath: opts.masterPlanPath,
      projectName: opts.projectName,
      userNote: opts.userNote,
    });
    if (local.updated.length > 0) {
      written = local.updated;
      source = "local";
    }
  }

  let planForAssess = opts.planSnapshot;
  if (written.length > 0) {
    try {
      planForAssess = readMasterPlanFile(opts.masterPlanPath);
    } catch {
      planForAssess = opts.planSnapshot;
    }
  }

  try {
    const merged = mergeResearchIntoMasterPlan({
      workspaceRoot: opts.workspaceRoot,
      masterPlanPath: opts.masterPlanPath,
    });
    if (merged.updated.length > 0) {
      written = [...new Set([...written, ...merged.updated])];
      planForAssess = readMasterPlanFile(opts.masterPlanPath);
    }
  } catch {
    /* research merge best-effort */
  }

  try {
    syncUiBriefFromMasterPlan(opts.workspaceRoot, opts.masterPlanPath);
  } catch {
    /* brief sync best-effort before completeness */
  }

  const completeness = assessMasterPlanCompletenessWithWorkspace({
    plan: planForAssess,
    mode: resolveMasterPlanStrictMode(opts.workspaceRoot),
    workspaceRoot: opts.workspaceRoot,
    checkUiBrief: true,
  });

  return { written, source, completeness };
}
