import { extractMasterPlanInner, sourceHasMasterPlanBlock } from '../../lib/masterPlanTags';
import {
  MASTER_PLAN_SECTION_KEYS,
  masterPlanKeyForTabIndex,
  parseMasterPlanBlock,
  masterPlanSectionSeparationRules,
} from './masterPlanSections';
import { fetchJson } from './apiFetch';
import { withProjectBody, withProjectQuery } from './nebulaProjectApi';

export const MASTER_PLAN_TAB_NAMES = [...MASTER_PLAN_SECTION_KEYS] as const;

/** Normalize common model mistakes before `/api/files/apply-generated`. */
export function normalizeGrokFileBlockSyntax(raw: string): string {
  let s = raw
    .replace(/"""\s*file:/gi, '```file:')
    .replace(/'''\s*file:/gi, '```file:')
    .replace(/```\s*file:/gi, '```file:');
  // Grok often closes file blocks with """ or ''' instead of ```
  s = s.replace(/```file:([^\n`]+)\n([\s\S]*?)"""/gi, '```file:$1\n$2```');
  s = s.replace(/```file:([^\n`]+)\n([\s\S]*?)'''/gi, '```file:$1\n$2```');
  return s;
}

const FILE_BLOCK_RE =
  /```(?:file|filepath)\s*:\s*([^\n`]+)\n[\s\S]*?```|"""\s*file:\s*([^\n"]+)\n[\s\S]*?"""|'''\s*file:\s*([^\n']+)\n[\s\S]*?'''/gi;

function stripAllFileBlocks(text: string, filePaths: string[]): string {
  return text
    .replace(FILE_BLOCK_RE, (_m, p1: string, p2: string, p3: string) => {
      const path = (p1 || p2 || p3 || '').trim().replace(/^["'`]+|["'`]+$/g, '');
      if (path) filePaths.push(path);
      return '';
    })
    .replace(/```file:[^\n`]*[\s\S]*$/gi, (_m) => {
      const pathMatch = _m.match(/```file:\s*([^\n`]+)/i);
      if (pathMatch?.[1]) filePaths.push(pathMatch[1].trim());
      return '';
    })
    .replace(/"""\s*file:[^\n"]*[\s\S]*$/gi, (_m) => {
      const pathMatch = _m.match(/"""\s*file:\s*([^\n"]+)/i);
      if (pathMatch?.[1]) filePaths.push(pathMatch[1].trim());
      return '';
    });
}

function buildIdeChatFallbackSummary(filePaths: string[], hadMasterPlan: boolean): string {
  const uniq = [...new Set(filePaths.map((p) => p.trim()).filter(Boolean))];
  const hasV0 = uniq.some((p) => /v0-prompt\.md$/i.test(p));
  const parts: string[] = [];
  if (hadMasterPlan) parts.push('Master Plan saved to your project tabs.');
  if (hasV0) {
    parts.push('v0 prompt saved to the project — UI Studio runs the first UI pass automatically.');
  }
  const other = uniq.filter((p) => !/v0-prompt\.md$/i.test(p));
  if (other.length > 0) {
    parts.push(`Updated ${other.length} workspace file(s).`);
  }
  if (parts.length === 0 && uniq.length > 0) {
    return `Saved ${uniq.length} file(s) to the workspace.`;
  }
  return parts.join(' ');
}

export function splitMasterPlanSectionsFromBlock(block: string): Partial<Record<number, string>> {
  return parseMasterPlanBlock(block);
}

/** Pull relative paths from Grok file blocks (before apply). */
export function extractGrokFilePaths(raw: string): string[] {
  const normalized = normalizeGrokFileBlockSyntax(raw);
  const paths: string[] = [];
  stripAllFileBlocks(normalized, paths);
  normalized.replace(
    /(?:^|\n)\s*(?:File|FILE)\s*:\s*([^\n]+)\n```[^\n]*\n[\s\S]*?```/gi,
    (_m, p: string) => {
      const path = p.trim();
      if (path) paths.push(path);
      return '';
    },
  );
  return [...new Set(paths)];
}

export async function persistMasterPlanFromAssistantSource(
  source: string,
  onProgress?: (message: string) => void,
): Promise<number> {
  const inner = extractMasterPlanInner(source);
  let parsed = inner ? parseMasterPlanBlock(inner) : {};
  if (Object.keys(parsed).length === 0) {
    parsed = parseMasterPlanBlock(source);
  }
  if (Object.keys(parsed).length === 0) return 0;
  onProgress?.('Saving Master Plan tabs…');
  let saved = 0;
  for (let tabIndex = 1; tabIndex <= MASTER_PLAN_SECTION_KEYS.length; tabIndex++) {
    const content = (parsed[tabIndex] ?? '').trim();
    if (!content) continue;
    try {
      await fetchJson(withProjectQuery('/api/master-plan/update'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(withProjectBody({ tabIndex, content })),
      });
      saved++;
    } catch (e) {
      console.warn('[grokChatArtifacts] master plan tab save failed:', tabIndex, e);
    }
  }
  if (saved > 0) {
    onProgress?.(`Saved ${saved} Master Plan tab(s)`);
    try {
      window.dispatchEvent(new CustomEvent('nebula-master-plan-updated'));
    } catch {
      /* ignore */
    }
  }
  return saved;
}

export type IdeChatDisplayResult = {
  displayText: string;
  filePaths: string[];
  hadMasterPlan: boolean;
  hadCodingTag: boolean;
};

/** Strip orchestration tags, Master Plan bodies, and code fences from IDE chat bubbles. */
export function formatAssistantForIdeChatDisplay(raw: string): IdeChatDisplayResult {
  const normalized = normalizeGrokFileBlockSyntax(raw);
  const filePaths: string[] = [];

  const hadMasterPlan = sourceHasMasterPlanBlock(normalized);
  const hadCodingTag = /<\s*START_CODING\s*>|\bSTART_CODING\b/i.test(normalized);

  let text = normalized
    .replace(/<REASONING>[\s\S]*?<\/REASONING>/gi, '')
    .replace(/<START_MASTERPLAN>[\s\S]*?<\/?END_MASTERPLAN>/gi, '')
    .replace(/<START_MASTERPLAN>[\s\S]*$/gi, '')
    .replace(/<\/END_MASTERPLAN>/gi, '')
    .replace(/<START_CODING>/gi, '')
    .replace(/\bSTART_CODING\b/gi, '')
    .replace(/<FINISH_MASTERPLAN>/gi, '')
    .replace(/<APPROVE_MASTERPLAN>/gi, '')
    .replace(/<APPROVE_MINDMAP>/gi, '')
    .replace(/<APPROVE_UI>/gi, '')
    .replace(/<START_UIUX>/gi, '')
    .replace(/<NEBULA_UI_STUDIO_PROMPT>[\s\S]*?<\/NEBULA_UI_STUDIO_PROMPT>/gi, '')
    .replace(/<GROK_B_SUMMARY_Q([1-6])>[\s\S]*?<\/GROK_B_SUMMARY_Q\1>/gi, '')
    .replace(/\bANSWER_Q[1-6]\b/gi, '')
    .replace(/Already fill up the question tab\./gi, '');

  text = stripAllFileBlocks(text, filePaths);

  text = text.replace(/(?:^|\n)\s*(?:File|FILE)\s*:\s*([^\n]+)\n```[^\n]*\n[\s\S]*?```/gi, (_m, p: string) => {
    const path = p.trim();
    if (path) filePaths.push(path);
    return '';
  });

  text = text.replace(/```[\w.-]*\n[\s\S]*?```/g, '');
  text = text.replace(/```[\w.-]*[\s\S]*?```/g, '');

  text = text
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const uniqPaths = [...new Set(filePaths.map((p) => p.trim()).filter(Boolean))];

  if (!text && (uniqPaths.length > 0 || hadMasterPlan)) {
    text = buildIdeChatFallbackSummary(uniqPaths, hadMasterPlan);
  } else if (uniqPaths.some((p) => /v0-prompt\.md$/i.test(p))) {
    // Drop any leftover v0 brief prose Grok pasted outside file blocks.
    text = text
      .replace(/(?:^|\n).*v0-prompt\.md.*(?:\n|$)/gi, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (!text) {
      text = buildIdeChatFallbackSummary(uniqPaths, hadMasterPlan);
    }
  }

  return { displayText: text, filePaths: uniqPaths, hadMasterPlan, hadCodingTag };
}

/** Extra rules appended for IDE right-panel chat only. */
export const IDE_CHAT_EXECUTION_APPENDIX = `
IDE CHAT SURFACE (project-execution-rules.md — strict):
- **USER TONE:** nebulla-project/user-communication-rules.md — friendly, short, no raw errors/jargon unless asked; silent fixes; clear next step.
- **MODE FIRST (Guided / Free / Coding / File):** Follow nebulla-project/chat-mode-detection.md on every turn.
  - Guided = new project / Master Plan interview (one question at a time).
  - Free = default Q&A — never force Master Plan.
  - Coding = checklist + \`\`\`file:\`\`\` / Go only.
  - File = local path or GitHub URL; product may open via /api/files/open(+-github) with rich preview — do not interrupt Master Plan / Go Code / v0.
- **GUARDIAN DOCS:** nebulla-project/code-review-checklist.md (before coding); nebulla-project/full-bug-database.md + nebulla-project/debugging-method.md (on errors); nebulla-project/user-communication-rules.md (tone).
- **Two surface modes:** CONVERSATION_MODE (default) vs BUILD_MODE (build/fix/implement/Go).
- **CONVERSATION_MODE:** Short natural prose only. **NEVER** output \`\`\`typescript\`, \`\`\`jsx\`, \`\`\`python\`, SQL, or any multi-line code in chat — the only valid code format is \`\`\`file:relative/path\` … \`\`\`. If the user asks you to show/write code, reply with one short sentence telling them to press **Go**.
- **BUILD_MODE (UNCHANGED CORE — Master Plan + Go Code):** Master Plan only inside \`<START_MASTERPLAN>…</END_MASTERPLAN>\` (server persists to master-plan.json). Implementation only as \`\`\`file:relative/path\` … \`\`\` and/or \`START_CODING\` — server writes files under workspaceRoot. Never dump code in conversational prose in the same turn. Architecture-first: code-review-checklist.md, smallest safe change, no hallucinated APIs/paths.
- **v0 prompt (critical):** Write \`nebula-ui-studio/v0-prompt.md\` only as a \`\`\`file:…\`\`\` block (800–1200 chars). **Never paste the v0 prompt body in chat** — the UI hides file blocks; users must not see routes, palette, or page specs in the chat bubble. After Master Plan, one short line in chat is enough (e.g. "Master Plan saved — starting UI pipeline.").
- **Never use** \`"""\`file:\` or triple-quote fences — use standard \`\`\`file:path\` only.
- If unsure which mode: stay in CONVERSATION_MODE / Free Chat and ask one clarifying question, or tell the user to press **Go** for build mode.
${masterPlanSectionSeparationRules()}
`.trim();

export function buildModeSystemAppendix(): string {
  return `
BUILD_MODE is active for this turn. Do not explain code in chat — emit file artifacts. Required when implementing:
1) Optional \`<START_MASTERPLAN>…</END_MASTERPLAN>\` if the plan changed — use all five section headers (see MASTER PLAN SECTION SEPARATION).
2) \`START_CODING\` on its own line when ready.
3) One or more \`\`\`file:relative/path\` … \`\`\` blocks (paths under src/, app/, pages/, components/, public/).
4) Optional \`\`\`file:nebula-ui-studio/v0-prompt.md\` … \`\`\` — **concise v0 brief only (800–1200 chars max)**. Bullet summary: app one-liner, up to 8 \`/routes\`, palette/fonts/layout, shadcn+Tailwind output. **Never paste full Master Plan §4 or §5** (server also caps length; long prompts fail and waste v0 credits).
`.trim();
}

/** Compact NDM reminder injected when Smart Chat detects debugging mode. */
export const NDM_DEBUG_APPENDIX = `
ACTIVE MODE: DEBUGGING — Nebula Debugging Method (NDM) is mandatory this turn:
1) Verify — expected vs actual; exact error/stack/UI symptom.
2) Analyze — imports/paths, null/undefined, env, API mismatches, async, deps (check full-bug-database.md patterns). List 2–5 causes; pick one root cause.
3) Trace — follow call stack / data flow; use code-review-checklist.md mentally. Explain briefly before coding.
4) Fix — smallest safe change only via \`\`\`file:relative/path\` … \`\`\` (no large refactors; no casual \`\`\`typescript fences).
5) Validate — confirm the original bug is fixed; note remaining risks in one short sentence.
Output contract: 1–3 sentences (Verify→Analyze→Trace) → file: Fix blocks → one Validate line.
Do not jump to a fix before Verify → Analyze → Trace. Prefer silent auto-fix language ("we fixed…").
`.trim();

/** Compact coding quality reminder when Smart Chat detects coding mode. */
export const CODING_QUALITY_APPENDIX = `
ACTIVE MODE: CODING — Architecture-first quality contract:
1) Mentally scan nebulla-project/code-review-checklist.md before every file block.
2) Follow Master Plan §1–§5 + Project Type; do not invent contradicting routes/features.
3) Smallest safe change; no drive-by refactors.
4) No hallucinated APIs/packages/env/paths — create them explicitly if needed in the same response.
5) Output only START_CODING and/or \`\`\`file:relative/path\` … \`\`\` — never casual code fences in chat.
`.trim();

/**
 * Turn Smart Chat Handler hints into a short system appendix so mode detection
 * actually reaches the model (previously codingHint was unused).
 */
export function chatModeSystemAppendix(options: {
  mode?: string;
  codingHint?: string;
  discoveryRequired?: boolean;
}): string {
  const mode = (options.mode || '').trim();
  const hint = (options.codingHint || '').trim();
  const discoveryRequired = Boolean(options.discoveryRequired);
  const parts: string[] = [];

  if (mode) {
    parts.push(`DETECTED_CHAT_MODE: ${mode}${discoveryRequired ? ' (Master Plan incomplete — Discovery still required before full build)' : ''}`);
  }

  if (mode === 'debugging' || /NDM:/i.test(hint)) {
    parts.push(NDM_DEBUG_APPENDIX);
  } else if (hint === 'guided-onboarding' || hint === 'discovery-required' || hint === 'discovery-required-after-file') {
    parts.push(
      'ACTIVE MODE: DISCOVERY — Ask exactly one clear question. Follow INITIAL ONBOARDING order (goal → Project Type unless My Projects already set it → remaining info → Research Pillars → closing questions). Do not emit START_CODING until the final-check reply. Do not run Tab 2–6 interview loops yet.',
    );
  } else if (hint) {
    parts.push(`MODE_GUIDANCE: ${hint}`);
  }

  if (mode === 'coding' && !discoveryRequired) {
    parts.push(CODING_QUALITY_APPENDIX);
  }

  if (mode === 'ui' && !discoveryRequired) {
    parts.push(
      'ACTIVE MODE: UI GENERATION — Ground v0 / UI Studio in §2 research (real competitors + UI patterns) + Project Type + §4 routes + §5 visuals. No vague "modern/clean" alone. Keep v0-prompt.md 800–1200 chars.',
    );
  }

  if (discoveryRequired && mode === 'free') {
    parts.push(
      'DISCOVERY STILL REQUIRED — You may answer casually, but if the user asks to build/architecture/UI, switch to one Discovery question immediately. Do not emit START_CODING.',
    );
  }

  return parts.join('\n\n').trim();
}

// Re-export for callers that need tab key by index
export { masterPlanKeyForTabIndex };
