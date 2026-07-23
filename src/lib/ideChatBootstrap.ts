import type { ConversationLogEntryDTO } from './conversationLogClient';
import type { NebulaProjectType } from './ideHomeEvents';

/** Hidden user turn — Grok replies with the first onboarding question only (project-execution-rules §4). */
export const IDE_CHAT_DISCOVERY_BOOTSTRAP =
  "I'm ready. Follow project-execution-rules.md INITIAL ONBOARDING: ask only your first single discovery question about my app (exact wording from the rules, one question in your reply).";

/**
 * Fast / Prompt-first project creation bootstrap.
 * Tells Grok to do a very short interview (max 3-4 questions) then produce the Master Plan.
 */
export const IDE_CHAT_FAST_PROJECT_BOOTSTRAP =
  "FAST PROJECT MODE. The user gave a short description for a new app. Respect project-execution-rules.md and create a proper Master Plan, but keep the discovery extremely short — ask at most 3-4 essential follow-up questions total (include Project Type if unknown), then move quickly to writing the full Master Plan with the five canonical sections (§1 Goal, §2 Tech and Research, §3 Features and KPIs, §4 Pages and navigation, §5 UI/UX design). Start by acknowledging the prompt and asking the first 1–2 questions only.";

const BOOTSTRAP_PREFIX = "I'm ready. Follow project-execution-rules.md INITIAL ONBOARDING:";

/**
 * Bootstrap for guided discovery. When project type was chosen on My Projects,
 * instruct Grok to skip the project-type question and ask only the main goal first.
 */
export function buildDiscoveryBootstrap(projectType?: NebulaProjectType | null): string {
  if (!projectType) return IDE_CHAT_DISCOVERY_BOOTSTRAP;
  return (
    `${BOOTSTRAP_PREFIX} The user already chose project type **${projectType}** on My Projects. ` +
    `Store that as Project Type (do NOT ask the project-type question). ` +
    `Ask only your first single discovery question — the main goal — using the exact wording from the rules ` +
    `(one question in your reply). Use ${projectType} for later pages, navigation, UI/UX, and tech recommendations.`
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
    .map((e, i) => ({
      id: `log-${i}-${e.iso}`,
      role: e.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: e.body,
      timestamp: new Date(e.iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
    }));
}

export function isHiddenBootstrapUserMessage(text: string): boolean {
  const t = text.trim();
  if (t === IDE_CHAT_DISCOVERY_BOOTSTRAP) return true;
  if (t === IDE_CHAT_FAST_PROJECT_BOOTSTRAP) return true;
  return t.startsWith(BOOTSTRAP_PREFIX);
}
