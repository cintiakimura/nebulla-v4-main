import type { ConversationLogEntryDTO } from './conversationLogClient';

/** Hidden user turn — Grok replies with the first onboarding question only (project-execution-rules §4). */
export const IDE_CHAT_DISCOVERY_BOOTSTRAP =
  "I'm ready. Follow project-execution-rules.md INITIAL ONBOARDING: ask only your first single discovery question about my app (exact wording from the rules, one question in your reply).";

/**
 * Fast / Prompt-first project creation bootstrap.
 * Tells Grok to do a very short interview (max 3-4 questions) then produce the Master Plan.
 */
export const IDE_CHAT_FAST_PROJECT_BOOTSTRAP =
  "FAST PROJECT MODE. The user gave a short description for a new app. Respect project-execution-rules.md and create a proper Master Plan, but keep the discovery extremely short — ask at most 3-4 essential follow-up questions total, then move quickly to writing the full Master Plan sections (§1-§6). Start by acknowledging the prompt and asking the first 1-2 questions only.";

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
  return text.trim() === IDE_CHAT_DISCOVERY_BOOTSTRAP;
}
