import type { ConversationLogEntryDTO } from './conversationLogClient';
import type { NebulaProjectType } from './ideHomeEvents';
import { sanitizeAssistantChatText } from '../../lib/assistantChatSanitize';

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
    `1) A short "Here's what I understood" summary in bullets (goal, users, main features, constraints) — only what the prompt clearly implies; say briefly if something is vague or missing.\n` +
    `2) Then ask exactly ONE missing required discovery question (Discovery order: main goal if still unclear → project type if unknown → remaining necessary info one at a time → research pillars later).\n` +
    `Skip anything the prompt already answered clearly. Do NOT write Master Plan tags, code fences, or multiple questions. Do NOT emit <START_MASTERPLAN> or <START_CODING> until Discovery is complete.`
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
  if (t.startsWith('FAST PROJECT MODE.')) return true;
  return false;
}
