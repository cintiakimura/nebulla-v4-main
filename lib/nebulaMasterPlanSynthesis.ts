import fs from "fs";
import {
  MASTER_PLAN_SECTION_KEYS,
  masterPlanKeyForTabIndex,
  parseMasterPlanBlock,
} from "./masterPlanSections";
import {
  fillMissingMasterPlanSectionsLocal,
  listMissingMasterPlanSections,
  readMasterPlanFile,
} from "./nebulaIdeWorkspaceArtifacts";

export { listMissingMasterPlanSections, fillMissingMasterPlanSectionsLocal };

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

  const system = `You are Grok 4 (Master Plan writer only). Follow nebula-project/project-execution-rules.md.

Output EXACTLY one block: <START_MASTERPLAN>...</END_MASTERPLAN>

Inside, use these five headers exactly (### prefix recommended):
### 1. Goal of the app
### 2. Text & Search
### 3. Features and KPIs
### 4. Pages and navigation
### 5. UI/UX design

Rules:
- Synthesize ALL five sections from discovery — implementation-grade depth, no empty placeholders.
- §4: every page as \`- **Name** (\`/route\`)\` — up to 12 routes.
- §5: **15–25 lines max** — palette, typography, nav pattern; NO code; NO copy-paste of §4.
- Do NOT emit START_CODING, file blocks, or chat prose outside the tags.`;

  const user = `Project: ${opts.projectName}
Thin or missing sections: ${missing.join(", ")}
Go focus: ${opts.userNote?.trim() || "(none)"}

Current master-plan.json:
${JSON.stringify(opts.planSnapshot, null, 2)}

Discovery conversation:
${opts.memoryContent.slice(0, 90_000)}`;

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

/** Fill missing sections before Go — Grok from chat when memory exists, else local routes. */
export async function ensureMasterPlanBeforeGo(opts: {
  apiKey: string;
  workspaceRoot: string;
  masterPlanPath: string;
  planSnapshot: Record<string, string>;
  memoryContent: string;
  projectName: string;
  userNote?: string;
}): Promise<{ written: string[]; source: "local" | "grok" | "none" }> {
  const thinSections = listMissingMasterPlanSections(opts.planSnapshot);
  const hasMemory = opts.memoryContent.trim().length > 200;

  if (hasMemory && thinSections.length > 0) {
    const grok = await synthesizeMasterPlanSectionsWithGrok({
      ...opts,
      planSnapshot: opts.planSnapshot,
    });
    if (grok.written.length > 0) {
      return { written: grok.written, source: "grok" };
    }
  }

  const local = fillMissingMasterPlanSectionsLocal({
    workspaceRoot: opts.workspaceRoot,
    masterPlanPath: opts.masterPlanPath,
    projectName: opts.projectName,
    userNote: opts.userNote,
  });
  if (local.updated.length > 0) {
    return { written: local.updated, source: "local" };
  }
  return { written: [], source: "none" };
}
