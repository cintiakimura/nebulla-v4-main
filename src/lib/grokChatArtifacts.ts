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
  return raw
    .replace(/"""file:/gi, '```file:')
    .replace(/'''file:/gi, '```file:')
    .replace(/```\s*file:/gi, '```file:');
}

export function splitMasterPlanSectionsFromBlock(block: string): Partial<Record<number, string>> {
  return parseMasterPlanBlock(block);
}

/** Pull relative paths from Grok file blocks (before apply). */
export function extractGrokFilePaths(raw: string): string[] {
  const normalized = normalizeGrokFileBlockSyntax(raw);
  const paths: string[] = [];
  normalized.replace(/```(?:file|filepath)\s*:\s*([^\n`]+)\n[\s\S]*?```/gi, (_m, p: string) => {
    const path = p.trim().replace(/^["'`]+|["'`]+$/g, '');
    if (path) paths.push(path);
    return '';
  });
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

  text = text.replace(/```(?:file|filepath)\s*:\s*([^\n`]+)\n[\s\S]*?```/gi, (_m, p: string) => {
    const path = p.trim().replace(/^["'`]+|["'`]+$/g, '');
    if (path) filePaths.push(path);
    return '';
  });

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

  if (filePaths.length > 0 && !text) {
    text = '';
  } else if (filePaths.length > 0) {
    // File-apply note stays off chat — workspace explorer updates instead.
  }

  if (!text) {
    if (hadMasterPlan) {
      text = '';
    } else {
      text = '';
    }
  }

  return { displayText: text, filePaths, hadMasterPlan, hadCodingTag };
}

/** Extra rules appended for IDE right-panel chat only. */
export const IDE_CHAT_EXECUTION_APPENDIX = `
IDE CHAT SURFACE (project-execution-rules.md — strict):
- **Two modes:** CONVERSATION_MODE (default) vs BUILD_MODE (user asks to build, fix, implement, scaffold, or presses Go).
- **CONVERSATION_MODE:** Short natural prose only. No \`\`\`typescript\`, \`\`\`python\`, JSX, SQL, or multi-line code in chat. No Master Plan section text in chat.
- **BUILD_MODE:** Master Plan only inside \`<START_MASTERPLAN>…</END_MASTERPLAN>\` (server persists to master-plan.json). Implementation only as \`\`\`file:relative/path\` … \`\`\` and/or \`START_CODING\` — server writes files under workspaceRoot. Never dump code in conversational prose in the same turn.
- If unsure which mode: stay in CONVERSATION_MODE and ask one clarifying question, or tell the user to press **Go** for build mode.
${masterPlanSectionSeparationRules()}
`.trim();

export function buildModeSystemAppendix(): string {
  return `
BUILD_MODE is active for this turn. Do not explain code in chat — emit file artifacts. Required when implementing:
1) Optional \`<START_MASTERPLAN>…</END_MASTERPLAN>\` if the plan changed — use all five section headers (see MASTER PLAN SECTION SEPARATION).
2) \`START_CODING\` on its own line when ready.
3) One or more \`\`\`file:relative/path\` … \`\`\` blocks (paths under src/, app/, pages/, components/, public/).
`.trim();
}

// Re-export for callers that need tab key by index
export { masterPlanKeyForTabIndex };
