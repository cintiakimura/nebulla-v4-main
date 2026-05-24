import { fetchJson, readResponseJson } from './apiFetch';
import {
  buildModeSystemAppendix,
  IDE_CHAT_EXECUTION_APPENDIX,
} from './grokChatArtifacts';
import { withProjectBody, withProjectQuery } from './nebulaProjectApi';
import {
  detectBuildModeIntent,
  fetchIdeWorkspaceMeta,
  formatWorkspaceContextBlock,
} from './ideWorkspaceChatContext';
import { buildNebulaAssistantSystemPrompt } from './nebulaAssistantSystemPrompt';

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
 * One Grok chat turn for the IDE panel — `/api/grok/chat` with workspace path + mode on every request.
 */
export async function sendIdeAssistantGrokTurn(options: {
  textToSend: string;
  history: IdeChatTurnMessage[];
  userId: string;
  projectName: string;
  ideAppendix: string;
  buildMode?: boolean;
  signal?: AbortSignal;
}): Promise<{ assistantContent: string; planningPhase: string; claudeFallbackNotice?: string }> {
  const { textToSend, history, userId, projectName, ideAppendix, signal } = options;
  const buildMode = options.buildMode ?? detectBuildModeIntent(textToSend);

  const [wsMeta, planCtx] = await Promise.all([
    fetchIdeWorkspaceMeta(true),
    fetchMasterPlanAndUiStudio(),
  ]);
  const { latestMP, uiStudioApprovedCode } = planCtx;

  const workspaceContext = formatWorkspaceContextBlock(wsMeta, { buildMode });

  let systemPrompt =
    buildNebulaAssistantSystemPrompt(latestMP, uiStudioApprovedCode) +
    `\n\n${IDE_CHAT_EXECUTION_APPENDIX}` +
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
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    signal,
    body: JSON.stringify(
      withProjectBody({
        userId,
        projectName: projectName || wsMeta.projectName,
        chatModel: 'grok-4',
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
