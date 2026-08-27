import type { ConversationLogEntryDTO } from './conversationLogClient';
import type { NebulaProjectType } from './ideHomeEvents';
import { sanitizeAssistantChatText } from '../../lib/assistantChatSanitize';
import { extractGoalFromUserNote } from '../../lib/spineSequenceClient';

/** Hidden user turn — Grok replies with the first onboarding question only (project-execution-rules §4). */
export const IDE_CHAT_DISCOVERY_BOOTSTRAP =
  "I'm ready. Follow project-execution-rules.md INITIAL ONBOARDING: ask only your first single discovery question about what I'm creating (app, landing page, site, or other — exact wording from the rules, one question in your reply).";

/**
 * Legacy / chat "Create a new project: …" path.
 * Prefer buildIdeaDiscoveryBootstrap for New Project → Start with a prompt.
 */
export const IDE_CHAT_FAST_PROJECT_BOOTSTRAP =
  "FAST PROJECT MODE. The user gave a short description for a new project (app, site, or landing). Follow project-execution-rules.md Discovery. First reply MUST: (1) a short \"Here's what I understood\" summary in bullets — only what the prompt clearly implies; note gaps if vague. (2) then ask exactly ONE missing required discovery question (include Project Type if unknown). Do NOT write Master Plan tags, code, or multiple questions. Do NOT rush to <START_MASTERPLAN>.";

const BOOTSTRAP_PREFIX = "I'm ready. Follow project-execution-rules.md INITIAL ONBOARDING:";

/** Prefix for idea-prompt guided start (hidden from chat transcript). */
export const IDEA_DISCOVERY_BOOTSTRAP_PREFIX = 'IDEA PROMPT DISCOVERY.';

/** Prefix for Fast Prototype (inference-first) — hidden from chat transcript. */
export const FAST_PROTOTYPE_BOOTSTRAP_PREFIX = 'FAST PROTOTYPE MODE.';

/** One automatic follow-up when the first Fast Prototype reply omitted Master Plan tags. */
export const FAST_PROTOTYPE_CONTINUE_PREFIX = 'FAST PROTOTYPE CONTINUE.';

export function buildFastPrototypeContinueBootstrap(userGoalOrBootstrap?: string): string {
  const brief = String(userGoalOrBootstrap || "").trim();
  const quoted = (brief.match(/User goal \/ brief:\s*"""([\s\S]*?)"""/i)?.[1] || "").trim();
  const clipped = (
    extractGoalFromUserNote(brief) ||
    quoted.replace(/https?:\/\/\S+/gi, " ").replace(/\s+/g, " ").trim()
  ).slice(0, 4000);
  const goalBlock = clipped
    ? `User goal / brief:\n"""\n${clipped}\n"""\n\n`
    : "";
  return (
    `${FAST_PROTOTYPE_CONTINUE_PREFIX} Your previous reply did NOT include <START_MASTERPLAN> tags. ` +
    `This is a HARD retry — do NOT ask questions; do NOT apologize; do NOT interview.\n` +
    goalBlock +
    `Immediately output in this order:\n` +
    `1) <START_MASTERPLAN>…</END_MASTERPLAN> with ALL five sections (real content; label assumptions).\n` +
    `   §1 goal/users/scope · §2 Project Type + labeled assumption defaults + Security baseline if accounts/kids/private data · ` +
    `§3 features+KPI · §4 pages with /routes + purpose/primary_actions/authz/empty_state/error_state/nav_links · ` +
    `§5 hex tokens (15–25 lines).\n` +
    `2) \`\`\`file:nebula-project/fast-prototype-memory.md\` … \`\`\`\n` +
    `3) \`\`\`file:nebula-project/category-classification.md\` … \`\`\`\n` +
    `4) \`\`\`file:nebula-project/industry-standards.md\` … \`\`\` (assumption defaults only).\n` +
    `Do NOT invent competitor names. Do NOT write a fake competitor-research.md. Do NOT emit START_CODING or app file blocks.\n` +
    `Product runs Web Search next, then ui-brief, then UI mockup, then Foundation Go (one job at a time).\n` +
    `Do NOT skip research. Chat: at most 4 short lines listing assumptions.`
  );
}

/**
 * Bootstrap for guided discovery. When project type was chosen on My Projects,
 * instruct Grok to skip the project-type question and ask only the main goal first.
 */
export function buildDiscoveryBootstrap(projectType?: NebulaProjectType | null): string {
  if (!projectType) {
    return (
      `${BOOTSTRAP_PREFIX} Briefly greet in the spirit of chat-personality.md, then say you'll ask a few required questions to build the Master Plan, ` +
      `then ask only your first single discovery question about what they're creating (not app-only — exact wording from the rules, one question in your reply). ` +
      `Do NOT write Master Plan tags or code yet.`
    );
  }
  return (
    `${BOOTSTRAP_PREFIX} The user already chose project type **${projectType}** on My Projects. ` +
    `Store that as Project Type (do NOT ask the project-type question). ` +
    `Briefly greet in the spirit of chat-personality.md, then say you'll ask a few required questions to build the Master Plan, then ask only your first single discovery question — the main goal — ` +
    `using the exact wording from the rules (one question in your reply). ` +
    `Use ${projectType} for later pages, navigation, UI/UX, and tech recommendations. Do NOT write Master Plan tags or code yet.`
  );
}

/**
 * Idea-first New Project path: summarize understanding, then one missing discovery question.
 */
export function buildIdeaDiscoveryBootstrap(
  idea: string,
  projectType?: NebulaProjectType | null,
): string {
  const trimmed = idea.trim().slice(0, 4000);
  const typeClause = projectType
    ? `Project type already chosen: **${projectType}**. Do NOT ask the project-type question. Use it for later recommendations.`
    : `Project type is unknown — when it is the next missing required item, ask exactly: Web App / Mobile App / Landing Page / Other (please specify).`;

  return (
    `${IDEA_DISCOVERY_BOOTSTRAP_PREFIX} Follow project-execution-rules.md Discovery (architecture-first). ${typeClause}\n\n` +
    `User's idea prompt:\n"""\n${trimmed}\n"""\n\n` +
    `Your first reply MUST:\n` +
    `1) A short "Here's what I understood" summary in bullets (goal, users, main features, constraints, cited links) — only what the prompt clearly implies; say briefly if something is vague or missing.\n` +
    `2) Then ask exactly ONE missing required discovery question (Discovery order: main goal if still unclear → project type if unknown → remaining necessary info one at a time → research pillars later).\n` +
    `Skip anything the prompt already answered clearly — including goals, users, features, auth, privacy, routes/pages, and study/research notes. ` +
    `URLs in the prompt are user citations: do NOT say you cannot browse or refuse to proceed because of links. ` +
    `Use the surrounding text they wrote about the study; treat the URL as a reference to keep in the Master Plan. ` +
    `Do NOT re-ask for facts already stated. Do NOT write Master Plan tags, code fences, or multiple questions. ` +
    `Do NOT emit <START_MASTERPLAN> or <START_CODING> until Discovery is complete.`
  );
}

/**
 * Fast Prototype (additive): infer industry defaults, draft Master Plan with labeled
 * assumptions, then START_CODING Foundation — skip long Guided interview.
 * Law: nebula-project/inference-first-rules.md
 */
export function buildFastPrototypeBootstrap(
  idea?: string | null,
  projectType?: NebulaProjectType | null,
): string {
  const trimmed = (idea || '').trim().slice(0, 4000);
  const typeClause = projectType
    ? `Platform already chosen: **${projectType}**. Use it. Do NOT ask project type.`
    : `Platform unknown — infer conservatively from the goal (prefer Web App unless mobile/kids/on-the-go is clear). State the assumption explicitly. Ask at most ONE question only if platform truly cannot be inferred.`;

  const goalBlock = trimmed
    ? `User goal / brief:\n"""\n${trimmed}\n"""\n\n`
    : `User chose Fast Prototype without a written goal yet. Ask exactly ONE question: the main goal (exact wording from INITIAL ONBOARDING goal question). After they answer, do not interview further — infer and draft.\n\n`;

  return (
    `${FAST_PROTOTYPE_BOOTSTRAP_PREFIX} Follow nebula-project/inference-first-rules.md for quality (no invented competitors; labeled assumptions). ` +
    `Do NOT run Guided Discovery interview. ${typeClause}\n\n` +
    goalBlock +
    `THIS TURN = PLAN ONLY (one Grok job). Do not research, mockup, or write app code in this reply.\n` +
    `Write nebula-project/fast-prototype-memory.md (mode, timestamp, goal).\n` +
    `Categorize → nebula-project/category-classification.md (if confidence low: ONE question and stop).\n` +
    `industry-standards.md as ASSUMPTION defaults only (roles, security baseline when kids/accounts/payments). Not finished research.\n` +
    `Do NOT invent competitor names. Do NOT write nebula-project/competitor-research.md with guessed products.\n` +
    `Do NOT emit START_CODING, <START_CODING>, or app \`\`\`file:\` blocks (app/, src/, pages/, components/). nebula-project/ files are OK.\n` +
    `Draft all five Master Plan sections inside <START_MASTERPLAN>…</END_MASTERPLAN> with REAL content (never placeholder "Build Untitled…" or empty cyan shells). Always fill §1 Goal with a distilled Goal tab from the user brief — never "Not specified", "TBD", empty, or the raw prompt pasted verbatim. Label inferred fields as assumptions; Web Search will overwrite competitors:\n` +
    `- §1 Goal: purpose, primary users/roles, in/out of scope. Never paste the raw user prompt, study URLs, or "the study below" into §1.\n` +
    `- §2 Tech and Research: Project Type; competitors = TBD until Web Search; **include Security baseline** when accounts/kids/students/private data apply.\n` +
    `- §3 Features + at least one testable KPI (assumption-ranked; research will correct).\n` +
    `- §4 Pages: every page with route \`/…\` AND fields purpose, primary_actions, data_entities, authz, empty_state, error_state, nav_links (minimum 3–5 pages).\n` +
    `- §5 UI tokens: mood, hex palette, typography, density, radius, motion, components, nav (15–25 lines).\n` +
    `List assumptions + stage=plan_drafted in fast-prototype-memory.md.\n` +
    `Do NOT claim ui-brief is complete this turn.\n` +
    `AFTER this reply the product runs one heavy job at a time: Web Search (Gate R) → merge plan + ui-brief → UI Gen v2 mockup → Foundation Go. Do not skip research.\n` +
    `End with ≤4 lines: category, assumptions, main pages, that Web Search comes next.`
  );
}

export type IdeChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
};

export function conversationEntriesToIdeMessages(entries: ConversationLogEntryDTO[]): IdeChatMessage[] {
  return entries
    .filter((e) => e.role === 'user' || e.role === 'assistant')
    .map((e, i) => {
      const raw = e.body || '';
      const content =
        e.role === 'assistant'
          ? sanitizeAssistantChatText(raw, {
              fallback:
                'I’ve updated the project. Ask me anything in plain language — Master Plan and code stay in their tabs.',
            })
          : raw;
      // Drop empty assistant artifacts entirely when sanitizer wiped a pure dump with no fallback needed
      return {
        id: `log-${i}-${e.iso}`,
        role: e.role === 'assistant' ? ('assistant' as const) : ('user' as const),
        content,
        timestamp: new Date(e.iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      };
    })
    .filter((m) => m.role === 'user' || Boolean(m.content.trim()));
}

export function isHiddenBootstrapUserMessage(text: string): boolean {
  const t = text.trim();
  if (t === IDE_CHAT_DISCOVERY_BOOTSTRAP) return true;
  if (t === IDE_CHAT_FAST_PROJECT_BOOTSTRAP) return true;
  if (t.startsWith(BOOTSTRAP_PREFIX)) return true;
  if (t.startsWith(IDEA_DISCOVERY_BOOTSTRAP_PREFIX)) return true;
  if (t.startsWith(FAST_PROTOTYPE_BOOTSTRAP_PREFIX)) return true;
  if (t.startsWith(FAST_PROTOTYPE_CONTINUE_PREFIX)) return true;
  if (t.startsWith('FAST PROJECT MODE.')) return true;
  return false;
}
