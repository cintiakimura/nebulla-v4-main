import { fetchJson, readResponseJson } from './apiFetch';
import { withProjectBody, withProjectQuery } from './nebulaProjectApi';
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
 * One Grok chat turn for the IDE panel — same `/api/grok/chat` payload shape as the main assistant
 * (master plan + UI studio system prompt), without swarm / agent handoff.
 */
export async function sendIdeAssistantGrokTurn(options: {
  textToSend: string;
  /** Includes the latest user message as the last entry. */
  history: IdeChatTurnMessage[];
  userId: string;
  projectName: string;
  ideAppendix: string;
  signal?: AbortSignal;
}): Promise<{ assistantContent: string; planningPhase: string }> {
  const { textToSend, history, userId, projectName, ideAppendix, signal } = options;

  const { latestMP, uiStudioApprovedCode } = await fetchMasterPlanAndUiStudio();
  const systemPrompt =
    buildNebulaAssistantSystemPrompt(latestMP, uiStudioApprovedCode) +
    (ideAppendix.trim()
      ? `\n\nIDE_EDITOR_SURFACE (active workspace file context — user may be editing here):\n${ideAppendix.trim()}`
      : '');

  const grokHeaders: Record<string, string> = { 'Content-Type': 'application/json' };

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

  const data = await fetchJson<{ choices?: { message?: { content?: string; planningPhase?: string } }[] }>(
    withProjectQuery('/api/grok/chat'),
    {
      method: 'POST',
      headers: grokHeaders,
      credentials: 'include',
      signal,
      body: JSON.stringify(
        withProjectBody({
          userId,
          projectName,
          /** IDE panel always uses main `GROK_API_KEY` with grok-4 — never Grok 3 / swarm settings. */
          chatModel: 'grok-4.1',
          onboardingAutopilot: false,
          messages: messagesPayload,
        }),
      ),
    },
  );

  const rawAssistantContent = data.choices?.[0]?.message?.content || '';
  const planningPhase = data.choices?.[0]?.message?.planningPhase || '';

  return { assistantContent: rawAssistantContent.trim(), planningPhase };
}
