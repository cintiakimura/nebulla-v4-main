import { extractMasterPlanInner, sourceHasMasterPlanBlock } from '../../lib/masterPlanTags';
import { sanitizeAssistantChatText } from '../../lib/assistantChatSanitize';
import {
  MASTER_PLAN_SECTION_KEYS,
  masterPlanKeyForTabIndex,
  parseMasterPlanBlock,
  masterPlanSectionSeparationRules,
} from './masterPlanSections';
import { fetchJson } from './apiFetch';
import { withProjectBody, withProjectQuery, getBrowserProjectName } from './nebulaProjectApi';
import { buildLanguagePromptAppendix } from './i18n/languagePromptAppendix';
import type { IdeLocaleCode } from './i18n/locales';
import type { ContentLanguageMode } from './i18n/userLanguagePreferences';
import { seedGoalOfTheAppSection } from './spineSequenceGates';
import { matchBugDatabaseSnippets } from './bugDatabaseSnippet';

export const MASTER_PLAN_TAB_NAMES = [...MASTER_PLAN_SECTION_KEYS] as const;

/** UTF-8 → base64 so Cloudflare WAF is less likely to 403 JSX/HTML file bodies. */
export function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/** JSON body for POST /api/files/apply-generated (base64 preferred; plaintext fallback). */
export function buildApplyGeneratedPayload(content: string): { contentBase64: string } | { content: string } {
  try {
    return { contentBase64: utf8ToBase64(content) };
  } catch {
    return { content };
  }
}

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
  const hasBrief = uniq.some((p) => /ui-brief\.md$/i.test(p));
  if (hasBrief) {
    parts.push('UI brief saved — ready for UI Gen Beta / Studio.');
  } else if (hasV0) {
    parts.push('v0 prompt saved (optional legacy path).');
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

/** Skip-chat / phase tokens must never be written into Master Plan tabs. */
export function isOrchestrationOnlyPlanSource(source: string): boolean {
  const t = String(source || '').trim();
  if (!t) return true;
  if (/^(PLAN_READY|START_CODING|ARCHITECTURE)$/i.test(t)) return true;
  if (/<START_MASTERPLAN>/i.test(t)) return false;
  if (/###?\s*\d\.\s*(Goal of the app|Tech and Research|Features and KPIs)/i.test(t)) return false;
  if (t.length < 400 && /\b(PLAN_READY|START_CODING)\b/i.test(t)) return true;
  if (
    t.length < 400 &&
    /Master Plan already on disk|continuing research before coding|Grok chat timed out/i.test(t)
  ) {
    return true;
  }
  return false;
}

export async function persistMasterPlanFromAssistantSource(
  source: string,
  onProgress?: (message: string) => void,
): Promise<number> {
  if (isOrchestrationOnlyPlanSource(source)) return 0;
  const inner = extractMasterPlanInner(source);
  let parsed = inner ? parseMasterPlanBlock(inner) : {};
  if (Object.keys(parsed).length === 0) {
    parsed = parseMasterPlanBlock(source);
  }
  if (Object.keys(parsed).length === 0) return 0;
  const goalBody = (parsed[1] ?? '').trim();
  if (/\bSTART_CODING\b/i.test(goalBody) || /\bPLAN_READY\b/i.test(goalBody)) {
    parsed[1] = '';
  }
  if (!(parsed[1] ?? '').trim()) {
    const planLike: Record<string, string> = {};
    for (let i = 1; i <= MASTER_PLAN_SECTION_KEYS.length; i++) {
      const key = MASTER_PLAN_SECTION_KEYS[i - 1];
      const body = (parsed[i] ?? '').trim();
      if (body) planLike[key] = body;
    }
    const seeded = seedGoalOfTheAppSection(planLike, [getBrowserProjectName()]);
    if (seeded) parsed[1] = seeded;
  }
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

  const uniqPaths = [...new Set(filePaths.map((p) => p.trim()).filter(Boolean))];

  const artifactFallback =
    buildIdeChatFallbackSummary(uniqPaths, hadMasterPlan) ||
    (looksLikeResidualDump(normalized) || /var\(--|\.btn-|border-radius\s*:/i.test(normalized)
      ? "I’ve updated the project quietly. Ask me anything in plain language — Master Plan and code stay in their tabs."
      : '');

  text = sanitizeAssistantChatText(text, {
    hadMasterPlan,
    filePaths: uniqPaths,
    fallback: artifactFallback,
  });

  if (!text && (uniqPaths.length > 0 || hadMasterPlan)) {
    text = buildIdeChatFallbackSummary(uniqPaths, hadMasterPlan);
  } else if (uniqPaths.some((p) => /v0-prompt\.md$/i.test(p))) {
    // Drop any leftover v0 brief prose Grok pasted outside file blocks.
    text = text
      .replace(/(?:^|\n).*v0-prompt\.md.*(?:\n|$)/gi, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (!text || looksLikeResidualDump(text)) {
      text = buildIdeChatFallbackSummary(uniqPaths, hadMasterPlan);
    }
  }

  return { displayText: text, filePaths: uniqPaths, hadMasterPlan, hadCodingTag };
}

function looksLikeResidualDump(text: string): boolean {
  return (
    text.length > 500 &&
    (/var\(--|border-radius\s*:|\.btn-|1\.\s*Goal of the app/i.test(text) ||
      (text.match(/\{/g) || []).length >= 3)
  );
}

/** Extra rules appended for IDE right-panel chat only. */
export const IDE_CHAT_EXECUTION_APPENDIX = `
IDE CHAT SURFACE (project-execution-rules.md + inference-first-rules.md — strict):
- **DEFAULT PATH:** clear goal → nebula-project/inference-first-rules.md (Categorize → Research → Draft → Build). Do not interrogate by default.
- **COMPREHENSION FIRST:** Rank-1 user goal/uploads/URLs; Rank-2 competitor-research.md. Extract dense briefs (roles, flows, privacy, tone, gamification, study links) — do not re-ask filled slots. At most one blocking clarification. User-cited sources first in research; competitors must not override user privacy/tone/roles. Gate R still required before Foundation Go.
- **GUIDED INTERVIEW:** only when user asks to brainstorm / be interviewed / full architecture interview.
- **USER TONE:** nebulla-project/user-communication-rules.md — friendly, short, no raw errors/jargon unless asked; silent fixes; clear next step.
- **MODE FIRST (Guided / Free / Coding / File):** Follow nebulla-project/chat-mode-detection.md on every turn.
  - Guided = new project / Master Plan interview (one question at a time).
  - Free = default Q&A — never force Master Plan.
  - Coding = checklist + \`\`\`file:\`\`\` / Go only.
  - File = local path or GitHub URL; product may open via /api/files/open(+-github) with rich preview — do not interrupt Master Plan / Go Code / v0.
- **GUARDIAN DOCS:** nebulla-project/code-review-checklist.md (before coding); nebulla-project/full-bug-database.md + nebulla-project/debugging-method.md (on errors); nebulla-project/user-communication-rules.md (tone).
- **Two surface modes:** CONVERSATION_MODE (default) vs BUILD_MODE (build/fix/implement/Go).
- **CONVERSATION_MODE:** Short natural prose only. **NEVER** output \`\`\`typescript\`, \`\`\`jsx\`, \`\`\`python\`, SQL, or any multi-line code in chat — the only valid code format is \`\`\`file:relative/path\` … \`\`\`. If the user asks you to show/write code, emit \`START_CODING\` (Agent) or ask them to switch to **Agent** (Chat). Never say “press Go” — there is no Go button.
- **BUILD_MODE (UNCHANGED CORE — Master Plan + Go Code):** Master Plan only inside \`<START_MASTERPLAN>…</END_MASTERPLAN>\` (server persists to master-plan.json). Implementation only as \`\`\`file:relative/path\` … \`\`\` and/or \`START_CODING\` — server writes files under workspaceRoot. Never dump code in conversational prose in the same turn. Architecture-first: code-review-checklist.md, smallest safe change, no hallucinated APIs/paths. When the user confirms Discovery is done (nothing more to add), emit \`START_CODING\`.
- **UI brief (critical):** After Master Plan, write \`nebula-ui-studio/ui-brief.md\` as a \`\`\`file:…\`\`\` block (§4 page contracts + §5 tokens — primary UI Gen v2 input). **Never paste the brief body in chat**. Optional legacy: concise \`v0-prompt.md\` (800–1200 chars) only if V0 path is used. One short chat line is enough (e.g. "Master Plan saved — writing UI brief.").
- **Never use** \`"""\`file:\` or triple-quote fences — use standard \`\`\`file:path\` only.
- If unsure which mode: stay in CONVERSATION_MODE / Free Chat and ask one clarifying question, or emit \`START_CODING\` when they are ready to build.
${masterPlanSectionSeparationRules()}
`.trim();

export function buildModeSystemAppendix(): string {
  return `
BUILD_MODE is active for this turn. Do not explain code in chat — emit file artifacts. Required when implementing:
1) Optional \`<START_MASTERPLAN>…</END_MASTERPLAN>\` if the plan changed — use all five section headers (see MASTER PLAN SECTION SEPARATION). Include security baseline in §2 when auth/data applies.
2) \`\`\`file:nebula-ui-studio/ui-brief.md\` … \`\`\` — full §4 page contracts + §5 tokens (primary UI input).
3) \`START_CODING\` on its own line when ready.
4) One or more \`\`\`file:relative/path\` … \`\`\` blocks for the **current slice only** (Build → Debug → Next). Prefer foundation/auth/core feature slices over the entire §4 route map in one turn.
5) Optional legacy only: \`\`\`file:nebula-ui-studio/v0-prompt.md\` … \`\`\` — concise distill (800–1200 chars) if V0 is configured. Prefer ui-brief for Beta UI Gen.
6) Do not treat UI Studio mockup / preview-model as the spec — implement from Master Plan; mockup may be wrong or partial; plan wins on conflict.
`.trim();
}

/** Compact NDM reminder injected when Smart Chat detects debugging mode. */
export const NDM_DEBUG_APPENDIX = `
ACTIVE MODE: DEBUGGING — Nebula Debugging Method (NDM) is mandatory this turn:
1) Verify — use [APP_STATUS_DEBUG] when present (do not ask what error they see); else expected vs actual + exact symptom.
2) Analyze — imports/paths, null/undefined, env, API mismatches, async, deps (check full-bug-database.md / BUG_DATABASE_HINTS). List 2–5 causes; pick one root cause.
3) Trace — follow call stack / data flow; use code-review-checklist.md mentally. Explain briefly before coding.
4) Fix — smallest safe change only via \`\`\`file:relative/path\` … \`\`\` (no large refactors; no casual \`\`\`typescript fences).
5) Validate — tell them to reload Preview; App Status should go green if fingerprints do not reappear. Note remaining risks in one short sentence.
Output contract: 1–3 sentences (Verify→Analyze→Trace) → file: Fix blocks → one Validate line (reload Preview / App Status).
Chat language = CONTENT_LOCALE (device prefs + Grok detection). Do not jump to a fix before Verify → Analyze → Trace.
`.trim();

/** Compact coding quality reminder when Smart Chat detects coding mode. */
export const CODING_QUALITY_APPENDIX = `
ACTIVE MODE: CODING — Architecture-first + Incremental Development (Build → Debug → Next):
1) Mentally scan nebulla-project/code-review-checklist.md before every file block.
2) Follow Master Plan §1–§5 + Project Type; do not invent contradicting routes/features.
3) Implement **one slice only** this turn (foundation → auth → data/API → primary feature → secondary → polish). Do not dump the whole app.
4) Smallest safe change; no drive-by refactors; no temporary hacks.
5) No hallucinated APIs/packages/env/paths — create them explicitly if needed in the same response.
6) After the slice: remind to Validate (NDM happy path) before the next Go / slice.
7) Output only START_CODING and/or \`\`\`file:relative/path\` … \`\`\` — never casual code fences in chat.
8) Do not treat UI Studio mockup / preview-model as the spec. Implement screens and features from Master Plan sections and agreed architecture. Mockup is a temporary preview and may be wrong or partial. If mockup and plan disagree, plan wins.
9) Render-only stack: MVP auth = mock/local role gates on Render. RLS = in-app authorization rules — never a hosted BaaS client or SUPABASE_* env.
10) When emitting app/ src/ pages/ components/ product UI: leave a **runnable workspace root** — package.json with scripts.dev/build/start, framework entry (Next: app/layout + app/page + real product routes under app/ or pages/). Vite-only src/App.tsx + src/main.tsx is not done for a multi-page plan. Orphan pages without package.json are not done.
11) Working app output: primary CTAs (role switch, start session, upload) must work with mock/local state in this slice, or be disabled with a short "next slice" reason — no silent dead buttons.
`.trim();

/** Compact Chat personality — UNBREAKABLE when interactionMode is chat. Authority: chat-personality.md */
export const CHAT_PERSONALITY_APPENDIX = `
CHAT_PERSONALITY (UNBREAKABLE — Chat mode only; see nebulla-project/chat-personality.md):
- Role: proactive product/creative partner for apps, landing pages, marketing sites, websites, tools — never assume "app" only.
- Brainstorming: proactive (1–2 angles), concrete suggestions, challenge weak ideas once/turn with a reason, research when valuable.
- Research shape: 2–4 sentence "what's valuable" summary → keep/drop/decide bullets → one next step. Never invent studies; say so if none. No essay dumps (BYOK + voice).
- Turn shape: reflect → insight/suggest/challenge → optional mini-research → one question (Discovery) or one next step.
- Voice: speakable, short; never auto-apply code.
- Boundaries: no START_CODING, no \`\`\`file: blocks, no "press Go" as primary CTA — invite Switch to Agent to build.
- Opening spirit: warm greeting ("What's up? What would you like to create today?") — never open with app-only interrogation ("What should your app do?").
`.trim();

/**
 * Turn Smart Chat Handler hints into a short system appendix so mode detection
 * actually reaches the model (previously codingHint was unused).
 */
export function chatModeSystemAppendix(options: {
  mode?: string;
  codingHint?: string;
  discoveryRequired?: boolean;
  /** User-locked Chat vs Agent (orthogonal to detector mode). */
  interactionMode?: 'chat' | 'agent';
  /** Message includes [APP_STATUS_DEBUG] from preview runtime health. */
  hasAppStatusPayload?: boolean;
  /** Technical lines from App Status for bug-db pattern hints. */
  appStatusTechnicalMessages?: string[];
  /** IDE chrome locale (static catalogs). */
  ideLocale?: IdeLocaleCode;
  /** User-visible chat / Master Plan / UI copy locale. */
  contentLocale?: IdeLocaleCode;
  contentMode?: ContentLanguageMode;
}): string {
  const mode = (options.mode || '').trim();
  const hint = (options.codingHint || '').trim();
  const discoveryRequired = Boolean(options.discoveryRequired);
  const interactionMode = options.interactionMode === 'chat' ? 'chat' : 'agent';
  const hasAppStatusPayload = Boolean(options.hasAppStatusPayload);
  const parts: string[] = [];

  const ideLocale = options.ideLocale || 'en';
  const contentLocale = options.contentLocale || ideLocale;
  const contentMode = options.contentMode === 'match_ide' ? 'match_ide' : 'mirror';
  parts.push(
    buildLanguagePromptAppendix({ ideLocale, contentLocale, contentMode }),
  );

  if (interactionMode === 'chat') {
    parts.push(
      [
        'USER_INTERACTION_MODE: chat (brainstorm & plan — LOCKED)',
        '- Collaborate, discover, and plan. Prefer short conversational replies (BYOK-friendly).',
        '- Do NOT emit START_CODING, ```file: blocks, or ask the user to press Go.',
        '- Do NOT dump implementation code. Architecture discussion OK; Master Plan only inside <START_MASTERPLAN> tags when appropriate.',
        '- If the user clearly wants to build/edit code / debug apply / generate UI files: tell them to switch to Agent mode — do not implement.',
        '- Voice/Open talk: keep replies speakable; one clear question when discovering.',
      ].join('\n'),
    );
    parts.push(CHAT_PERSONALITY_APPENDIX);
  } else {
    parts.push(
      [
        'USER_INTERACTION_MODE: agent (coding — LOCKED)',
        '- Implement the next coherent slice when appropriate; use START_CODING and/or ```file:relative/path``` blocks.',
        '- Still respect Discovery / Master Plan gates when the plan is incomplete.',
        '- Prefer smallest safe change; activity footer may show coding progress.',
        '- Do NOT use Chat brainstorming personality — stay execution-focused and concise.',
      ].join('\n'),
    );
  }

  if (hasAppStatusPayload) {
    parts.push(
      [
        'APP_STATUS_RUNTIME (Verify evidence present):',
        '- The user message includes [APP_STATUS_DEBUG] from Nebulla App Status (preview runtime).',
        '- NDM Step 1 Verify MUST use that payload (friendly + technical). Do NOT ask “what error do you see?”',
        '- Do NOT ask for console screenshots, DevTools, or stack dumps when [APP_STATUS_DEBUG] is present.',
        '- Ask only if expected behavior is still unclear.',
        '- Follow Verify → Analyze → Trace → Fix → Validate. Runtime fix = ONE slice — never dump full §4.',
        '- Prefer ≤6 ```file:``` blocks for the smallest safe fix.',
        '- After Fix: tell the user to reload Preview; App Status should go green when the bug is gone.',
        '- Chat-facing copy stays beginner-friendly (user-communication-rules.md); never dump raw stacks in chat unless they expand Technical details themselves.',
        interactionMode === 'chat'
          ? '- Chat lock: discuss the issue only; tell them to use Fix with Agent / switch to Agent to apply a fix.'
          : '- Agent: apply the smallest safe fix via ```file:``` blocks after short Verify→Analyze→Trace.',
      ].join('\n'),
    );
    if (interactionMode === 'agent') {
      parts.push(NDM_DEBUG_APPENDIX);
    }
    const techMsgs = options.appStatusTechnicalMessages || [];
    if (techMsgs.length > 0) {
      const hints = matchBugDatabaseSnippets(techMsgs);
      if (hints) parts.push(hints);
    }
  }

  if (mode) {
    parts.push(`DETECTED_CHAT_MODE: ${mode}${discoveryRequired ? ' (Master Plan incomplete — Discovery still required before full build)' : ''}`);
  }

  if (!hasAppStatusPayload && (mode === 'debugging' || /NDM:/i.test(hint))) {
    if (interactionMode === 'agent') {
      parts.push(NDM_DEBUG_APPENDIX);
    } else {
      parts.push(
        'ACTIVE MODE: DEBUG DISCUSSION (Chat lock) — Talk through Verify → Analyze → Trace. Do not emit file fixes; ask user to switch to Agent to apply.',
      );
    }
  } else if (hint === 'discovery-complete-start-coding') {
    parts.push(
      [
        'ACTIVE MODE: DISCOVERY COMPLETE — START BUILD (highest priority this turn)',
        '- The user confirmed there is nothing more to add (final Discovery check).',
        '- Do NOT ask any more questions. Do NOT restart Discovery. Do NOT brainstorm.',
        '- Output ONLY: a complete <START_MASTERPLAN>…</END_MASTERPLAN> with all five sections, then START_CODING and <START_CODING> on their own lines.',
        '- No visible chat prose, goodbye, or recap outside the Master Plan tags.',
      ].join('\n'),
    );
  } else if (hint === 'fast-prototype') {
    parts.push(
      [
        'ACTIVE MODE: FAST PROTOTYPE (inference-first — additive; Guided interview OFF)',
        '- Law: nebula-project/inference-first-rules.md for quality (no invented competitors; labeled assumptions). Guided interview OFF.',
        '- THIS TURN = PLAN ONLY. Do not emit START_CODING, <START_CODING>, or app ```file:``` blocks. Do not invent competitor-research.md.',
        '- COMPREHENSION FIRST: extract the user brief (roles, privacy, tone, links) into the Master Plan this turn. Always fill §1 Goal. Do NOT ask the main-goal interview when the brief already states it.',
        '- HARD OUTPUT THIS TURN: <START_MASTERPLAN>…</END_MASTERPLAN> with all five sections (real §1). A short chat-only reply is a failure.',
        '- Required files this turn: nebula-project/fast-prototype-memory.md, category-classification.md, industry-standards.md (assumptions), Master Plan.',
        '- AFTER this reply the product runs one heavy job at a time: Web Search (Gate R) → merge plan + ui-brief → UI Gen v2 mockup → Foundation Go. Do not skip research.',
        '- Never invent competitors, studies, or statistics. Prefer labeled assumptions over asking questions.',
        '- Anti-amnesia: read working files before acting; do not restart Step 3.1 if a valid draft exists.',
        '- Chat: ≤4 short lines (assumptions). All substance in Master Plan tags + nebula-project/ file blocks.',
      ].join('\n'),
    );
  } else if (
    discoveryRequired &&
    (hint === 'guided-onboarding' || hint === 'discovery-required' || hint === 'discovery-required-after-file')
  ) {
    parts.push(
      'ACTIVE MODE: DISCOVERY — Ask exactly one clear question. Follow INITIAL ONBOARDING order (goal → Project Type unless My Projects already set it → remaining info → Research Pillars → closing questions). Do not emit START_CODING until the final-check reply. Do not run Tab 2–6 interview loops yet.',
    );
  } else if (hint && !hasAppStatusPayload && hint !== 'guided-onboarding' && hint !== 'discovery-required' && hint !== 'discovery-required-after-file') {
    parts.push(`MODE_GUIDANCE: ${hint}`);
  }

  if (mode === 'coding' && !discoveryRequired && interactionMode === 'agent' && !hasAppStatusPayload) {
    parts.push(CODING_QUALITY_APPENDIX);
  }

  if (mode === 'ui' && !discoveryRequired && interactionMode === 'agent') {
    parts.push(
      `ACTIVE MODE: UI GENERATION — Primary: UI Gen v2 from nebula-ui-studio/ui-brief.md + §5 tokens (+ §2 research, §4 routes). Optional legacy v0-prompt.md only if V0 configured. No vague "modern/clean" alone. User-facing UI copy language = CONTENT_LOCALE (${contentLocale}).`,
    );
  }

  if (discoveryRequired && mode === 'free' && hint !== 'discovery-complete-start-coding') {
    parts.push(
      'DISCOVERY STILL REQUIRED — You may answer casually, but if the user asks to build/architecture/UI, switch to one Discovery question immediately. Do not emit START_CODING.',
    );
  }

  return parts.join('\n\n').trim();
}

// Re-export for callers that need tab key by index
export { masterPlanKeyForTabIndex };
