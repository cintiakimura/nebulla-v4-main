import { fetchJson, readResponseJson } from './apiFetch';
import {
  buildModeSystemAppendix,
  chatModeSystemAppendix,
  IDE_CHAT_EXECUTION_APPENDIX,
} from './grokChatArtifacts';
import { getGrokRequestHeaders } from './grokUserKey';
import { withProjectBody, withProjectQuery } from './nebulaProjectApi';
import {
  detectBuildModeIntent,
  fetchIdeWorkspaceMeta,
  fetchWorkspaceOverviewForChat,
  formatWorkspaceContextBlock,
  formatWorkspaceEnrichmentBlock,
} from './ideWorkspaceChatContext';
import { buildNebulaAssistantSystemPrompt } from './nebulaAssistantSystemPrompt';
import {
  DEFAULT_AI_CHAT_MODEL,
  resolveAiChatSelection,
  type AiChatModelId,
} from './aiProvider';
import type { IdeLocaleCode } from './i18n/locales';
import type { ContentLanguageMode } from './i18n/userLanguagePreferences';
import { buildInferenceFirstMemoryAppendix } from './inferenceFirstMemory';

export type IdeChatTurnMessage = { role: 'user' | 'assistant' | 'system'; content: string };

export async function fetchMasterPlanAndUiStudio(): Promise<{
  latestMP: Record<string, unknown>;
  uiStudioApprovedCode: string;
}> {
  const [mpWrap, uiWrap] = await Promise.all([
    (async () => {
      try {
        const mpRes = await fetch(withProjectQuery('/api/master-plan/read'));
        const data = await readResponseJson(mpRes);
        if (mpRes.ok) return data as Record<string, unknown>;
      } catch {
        /* ignore */
      }
      return {};
    })(),
    (async () => {
      try {
        const uiRes = await fetch(withProjectQuery('/api/nebula-ui-studio/code'));
        if (uiRes.ok) {
          const uiData = await readResponseJson<{ code?: string }>(uiRes);
          return uiData.code?.trim() || '';
        }
      } catch {
        /* ignore */
      }
      return '';
    })(),
  ]);
  return { latestMP: mpWrap, uiStudioApprovedCode: uiWrap };
}

/**
 * One assistant chat turn for the IDE panel — `/api/grok/chat` with workspace path + mode on every request.
 * Provider/model come from ModelSelector / TopBar (default Grok).
 */
export async function sendIdeAssistantGrokTurn(options: {
  textToSend: string;
  history: IdeChatTurnMessage[];
  userId: string;
  projectName: string;
  ideAppendix: string;
  buildMode?: boolean;
  /** Catalog model id from ModelSettings / TopBar. */
  chatModel?: AiChatModelId | string;
  /** From Smart Chat Handler — wires mode + NDM / discovery guidance into the system prompt. */
  chatMode?: string;
  codingHint?: string;
  discoveryRequired?: boolean;
  /** User-locked Chat vs Agent (voice-safe brainstorm vs coding). */
  interactionMode?: 'chat' | 'agent';
  /** When true, message includes [APP_STATUS_DEBUG] — force NDM Verify from App Status. */
  hasAppStatusPayload?: boolean;
  /** Technical lines from App Status for bug-db pattern hints. */
  appStatusTechnicalMessages?: string[];
  /** Language contract — see nebulla-project/language-system.md */
  ideLocale?: IdeLocaleCode;
  contentLocale?: IdeLocaleCode;
  contentMode?: ContentLanguageMode;
  signal?: AbortSignal;
}): Promise<{ assistantContent: string; planningPhase: string; claudeFallbackNotice?: string }> {
  const { textToSend, history, userId, projectName, ideAppendix, signal } = options;
  const interactionMode = options.interactionMode === 'chat' ? 'chat' : 'agent';
  const hasAppStatusPayload =
    Boolean(options.hasAppStatusPayload) || /\[APP_STATUS_DEBUG\]/i.test(textToSend);
  // Chat lock never enters build/coding system appendix even if text looks like "build it".
  const buildMode =
    interactionMode === 'agent' &&
    !hasAppStatusPayload &&
    (options.buildMode ?? detectBuildModeIntent(textToSend));
  const selection = resolveAiChatSelection(options.chatModel ?? DEFAULT_AI_CHAT_MODEL);

  const [wsMeta, planCtx, overview] = await Promise.all([
    fetchIdeWorkspaceMeta(true),
    fetchMasterPlanAndUiStudio(),
    fetchWorkspaceOverviewForChat(),
  ]);
  const { latestMP, uiStudioApprovedCode } = planCtx;

  const workspaceContext = formatWorkspaceContextBlock(wsMeta, {
    buildMode,
    enrichment: formatWorkspaceEnrichmentBlock(overview),
  });

  const modeAppendix = chatModeSystemAppendix({
    mode: hasAppStatusPayload && interactionMode === 'agent' ? 'debugging' : options.chatMode,
    codingHint: options.codingHint,
    discoveryRequired: options.discoveryRequired,
    interactionMode,
    hasAppStatusPayload,
    appStatusTechnicalMessages: options.appStatusTechnicalMessages,
    ideLocale: options.ideLocale,
    contentLocale: options.contentLocale,
    contentMode: options.contentMode,
  });

  const inferenceFirstTurn =
    options.codingHint === 'fast-prototype' ||
    (options.chatMode === 'coding' && options.discoveryRequired !== true);

  let inferenceMemory = '';
  if (inferenceFirstTurn && !hasAppStatusPayload) {
    try {
      inferenceMemory = await buildInferenceFirstMemoryAppendix({ includeRulesExcerpt: true });
    } catch {
      inferenceMemory = '';
    }
  }

  let systemPrompt =
    buildNebulaAssistantSystemPrompt(
      latestMP,
      // Never inject full approved CSS/JSX into conversational turns — Grok echoes it into chat.
      buildMode ? uiStudioApprovedCode : '',
      {
        providerLabel: selection.providerLabel,
        modelLabel: selection.label,
      },
    ) +
    `\n\n${IDE_CHAT_EXECUTION_APPENDIX}` +
    (modeAppendix ? `\n\n${modeAppendix}` : '') +
    (buildMode ? `\n\n${buildModeSystemAppendix()}` : '') +
    (inferenceMemory ? `\n\n${inferenceMemory}` : '') +
    (ideAppendix.trim()
      ? `\n\nIDE_EDITOR_SURFACE (active workspace file context — user may be editing here):\n${ideAppendix.trim()}`
      : '') +
    `\n\nCHAT DISPLAY RULE (HARD): Never paste Master Plan sections, CSS, Tailwind, or multi-line code into the visible chat reply. Use <START_MASTERPLAN> tags and \`\`\`file:path\` blocks only. Chat stays short friendly prose.`;

  const tail = history.slice(-10);
  const mapped = tail.map((m, idx, arr) => {
    const last = idx === arr.length - 1;
    if (last && m.role === 'user') {
      return { role: 'user' as const, content: textToSend };
    }
    return {
      role: (m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user') as
        | 'user'
        | 'assistant'
        | 'system',
      content: m.content,
    };
  });
  const messagesPayload = [{ role: 'system' as const, content: systemPrompt }, ...mapped];

  const GROK_CHAT_TIMEOUT_MS = 90_000;
  const timeoutAbort = new AbortController();
  const timeoutId =
    typeof window !== 'undefined'
      ? window.setTimeout(() => timeoutAbort.abort(), GROK_CHAT_TIMEOUT_MS)
      : setTimeout(() => timeoutAbort.abort(), GROK_CHAT_TIMEOUT_MS);
  if (signal) {
    if (signal.aborted) timeoutAbort.abort();
    else signal.addEventListener('abort', () => timeoutAbort.abort(), { once: true });
  }

  let data: {
    choices?: { message?: { content?: string; planningPhase?: string } }[];
    claudeFallbackNotice?: string;
  };
  try {
    data = await fetchJson<{
      choices?: { message?: { content?: string; planningPhase?: string } }[];
      claudeFallbackNotice?: string;
    }>(withProjectQuery('/api/grok/chat'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getGrokRequestHeaders() },
      credentials: 'include',
      signal: timeoutAbort.signal,
      body: JSON.stringify(
        withProjectBody({
          userId,
          projectName: projectName || wsMeta.projectName,
          chatModel: selection.chatModel,
          aiProvider: selection.aiProvider,
          buildMode,
          workspaceContext,
          onboardingAutopilot: false,
          messages: messagesPayload,
        }),
      ),
    });
  } catch (e) {
    if (timeoutAbort.signal.aborted && !signal?.aborted) {
      throw new Error(
        'Grok chat timed out after 90s. If a Master Plan is already saved, coding continues from it — you do not need to wait or re-send the prompt.',
      );
    }
    throw e;
  } finally {
    if (typeof window !== 'undefined') window.clearTimeout(timeoutId);
    else clearTimeout(timeoutId);
  }

  const rawAssistantContent = data.choices?.[0]?.message?.content || '';
  const planningPhase = data.choices?.[0]?.message?.planningPhase || '';

  return {
    assistantContent: rawAssistantContent.trim(),
    planningPhase,
    claudeFallbackNotice:
      typeof data.claudeFallbackNotice === 'string' ? data.claudeFallbackNotice : undefined,
  };
}
