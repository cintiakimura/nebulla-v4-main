import type { ConversationLogEntryDTO } from './conversationLogClient';
import type { NebulaProjectType } from './ideHomeEvents';
import { sanitizeAssistantChatText } from '../../lib/assistantChatSanitize';
import { extractGoalFromUserNote } from '../../lib/spineSequenceClient';
import { isBrainstormCloseConfirmedMessage } from './chatBrainstormClose';
/** Empty chat only — never after a product seed. */
export const IDE_CHAT_DISCOVERY_BOOTSTRAP =
  "I'm ready. Follow chat-personality.md and chat-conversation-loop.md. No idea yet: warm greeting — What's up? What would you like to create today? If they already named a product, treat it as a seed: specific compliment + reflect the north star + Is that right? + the fork. Never Guided Discovery. Never ask what kind of project, paste design or none, or one core feature.";

/**
 * Legacy / chat "Create a new project: …" path.
 * Prefer buildIdeaDiscoveryBootstrap for New Project → Start with a prompt.
 */
export const IDE_CHAT_FAST_PROJECT_BOOTSTRAP =
  "FAST PROJECT MODE. The user gave a product seed. Follow chat-personality.md, chat-thinking-rules.md, chat-conversation-loop.md, and chat-information-checklist.md. First spoken beat only: specific compliment + reflect the north star + Is that right? + fork: I can build what you have in mind right now, or we can shape it together and land on something stronger. Which sounds better? No extras. No Guided Discovery. Don't narrate searching. No feature catalog. No Foundation. No START_CODING.";

/** Shared law for every hidden start turn (landing Build, idea, Fast Prototype, continue). */
export const BRAINSTORM_LOOP_BOOTSTRAP_RULES =
  `Follow nebulla-project/chat-conversation-loop.md and chat-information-checklist.md. ` +
  `Beat A: this text is the seed / continuation — not a ticket, even if it is a long spec. ` +
  `FIRST REPLY after a product seed (then STOP and wait): (1) specific compliment — vary phrasing, keep warmth; ` +
  `(2) reflect — “If I understood correctly, this is what the app should do: [goal in their words]. Is that right?”; ` +
  `(3) one fork — “I can build what you have in mind right now, or we can shape it together and land on something stronger. Which sounds better?” ` +
  `NAME-ONLY / job-word seed (Visual, overlay, mashed Visualual): do NOT say the project is simply called that. Do NOT invent a mash brand. Ask who + one Monday job. If they mean a Twitch/stream overlay (cam + last follower / subscriber / tipper), reflect THAT job. No fork until a job exists. ` +
  `No extras. Don't narrate searching (silent lookup is allowed later on name / Slot 4 / API turns — not on this first reply). No feature catalog. No Foundation. No START_CODING. Do NOT inject Guided Discovery. Never ask what kind of project, paste design or none, or one core feature after a product seed. ` +
  `FAST LANE (now / just build / go / hellos / full idea): infer the Monday loop silently. 1–2 light clarifiers only if the seed is empty (who + one job). Then lock and build the REAL loop — not a 3-button mock. Say they can push back. If Slot 1 was never confirmed, reflect first. ` +
  `LOCK LANE (brainstorm / shape together): silent scoreboard. Next spoken beat = emptiest required slot per turn (Who → Features+inferred workflow → Dependencies). Infer extra pages; don’t quiz. Never mock the workflow (dossier, review, save, extract) if it serves the north star. ` +
  `Close: short summary (goal, who, loop including inferred pages — history/dossier when keep-documents — real dependencies, walls already named). Ask UI once only if they never answered vibe / web vs mobile. Then “If this is right, I’ll lock it and build this product.” Confirm → plan → Foundation of THAT product. ` +
  `Ban as the ending: “v1 / phase 2 / good enough for now / we can add that later / shall we go?” Mock a vendor only when classified user-choice or truly unavailable — never mock the workflow. ` +
  `Sensitivity: one warning + option + a buildable solution (not a legal audit). HIPAA only if they said health. ` +
  `Keep warmth on every beat. Coding only after close or explicit go / hellos / just build. First-message “hello” on an empty project is not coding. ` +
  `After the goal is confirmed, when they add a feature that could fail in the real world: warm specific praise (vary phrasing) + one improvement they did not say + one warning only if there is a real wall. No wall → skip the warning. Do not invent risk. ` +
  `A newly named product is a new workspace — do not reuse another project’s Master Plan unless they asked. ` +
  `THIS TURN FORBIDDEN on compliment / brainstorm / Slot 2–4 turns: <START_MASTERPLAN>, </END_MASTERPLAN>, START_CODING, <START_CODING>, \`\`\`file: blocks, job-brief.md, engineer interview, or any nebula-project/ files. Do not EDIT leftover preview HTML. No auto-Go on “do we need an API?” or “what about privacy?”`;

const BOOTSTRAP_PREFIX = "I'm ready. Follow chat-conversation-loop.md (not Guided Discovery):";

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
  const rememberType = projectType
    ? `Platform already chosen: **${projectType}**. Remember it. Do NOT ask what kind of project.`
    : `Platform unknown — do not quiz project type on this turn.`;
  return (
    `${BOOTSTRAP_PREFIX} Follow chat-personality.md and chat-conversation-loop.md. ${rememberType} ` +
    `No idea yet: What's up? What would you like to create today? ` +
    `If they already named a product, first beat only: specific compliment + reflect + Is that right? + the fork. ` +
    `Do NOT run Guided Discovery. Do NOT ask paste design or none / one core feature. ` +
    `No bullets. Don't narrate searching. No Master Plan tags, no file blocks, no START_CODING.`
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
    ? `Project type already chosen: **${projectType}**. Remember it. Do NOT ask what kind of project.`
    : `Project type unknown — do not quiz it on the first seed reply.`;

  return (
    `${IDEA_DISCOVERY_BOOTSTRAP_PREFIX} Follow chat-personality.md, chat-thinking-rules.md, chat-conversation-loop.md, and chat-information-checklist.md. ${typeClause}\n\n` +
    `User's idea prompt (opening line of the talk — not a spec to execute, even if long):\n"""\n${trimmed}\n"""\n\n` +
    `${BRAINSTORM_LOOP_BOOTSTRAP_RULES}\n` +
    `First reply = specific compliment + “If I understood correctly, this is what the app should do: … Is that right?” + “I can build what you have in mind right now, or we can shape it together and land on something stronger. Which sounds better?” Then wait. ` +
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
    `First reply: specific compliment + “If I understood correctly, this is what the app should do: … Is that right?” + “I can build what you have in mind right now, or we can shape it together and land on something stronger. Which sounds better?” Then wait. ` +
    `Do NOT run Guided Discovery. Do NOT ask what kind of project / paste design or none / one core feature. ` +
    `Do NOT run the engineer interview. Do NOT write job-brief.md.`
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
    .filter((e) => !(e.role === 'user' && isHiddenBootstrapUserMessage(e.body || '')))
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
