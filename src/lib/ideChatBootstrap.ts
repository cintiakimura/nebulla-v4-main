import type { ConversationLogEntryDTO } from './conversationLogClient';
import type { NebulaProjectType } from './ideHomeEvents';
import { sanitizeAssistantChatText } from '../../lib/assistantChatSanitize';
import { extractGoalFromUserNote } from '../../lib/spineSequenceClient';
import { isBrainstormCloseConfirmedMessage } from './chatBrainstormClose';
/** Hidden user turn — Grok replies with the first onboarding question only (project-execution-rules §4). */
export const IDE_CHAT_DISCOVERY_BOOTSTRAP =
  "I'm ready. Follow project-execution-rules.md INITIAL ONBOARDING: ask only your first single discovery question about what I'm creating (app, landing page, site, or other — exact wording from the rules, one question in your reply).";

/**
 * Legacy / chat "Create a new project: …" path.
 * Prefer buildIdeaDiscoveryBootstrap for New Project → Start with a prompt.
 */
export const IDE_CHAT_FAST_PROJECT_BOOTSTRAP =
  "FAST PROJECT MODE. The user gave a short description for a new project. Follow chat-personality.md, chat-thinking-rules.md, chat-conversation-loop.md, and chat-information-checklist.md. Seed → reflect the north star → ask if that is right. After they confirm, one advance from the emptiest required slot. No bullets, no research talk, no plan. Do NOT write Master Plan tags, file blocks, or START_CODING.";

/** Shared law for every hidden start turn (landing Build, idea, Fast Prototype, continue). */
export const BRAINSTORM_LOOP_BOOTSTRAP_RULES =
  `Follow nebulla-project/chat-conversation-loop.md (one beat per turn). ` +
  `Beat A: this text is the seed / continuation — not a ticket and not “go build,” even if it is a long spec. ` +
  `Beat B: as soon as you can name the goal, restate ONLY the north star in their words and ask if that is right ` +
  `(adapt: “If I understood correctly, this exists so [goal]. Is that right?”). Repeat Beat B only if the goal changed. ` +
  `Silent scoreboard: chat-information-checklist.md. Update slots after each user turn. Never show the list. ` +
  `Next spoken beat from the emptiest required slot; prefer Slot 1 until confirmed. ` +
  `Beat C: only after the goal is confirmed — ONE idea/resource with a reason, OR one blocking gap from that empty slot, OR one merge/cut. Never a questionnaire. ` +
  `Beat D: if they are thinking out loud, stay on their thread, then one small advance. ` +
  `Short spoken prose. No markdown lists unless they asked. No tool talk. No “next I’ll ask about…”. ` +
  `If they say skip / just build / insist twice: still stay in the loop — reflect, or name the single biggest missing piece, or say you feel you have enough. ` +
  `THIS TURN FORBIDDEN: <START_MASTERPLAN>, </END_MASTERPLAN>, START_CODING, <START_CODING>, \`\`\`file: blocks, job-brief.md, or any nebula-project/ files.`;

const BOOTSTRAP_PREFIX = "I'm ready. Follow project-execution-rules.md INITIAL ONBOARDING:";

/** Prefix for idea-prompt guided start (hidden from chat transcript). */
export const IDEA_DISCOVERY_BOOTSTRAP_PREFIX = 'IDEA PROMPT DISCOVERY.';

/** Prefix for Fast Prototype (inference-first) — hidden from chat transcript. */
export const FAST_PROTOTYPE_BOOTSTRAP_PREFIX = 'FAST PROTOTYPE MODE.';

/** Hidden follow-up if a later product step re-enters the loop — never a plan retry. */
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
    `${FAST_PROTOTYPE_CONTINUE_PREFIX} Stay in the conversation loop. Do NOT retry a Master Plan. ` +
    `${BRAINSTORM_LOOP_BOOTSTRAP_RULES}\n\n` +
    goalBlock +
    `If you already reflected the goal, do one Beat C or Beat D only. Remember typed and spoken share the same state.`
  );
}

/**
 * Bootstrap for guided discovery. When project type was chosen on My Projects,
 * instruct Grok to skip the project-type question and ask only the main goal first.
 */
export function buildDiscoveryBootstrap(projectType?: NebulaProjectType | null): string {
  if (!projectType) {
    return (
      `${BOOTSTRAP_PREFIX} Follow chat-personality.md and chat-conversation-loop.md. Warm greeting if they have not named an idea yet. ` +
      `If they already named one, reflect it in their words and ask confirmation before anything else. ` +
      `One spoken beat. No bullets, no research talk. Do NOT write Master Plan tags, file blocks, or START_CODING.`
    );
  }
  return (
    `${BOOTSTRAP_PREFIX} The user already chose project type **${projectType}** on My Projects. ` +
    `Store that as Project Type (do NOT ask the project-type question). ` +
    `Follow chat-personality.md: greet briefly, then ask the main goal in their language — one question, no Master Plan pitch. ` +
    `Use ${projectType} later. Do NOT write Master Plan tags or code yet.`
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
    `${IDEA_DISCOVERY_BOOTSTRAP_PREFIX} Follow chat-personality.md, chat-thinking-rules.md, chat-conversation-loop.md, and chat-information-checklist.md. ${typeClause}\n\n` +
    `User's idea prompt (opening line of the talk — not a spec to execute, even if long):\n"""\n${trimmed}\n"""\n\n` +
    `${BRAINSTORM_LOOP_BOOTSTRAP_RULES}\n` +
    `First reply = Beat B (reflect the goal). Do not offer extras until they confirm, unless the goal is already crystal clear — then at most ONE Beat C. ` +
    `Skip anything they already answered. Never invent to fill a hole. ` +
    `URLs they pasted are citations — do not stall because you cannot open the link.`
  );
}

/**
 * Landing Build / Fast Prototype / chat first seed — same conversation loop.
 * Does not emit a Master Plan or job-brief on this turn.
 */
export function buildFastPrototypeBootstrap(
  idea?: string | null,
  projectType?: NebulaProjectType | null,
): string {
  const trimmed = (idea || '').trim().slice(0, 4000);
  const typeClause = projectType
    ? `Platform already chosen: ${projectType}. Remember it; do not ask project type.`
    : `Platform unknown — do not quiz them about it on this turn unless it is the one Beat C gap after they confirm the goal.`;

  const goalBlock = trimmed
    ? `User goal / brief:\n"""\n${trimmed}\n"""\n\n`
    : `No written goal yet. Beat B: ask what this exists to do — one spoken question, their language. Not the INITIAL ONBOARDING script.\n\n`;

  return (
    `${FAST_PROTOTYPE_BOOTSTRAP_PREFIX} Same loop as typed chat and voice. ${typeClause}\n\n` +
    goalBlock +
    `${BRAINSTORM_LOOP_BOOTSTRAP_RULES}\n` +
    `First reply: Beat B on the seed. Long briefs still get a reflection + at most one advance. ` +
    `Do NOT run Guided Discovery interview. Do NOT run the engineer interview. Do NOT write job-brief.md.`
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
  if (isBrainstormCloseConfirmedMessage(t)) return true;
  return false;
}
