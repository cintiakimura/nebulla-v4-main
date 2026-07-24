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
  signal?: AbortSignal;
}): Promise<{ assistantContent: string; planningPhase: string; claudeFallbackNotice?: string }> {
  const { textToSend, history, userId, projectName, ideAppendix, signal } = options;
  const buildMode = options.buildMode ?? detectBuildModeIntent(textToSend);
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
    mode: options.chatMode,
    codingHint: options.codingHint,
    discoveryRequired: options.discoveryRequired,
  });

  let systemPrompt =
    buildNebulaAssistantSystemPrompt(latestMP, uiStudioApprovedCode, {
      providerLabel: selection.providerLabel,
      modelLabel: selection.label,
    }) +
    `\n\n${IDE_CHAT_EXECUTION_APPENDIX}` +
    (modeAppendix ? `\n\n${modeAppendix}` : '') +
    (buildMode ? `\n\n${buildModeSystemAppendix()}` : '') +
    (ideAppendix.trim()
      ? `\n\nIDE_EDITOR_SURFACE (active workspace file context — user may be editing here):\n${ideAppendix.trim()}`
      : '');

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

  const data = await fetchJson<{
    choices?: { message?: { content?: string; planningPhase?: string } }[];
    claudeFallbackNotice?: string;
  }>(withProjectQuery('/api/grok/chat'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getGrokRequestHeaders() },
    credentials: 'include',
    signal,
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

  const rawAssistantContent = data.choices?.[0]?.message?.content || '';
  const planningPhase = data.choices?.[0]?.message?.planningPhase || '';

  return {
    assistantContent: rawAssistantContent.trim(),
    planningPhase,
    claudeFallbackNotice:
      typeof data.claudeFallbackNotice === 'string' ? data.claudeFallbackNotice : undefined,
  };
}
