import { fetchJson, readResponseJson } from './apiFetch';
import { GROK_CHAT_SETUP_HINT } from './grokKey';
import { withProjectBody, withProjectQuery } from './nebulaProjectApi';
import { buildNebulaAssistantSystemPrompt } from './nebulaAssistantSystemPrompt';
import {
  buildSwarmConversationSummary,
  computePhaseSyncAfterResponse,
  shouldPostSwarmHandoff,
} from './nebulaSwarmGate';
import { runNebulaSwarm } from './runNebulaSwarm';
import type { SwarmHandoffPacket, SwarmPhase, SwarmIntensity } from '@/types/swarm';
import type { NebulaSwarmStateFile } from '@/lib/nebulaSwarmState';
import type { IdeSwarmFocusPayload } from './ideSwarmFocus';
import { compactMasterPlanForSwarm } from './ideMasterPlanSummary';

const AGENTS_PREF_KEY = 'nebula-agents-enabled';

function readStoredAgentsPref(): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem(AGENTS_PREF_KEY) !== '0';
}

export type IdeChatTurnMessage = { role: 'user' | 'assistant' | 'system'; content: string };

/** Subset of swarm context used for the same Grok + handoff pipeline as AssistantSidebar. */
export type IdeSwarmBridge = {
  isEnabled: boolean;
  currentPhase: SwarmPhase;
  intensity: SwarmIntensity;
  startSwarm: (phase: SwarmPhase, projectName: string) => void;
  addActivity: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
  setCurrentPhase: (phase: SwarmPhase) => void;
  finishSwarm: (handoff: SwarmHandoffPacket) => void;
};

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

async function fetchSwarmPersisted(): Promise<NebulaSwarmStateFile> {
  try {
    const data = await fetchJson<{ swarmState?: NebulaSwarmStateFile }>(withProjectQuery('/api/nebula-swarm/state'));
    const s = data.swarmState;
    if (s && typeof s === 'object' && (s as NebulaSwarmStateFile).schemaVersion === 2) {
      return s as NebulaSwarmStateFile;
    }
  } catch {
    /* ignore */
  }
  return { schemaVersion: 2 };
}

/**
 * One Grok chat turn for the IDE panel — mirrors AssistantSidebar’s `/api/grok/chat` path
 * (master plan + UI studio system prompt, optional swarm handoff, same message mapping).
 */
export async function sendIdeAssistantGrokTurn(options: {
  textToSend: string;
  /** Includes the latest user message as the last entry. */
  history: IdeChatTurnMessage[];
  userId: string;
  projectName: string;
  chatModel: string;
  ideAppendix: string;
  /** From `getUserCapabilities` for the signed-in tier (or free when anonymous). */
  agentsEnabledForTier: boolean;
  swarm: IdeSwarmBridge;
  /** Explicit editor focus — preferred over `window.nebulaSwarmFocus*` so chat + swarm stay aligned. */
  swarmFocus?: IdeSwarmFocusPayload;
  signal?: AbortSignal;
}): Promise<{ assistantContent: string; planningPhase: string }> {
  const {
    textToSend,
    history,
    userId,
    projectName,
    chatModel,
    ideAppendix,
    agentsEnabledForTier,
    swarm,
    swarmFocus,
    signal,
  } = options;

  let hasServerKey = false;
  try {
    const r = await fetch(withProjectQuery('/api/config'), { credentials: 'include' });
    const cfg = (await readResponseJson(r)) as { hasGrokApiKey?: boolean };
    hasServerKey = r.ok && Boolean(cfg.hasGrokApiKey);
  } catch {
    hasServerKey = false;
  }
  if (!hasServerKey) {
    throw new Error(GROK_CHAT_SETUP_HINT);
  }

  const { latestMP, uiStudioApprovedCode } = await fetchMasterPlanAndUiStudio();
  const systemPrompt =
    buildNebulaAssistantSystemPrompt(latestMP, uiStudioApprovedCode) +
    (ideAppendix.trim()
      ? `\n\nIDE_EDITOR_SURFACE (active workspace file context — user may be editing here):\n${ideAppendix.trim()}`
      : '');

  const grokHeaders: Record<string, string> = { 'Content-Type': 'application/json' };

  let grokUserMessageContent = textToSend;
  let swarmHandoffPacket: SwarmHandoffPacket | null = null;
  let swarmPipelineStarted = false;

  const swarmPersisted = await fetchSwarmPersisted();
  const priorUserMessageCount = history.filter((m) => m.role === 'user').length;

  const runSwarmThisTurn = shouldPostSwarmHandoff({
    swarmEnabled: swarm.isEnabled && agentsEnabledForTier && readStoredAgentsPref(),
    onboardingAutopilot: false,
    skipSwarm: undefined,
    forceSwarm: undefined,
    executionPhase: swarm.currentPhase,
    userMessage: textToSend,
    swarmIntensity: swarm.intensity,
    swarmPersisted,
  });

  if (swarm.isEnabled && runSwarmThisTurn) {
    const { startSwarm, addActivity, currentPhase, intensity } = swarm;
    const resolvedProjectName = projectName?.trim() || 'Untitled Project';
    swarmPipelineStarted = true;
    startSwarm(currentPhase, resolvedProjectName);
    addActivity(`Swarm handoff starting (${intensity.replace(/_/g, ' ')})`, 'info');

    const swarmRunId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `swarm-${Date.now()}`;

    try {
      const mpSummary = compactMasterPlanForSwarm(latestMP);
      const convSummary =
        priorUserMessageCount > 0
          ? buildSwarmConversationSummary(
              history.map((m) => ({
                role: m.role === 'assistant' ? 'model' : m.role === 'user' ? 'user' : 'model',
                text: m.content,
              })),
            )
          : '';
      const mergedContext = [mpSummary, convSummary].filter(Boolean).join('\n\n').trim().slice(0, 2000);
      const focusPathsRaw =
        swarmFocus?.focusPaths?.length
          ? swarmFocus.focusPaths
          : typeof window !== 'undefined' &&
              Array.isArray((window as unknown as { nebulaSwarmFocusPaths?: unknown }).nebulaSwarmFocusPaths)
            ? ((window as unknown as { nebulaSwarmFocusPaths: string[] }).nebulaSwarmFocusPaths as string[])
            : undefined;
      const w = typeof window !== 'undefined' ? (window as unknown as Record<string, unknown>) : null;
      const rawSnip = swarmFocus?.focusSnippets && Object.keys(swarmFocus.focusSnippets).length ? swarmFocus.focusSnippets : w?.nebulaSwarmFocusSnippets;
      const focusSnippets =
        rawSnip && typeof rawSnip === 'object' && !Array.isArray(rawSnip)
          ? (rawSnip as Record<string, string>)
          : undefined;

      swarmHandoffPacket = await runNebulaSwarm(
        {
          phase: currentPhase,
          userMessage: textToSend,
          projectName: resolvedProjectName,
          runId: swarmRunId,
          swarmIntensity: intensity,
          ...(mergedContext ? { contextSummary: mergedContext } : {}),
          ...(focusPathsRaw?.length ? { focusPaths: focusPathsRaw } : {}),
          ...(focusSnippets && Object.keys(focusSnippets).length ? { focusSnippets } : {}),
        },
        grokHeaders,
      );
      if (swarmHandoffPacket.agentsSkipped) {
        addActivity('Swarm handoff: no support agents ran (trigger-only policy).', 'info');
      }
    } catch (swarmErr) {
      console.warn('[Swarm] runNebulaSwarm failed:', swarmErr);
      swarm.addActivity(
        `Swarm handoff failed: ${swarmErr instanceof Error ? swarmErr.message : String(swarmErr)}`,
        'warning',
      );
    }

    if (swarmHandoffPacket) {
      const enhancedPrompt = `Handoff Packet from Swarm:\n${JSON.stringify(swarmHandoffPacket, null, 2)}\n\nUser Request: ${textToSend}`;
      grokUserMessageContent = enhancedPrompt.slice(0, 100_000);
    }
  }

  const tail = history.slice(-10);
  const mapped = tail.map((m, idx, arr) => {
    const last = idx === arr.length - 1;
    if (last && m.role === 'user') {
      return { role: 'user' as const, content: grokUserMessageContent };
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

  try {
    const data = await fetchJson<{ choices?: { message?: { content?: string; planningPhase?: string } }[] }>(
      withProjectQuery('/api/grok/chat'),
      {
        method: 'POST',
        headers: grokHeaders,
        signal,
        body: JSON.stringify(
          withProjectBody({
            userId,
            projectName,
            chatModel,
            onboardingAutopilot: false,
            messages: messagesPayload,
          }),
        ),
      },
    );

    if (swarmPipelineStarted && swarmHandoffPacket) {
      swarm.addActivity('Swarm completed - handoff delivered to Grok', 'success');
    }

    const rawAssistantContent = data.choices?.[0]?.message?.content || '';
    const planningPhase = data.choices?.[0]?.message?.planningPhase || '';

    const phaseSync = computePhaseSyncAfterResponse({
      current: swarm.currentPhase,
      planningPhaseRaw: planningPhase,
      rawAssistant: rawAssistantContent,
    });
    if (phaseSync.phaseChanged) {
      swarm.setCurrentPhase(phaseSync.nextPhase);
    }

    return { assistantContent: rawAssistantContent.trim(), planningPhase };
  } finally {
    if (swarmPipelineStarted) {
      const fallback: SwarmHandoffPacket = {
        schemaVersion: '1.0.0',
        intensity: swarm.intensity,
        phase: swarm.currentPhase,
        runId: `fallback-${Date.now()}`,
        projectName,
        planner: { skipped: true },
        researcher: { skipped: true },
        tester: { skipped: true },
        reviewer: { skipped: true },
        agentsSkipped: true,
        agentRun: {
          reasons: ['Pipeline finished without merged handoff (error or skipped append).'],
          runQuality: false,
        },
        notesForGrok:
          'Quality run finished without a merged handoff (error or skipped append). Continue from the user message and project-execution-rules.md.',
        timestamp: new Date().toISOString(),
      };
      swarm.finishSwarm(swarmHandoffPacket ?? fallback);
    }
  }
}
