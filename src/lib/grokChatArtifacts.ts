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
import { productNameFromPlan } from '../../lib/productIdentity';
import { isReplacementProductBrief } from '../../lib/productGoalFingerprint';
import { promoteWorkspaceChipFromProductName } from './productIdentityClient';
import { buildLanguagePromptAppendix } from './i18n/languagePromptAppendix';
import type { IdeLocaleCode } from './i18n/locales';
import type { ContentLanguageMode } from './i18n/userLanguagePreferences';
import {
  distillBriefToGoalSection,
  extractProductGoalFromSection,
  isUsableProjectGoal,
  looksLikeRawUserPrompt,
  seedGoalOfTheAppSection,
} from './spineSequenceGates';
import { peekPendingProjectIdea } from './ideHomeEvents';
import { readStoredShellGoal } from './ideShellScreens';
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
  if (/UI generation running|Architecture draft is ready|UI mockup is generated from researched/i.test(t)) {
    return true;
  }
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
  extraGoalFallbacks: string[] = [],
): Promise<number> {
  if (isOrchestrationOnlyPlanSource(source)) return 0;
  const inner = extractMasterPlanInner(source);
  const hasPlanShape =
    Boolean(inner) || sourceHasMasterPlanBlock(source) || /###?\s*\d\.\s*(Goal of the app|Tech and Research|Features and KPIs)/i.test(source);
  if (!hasPlanShape) return 0;
  let parsed = inner ? parseMasterPlanBlock(inner) : {};
  if (Object.keys(parsed).length === 0) {
    parsed = parseMasterPlanBlock(source);
  }
  if (Object.keys(parsed).length === 0) return 0;
  const goalBody = (parsed[1] ?? '').trim();
  const briefHint = extraGoalFallbacks.filter(Boolean).join('\n');
  if (
    /\bSTART_CODING\b/i.test(goalBody) ||
    /\bPLAN_READY\b/i.test(goalBody) ||
    looksLikeRawUserPrompt(goalBody, briefHint) ||
    !isUsableProjectGoal(goalBody)
  ) {
    parsed[1] =
      distillBriefToGoalSection(goalBody || briefHint, briefHint) ||
      extractProductGoalFromSection(goalBody);
  }
  if (
    !isUsableProjectGoal((parsed[1] ?? '').trim()) ||
    looksLikeRawUserPrompt((parsed[1] ?? '').trim(), briefHint)
  ) {
    const planLike: Record<string, string> = {};
    for (let i = 1; i <= MASTER_PLAN_SECTION_KEYS.length; i++) {
      const key = MASTER_PLAN_SECTION_KEYS[i - 1];
      const body = (parsed[i] ?? '').trim();
      if (body) planLike[key] = body;
    }
    const seeded = seedGoalOfTheAppSection(planLike, [
      ...extraGoalFallbacks,
      peekPendingProjectIdea() || '',
      readStoredShellGoal(),
      getBrowserProjectName(),
    ]);
    if (seeded) parsed[1] = seeded;
  }
  onProgress?.('Saving Master Plan tabs…');
  let saved = 0;
  let productNameFromSave = '';
  let existingGoal = '';
  try {
    const existing = await fetchJson<Record<string, string>>(withProjectQuery('/api/master-plan/read'), {
      credentials: 'include',
      cache: 'no-store',
    });
    existingGoal = String(existing?.['1. Goal of the app'] || '');
  } catch {
    existingGoal = '';
  }
  const nextGoal = (parsed[1] ?? '').trim();
  const replaceAll = Boolean(nextGoal) && isReplacementProductBrief(nextGoal, existingGoal);
  if (replaceAll) {
    const sections: Record<number, string> = {};
    for (let i = 1; i <= MASTER_PLAN_SECTION_KEYS.length; i++) {
      sections[i] = (parsed[i] ?? '').trim();
    }
    try {
      const res = await fetchJson<{ productName?: string }>(withProjectQuery('/api/master-plan/replace'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(withProjectBody({ sections })),
      });
      if (typeof res.productName === 'string' && res.productName.trim()) {
        productNameFromSave = res.productName.trim();
      }
      saved = Object.values(sections).filter(Boolean).length || 1;
    } catch (e) {
      console.warn('[grokChatArtifacts] master plan replace failed:', e);
    }
  } else {
  for (let tabIndex = 1; tabIndex <= MASTER_PLAN_SECTION_KEYS.length; tabIndex++) {
    const content = (parsed[tabIndex] ?? '').trim();
    if (!content) continue;
    try {
      const res = await fetchJson<{ productName?: string }>(withProjectQuery('/api/master-plan/update'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(withProjectBody({ tabIndex, content })),
      });
      if (typeof res.productName === 'string' && res.productName.trim()) {
        productNameFromSave = res.productName.trim();
      }
      saved++;
    } catch (e) {
      console.warn('[grokChatArtifacts] master plan tab save failed:', tabIndex, e);
    }
  }
  }
  if (saved > 0) {
    onProgress?.(`Saved ${saved} Master Plan tab(s)`);
    const fromPlan = productNameFromPlan({
      '1. Goal of the app': parsed[1] || '',
      '5. UI/UX design': parsed[5] || '',
    });
    void promoteWorkspaceChipFromProductName(productNameFromSave || fromPlan);
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
- **COMPREHENSION FIRST:** Rank-1 user goal/uploads/URLs; Rank-2 classifier defaults. Extract dense briefs (roles, flows, privacy, tone, study links) — do not re-ask filled slots. At most one blocking clarification. Do not invent named competitors. Competitor Web Search only if the user asked.
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
3) This Go is Foundation+Primary (screens + the interview loop). Do not start a Data+API or Polish slice.
4) Smallest safe change; no drive-by refactors; no temporary hacks.
5) No hallucinated APIs/packages/env/paths — create them explicitly if needed in the same response.
6) After the slice: remind to Validate (NDM happy path) before the next Go / slice.
7) Output only START_CODING and/or \`\`\`file:relative/path\` … \`\`\` — never casual code fences in chat.
8) Do not treat UI Studio mockup / preview-model as the spec. Implement screens and features from Master Plan / job-brief. Mockup is a temporary preview and may be wrong or partial. If mockup and plan disagree, plan wins.
9) Render-only stack: MVP auth = mock/local role gates on Render. RLS = in-app authorization rules — never a hosted BaaS client or SUPABASE_* env. Vendor SDKs (Stripe/Mapbox/Twilio/Firebase) only if the user named them or pasted a key; else honest mock UI.
10) Foundation+Primary in this Go — the interview loop must work in lib/mockStore.ts. No empty Wallet. No Data+API slice. After apply the product asks for keys once.
11) When emitting app/ src/ pages/ components/ product UI: leave a **runnable workspace root** — package.json with scripts.dev/build/start, framework entry (Next: app/layout + app/page + real product routes under app/ or pages/). Vite-only src/App.tsx + src/main.tsx is not done for a multi-page plan. Orphan pages without package.json are not done.
12) Working app output: primary CTAs must work with mock/local state, or be disabled with a short reason — no silent dead buttons.
`.trim();

/** Compact Chat personality — UNBREAKABLE when interactionMode is chat. Authority: chat-personality.md */
export const CHAT_PERSONALITY_APPENDIX = `
CHAT_PERSONALITY (UNBREAKABLE — Chat mode only; see nebulla-project/chat-personality.md):
- Who: senior developer who is also a friend. Warm, direct, honest, curious. Never a tutor, PM, or form.
- Speech: voice-call prose. Short sentences. Their words, not jargon. No bullets, no markdown, no "here's what I'll do next." One spoken idea at a time.
- First reply after a product seed (then STOP): specific compliment (vary phrasing, keep warmth) + "If I understood correctly, this is what the app should do: … Is that right?" + one fork: "I can build what you have in mind right now, or we can shape it together and land on something stronger. Which sounds better?" No extras. No Guided Discovery. Don't narrate searching. No feature catalog. No Foundation. No START_CODING.
- Fast lane (now / just build / go / hellos / full idea): infer the Monday loop silently. 1–2 light clarifiers only if the seed is empty (who + one job). Then lock and build the REAL loop — not a 3-button mock. Say they can push back. If Slot 1 was never confirmed, reflect first.
- Lock lane (brainstorm / shape together): silent scoreboard. Emptiest required slot per turn (Who → Features+inferred workflow → Dependencies). Infer extra pages; don't quiz. Not a catalog. Not "3 ideas + mock later". Not "shall we go?"
- Close (only door into plan + code): goal, who, loop including inferred pages (history/dossier when keep-documents), real dependencies, walls already named. Ask UI once only if they never answered vibe / web vs mobile. Then "If this is right, I'll lock it and build this product." Confirm → Master Plan (§1 = north star) THEN Foundation of THAT product.
- Closers hellos/go/let's go/build it/yes after confirm are coding. First-message "hello" on an empty project is only a greeting. Brainstorm is never Foundation.
- Critical partner (after the goal is confirmed): when they add a feature that could fail in the real world, one short beat with all three — (1) warm specific reaction, vary phrasing, do not drop praise (2) one improvement they did not already say (3) one warning only if there is a real wall (privacy, children, health, payments, liability, off-platform leakage, unverifiable claims, platform-risk). Sensitive health + images: warning + option + a buildable solution. HIPAA only if they said health. No wall → skip the warning. Do not invent risk. Not a legal audit. Not "you can't build this." If they did not ask for that domain, do not lecture. Warnings 2–4 spoken sentences. No contract text. No tool narration. Never only echo. Never only compliment.
- Challenge without "this is a bad idea." Silent research. Never invent sources.
- Never mock the workflow (dossier, review, save, extract) if it serves the north star. Mock a vendor only when user-choice or it truly cannot run.
- Boundaries: no <START_MASTERPLAN>, no START_CODING, no \`\`\`file: blocks on compliment / brainstorm / Slot 2–4 turns. No Foundation on the compliment turn. No EDIT because leftover preview HTML exists. No auto-Go on "do we need an API?" / "what about privacy?"
- A new product name (Taskwise) is a new project. Never ask them to return to Quill Path, City Courier, or any previous chip unless they asked.
- Empty chat: "What's up? What would you like to create today?" — never "What should your app do?"
`.trim();

/** How Chat reasons — UNBREAKABLE. Authority: chat-thinking-rules.md */
export const CHAT_THINKING_APPENDIX = `
CHAT_THINKING (UNBREAKABLE — Chat brainstorm only; see nebulla-project/chat-thinking-rules.md):
- Evidence, never memory. Check features/APIs/vendors/claims before speaking. If you cannot verify, say so. Never invent a source, price, capability, or company.
- Research is silent. Never say "let me search" or narrate tools. Name / Slot 4 / API turns may run web search — speak the finding (1–2 sentences). If lookup fails, say that once. Never "I never look outside the app."
- Four layers in order — do not jump: (1) north star / why it exists (2) features that serve that sentence — workflow is included; infer pages (3) dependencies — tech, data location, accounts; we-build vs default vs user-choice (4) UI/cosmetics last. Inspiration is not a clone. Ask UI once at summary if empty.
- After features: merge same job; infer history/dossier when the goal is keep/find work later; raise one north-star miss at a time; name a dependency before treating the feature as decided.
- First seed: specific compliment + "If I understood correctly, this is what the app should do: [their words]. Is that right?" + "I can build what you have in mind right now, or we can shape it together and land on something stronger. Which sounds better?" Stop. Again only if audience/constraint/core feature changes. Never Guided Discovery after a product seed.
- After north star confirmed + they add a feature: critical-partner triad (praise + one new improvement + optional real wall). Sensitive health + images: warning + option + a buildable solution. HIPAA only if they said health. Do not invent risk. Do not lecture an unopened domain. Not an audit.
- Lock lane: silent scoreboard, then emptiest slot Who → Features+inferred workflow → Dependencies. One beat. Stay on their product. Never default to "v1 / phase 2 / good enough for now / we can add that later / shall we go?"
- Scoreboard (silent): Slot 1 north star confirmed in their words — not a category. Slot 2 named roles on both sides of the loop. Slot 3 small serving set including inferred workflow. Slot 4 classified we-build / default / user-chooses — keys are not a slot. UI does not block mid-talk; ask once at close if empty.
- Long typed brief = opening line of the talk, not a spec. Reflect the north star. Do not draft a plan.
- Payments mentioned → one concrete option (and a link if useful), no search talk. Two overlapping features → propose merge, tied to the goal.
- No <START_MASTERPLAN>, file blocks, or START_CODING in this layer. No Foundation on compliment. No START_CODING while they answer Slot 2–4.
`.trim();

/** Turn shape — UNBREAKABLE. Authority: chat-conversation-loop.md */
export const CHAT_LOOP_APPENDIX = `
CHAT_LOOP (UNBREAKABLE — every brainstorm turn; see nebulla-project/chat-conversation-loop.md):
- First seed reply: specific compliment + "If I understood correctly, this is what the app should do: … Is that right?" + "I can build what you have in mind right now, or we can shape it together and land on something stronger. Which sounds better?" Then wait. No extras. No Guided Discovery. No plan tags. THIS TURN FORBIDDEN: START_CODING on compliment / brainstorm.
- Fast lane (now / go / hellos / just build / full idea): infer the Monday loop silently. 1–2 clarifiers only if the seed is empty (who + one job). Then lock the REAL loop — not a 3-button mock. Say they can push back. If Slot 1 was never confirmed, reflect first.
- Lock lane: silent scoreboard, then emptiest slot Who → Features+inferred workflow → Dependencies. One beat. Stay on their product. Forbidden default: "3 ideas + mock later + shall we go?"
- Later: one idea or one gap — except after the goal is confirmed, a new real-world feature gets the critical-partner triad (reaction + one new improvement + warning only if a real wall; health+images = warning + option + buildable solution). If they ramble, stay on their thread.
- Typed, voice, landing Build — same loop. Do not reset when they switch mic ↔ keyboard.
- Close: goal, who, loop including inferred storage/workflow pages (history/dossier when keep-documents), real dependencies, walls. Ask UI once if empty. Then "If this is right, I'll lock it and build this product."
- Closers after confirm start the build. First empty-project "hello" is a greeting. Brainstorm is never Foundation. Coding ONLY after close or explicit go/hellos/just build. No auto-Go on "do we need an API?" / "what about privacy?"
- Remember silently: confirmed north star, accepted/rejected/merged features, inferred workflow pages, small open set, classified dependencies. Never re-ask a fact they already gave.
`.trim();

/** Internal scoreboard — UNBREAKABLE. Authority: chat-information-checklist.md */
export const CHAT_SCOREBOARD_APPENDIX = `
CHAT_SCOREBOARD (UNBREAKABLE — silent; see nebulla-project/chat-information-checklist.md):
- After every user turn, update four required slots + UI filter. Never show the list. Never recite it.
- Slot 1 North star: one why-sentence in their words, confirmed. Empty = category or feature pile. Prefer Slot 1 until confirmed.
- Slot 2 Who: named people on both sides of the core loop — not "users."
- Slot 3 Features: small set that makes Slot 1 true. WORKFLOW IS PART OF SLOT 3. Infer extra pages from logic. If the goal is keep/find documents later, include history and/or per-client dossier in the lock and name it in the summary. Ask about pages ONLY when two workflows are both plausible. Never mock the workflow if it serves the star.
- Slot 4 Dependencies: classify each core feature (we build / obvious default / user must choose). Includes tech (Tesseract vs cloud OCR), data location, accounts. Sensitivity: one beat — warning + option + a buildable solution. HIPAA only if they said health. Filled when classified — not when they paste a key.
- UI filter: does not block mid-talk. AT SUMMARY: if they never answered vibe / web vs mobile / density, ASK ONCE (missing Master Plan §5).
- Next spoken beat: emptiest required slot in order 2 → 3 (inferred workflow) → 4 after Slot 1. One advance. Not a four-slot form. Not "3 ideas + mock OCR later."
- Not slots: competitors, KPIs, security audit, exact stack.
- Not enough: Slot 1 unconfirmed, or Slot 3 has no core loop (or missing inferred keep/find pages), or Slot 4 has an unclassified must-have.
- Approaching enough: 1–3 solid (workflow inferred) and 4 classified. Then OFFER the close (summary + wait). Do not emit <START_MASTERPLAN> until they confirm that summary.
`.trim();

/** Spoken close + confirm gate. Plan tags only after the user locks the summary. */
export const CHAT_CLOSE_APPENDIX = `
CHAT_CLOSE (UNBREAKABLE until confirm; see chat-information-checklist.md § Close):
- Offer the close when they stop adding info or say that's enough — and Slots 1–4 are fillable without guessing. Three feature bullets are not enough.
- Pattern: "I think we've got what we need. Here's what I heard — tell me if this is right." Then one short summary: Goal · Who · Features including inferred workflow/pages (where files live, how extract runs, history/dossier when the goal is keep documents) · Dependencies as real choices, not "later" · Walls you already named · UI — if empty, ASK ONCE (vibe / web vs mobile / density).
- End with: "If this is right, I'll lock it and build this product."
- Forbidden in the summary: competitors, hex lists, security lecture, tool talk, code, file fences, <START_MASTERPLAN>, "mock OCR later", "phase 2."
- Then WAIT. "I'm done" / "just build" once → still summarize and ask "this is what I'll lock — ok?" Do not end on "shall we go?"
- Confirm (yes / that's it / go / looks good / faz isso) after a summary → Master Plan from this summary (§1 = north star) THEN Foundation of THAT product. You do not emit tags on a brainstorm turn. Do not Foundation on the compliment turn.
- "No" / "that's everything" / "that's the heart" / "nothing else" = CLOSE. Do not ask "what else?" Summarize the locked loop once. Ask only empty required slots (name, who). Then wait for go. Do not Code pass 1 on this turn if files already failed. Do not claim Live.
- Correct / add more → no plan. Update slots. Reflect or one advance or a revised mini-summary.
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
        'USER_INTERACTION_MODE: chat (thinking stage — LOCKED)',
        '- Collaborator personality only. Reflect, confirm, one idea at a time. No spoken research or tool talk.',
        '- Do NOT emit <START_MASTERPLAN>, START_CODING, ```file: blocks, or any files on compliment / research / feature / name turns. First seed: specific compliment + is that right + "I can build what you have in mind right now, or we can shape it together…" Then wait. No Guided Discovery.',
        '- Do NOT dump implementation code. If they want files built: invite Switch to Agent.',
        '- Voice/Open talk: speakable sentences; one question.',
      ].join('\n'),
    );
    parts.push(CHAT_PERSONALITY_APPENDIX);
    parts.push(CHAT_THINKING_APPENDIX);
    parts.push(CHAT_LOOP_APPENDIX);
    parts.push(CHAT_SCOREBOARD_APPENDIX);
    parts.push(CHAT_CLOSE_APPENDIX);
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
  } else if (hint === 'brainstorm-close-confirmed') {
    parts.push(
      [
        'ACTIVE MODE: BRAINSTORM CLOSE CONFIRMED — PLAN FROM SUMMARY (highest priority this turn)',
        '- CONFIRMED_SUMMARY in the user message is the source of truth. Do not restart inference from the seed.',
        '- §1 Goal = the north star sentence from that summary, not a category, not the raw prompt. §1 is one name.',
        '- §4 pages come from THIS goal only (Bills / Month / Receipts / Totals when the goal is bills). Never leftover Dossiers/Forms.',
        '- Features must match the confirmed set. Do not restore cut features. Competitors = none unless they asked.',
        '- THIS TURN = PLAN ONLY: nebula-project/job-brief.md then <START_MASTERPLAN>…</END_MASTERPLAN>.',
        '- Do NOT emit START_CODING, <START_CODING>, or app file blocks this turn. Do not claim Live. Do not ask what else.',
      ].join('\n'),
    );
  } else if (hint === 'brainstorm-enough-close') {
    parts.push(
      [
        'ACTIVE MODE: BRAINSTORM ENOUGH — CLOSE THE LOOP (highest priority this turn)',
        '- They said No / that\'s everything / that\'s the heart. The feature loop is closed.',
        '- Do NOT ask "what else?" Do not reopen Slot 3. Do not invent extra features.',
        '- Summarize the locked loop once. Ask only empty required slots (name, who). Then wait for go.',
        '- THIS TURN FORBIDDEN: <START_MASTERPLAN>, START_CODING, <START_CODING>, ```file:``` blocks, job-brief.md, Live is ready.',
        '- Do not Code pass 1 if files already failed. Do not claim Live.',
      ].join('\n'),
    );
  } else if (hint === 'brainstorm-skip-lock') {
    parts.push(
      [
        'ACTIVE MODE: BRAINSTORM SKIP — LOCK QUESTION (not a plan job)',
        '- They asked to skip / just build. Give the five-beat summary now.',
        '- End with: this is what I will lock — ok?',
        '- THIS TURN FORBIDDEN: <START_MASTERPLAN>, START_CODING, ```file:``` blocks, job-brief.md.',
      ].join('\n'),
    );
  } else if (hint === 'fast-prototype' || hint === 'brainstorm-loop') {
    parts.push(
      [
        'ACTIVE MODE: BRAINSTORM LOOP (first and subsequent thinking turns — not a plan job)',
        '- Law: nebulla-project/chat-conversation-loop.md + chat-information-checklist.md.',
        '- First seed: specific compliment + Is that right? + "I can build what you have in mind right now, or we can shape it together and land on something stronger. Which sounds better?" Then wait.',
        '- Silent scoreboard: prefer Slot 1 until confirmed; then emptiest slot Who → Features+inferred workflow → Dependencies. Never show the list.',
        '- THIS TURN FORBIDDEN: <START_MASTERPLAN>, START_CODING, <START_CODING>, ```file:``` blocks, job-brief.md, engineer interview.',
        '- A short conversational reply that confirms the goal (or one advance after confirm) is success. A Master Plan is failure.',
        '- Guided Discovery OFF after a product seed. Do not ask what kind of project / paste design or none / one core feature. Engineer interview OFF.',
        '- Fast lane (go / hellos / just build): infer the Monday loop; lock the real product — not a 3-button mock. Say they can push back. Brainstorm is never Foundation.',
      ].join('\n'),
    );
  } else if (
    discoveryRequired &&
    (hint === 'guided-onboarding' || hint === 'discovery-required' || hint === 'discovery-required-after-file')
  ) {
    parts.push(
      [
        'ACTIVE MODE: CONVERSATION LOOP (not Guided Discovery).',
        '- After a product seed do NOT ask what kind of project, paste design or none, or one core feature.',
        '- First reply: specific compliment + Is that right? + "I can build what you have in mind right now, or we can shape it together and land on something stronger. Which sounds better?"',
        '- Engineer interview OFF. Guided questionnaire OFF unless they explicitly asked to be interviewed AND there is no product seed.',
        '- Do not emit START_CODING until close confirm or explicit go / hellos / just build.',
      ].join('\n'),
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
