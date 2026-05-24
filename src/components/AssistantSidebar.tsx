import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { ArrowUp, ChevronDown, Hand, Mic, Paperclip, Rocket } from 'lucide-react';

const ONBOARDING_DONE_KEY = 'nebulla_onboarding_autopilot_done';

const MONTHLY_LIMIT_MESSAGE =
  "You've reached your monthly AI usage limit on the Free plan. Upgrade to Pro for unlimited access.";

function readOnboardingAutopilotDone(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_DONE_KEY) === '1';
  } catch {
    return false;
  }
}
import { VoiceLinesIcon } from './VoiceLinesIcon';
import { Logo } from './Logo';
import { SwarmStatusBar } from '@/components/swarm/SwarmStatusBar';
import { useSwarm } from './swarm/SwarmProvider';
import { useModelSettings } from '@/components/settings/ModelSettingsContext';
import { ChatModelSelector } from '@/components/settings/ModelSelector';
import { computePhaseSyncAfterResponse } from '../lib/nebulaSwarmGate';
import { fetchJson, readResponseJson } from '../lib/apiFetch';
import { MAIN_AI_CHAT_SETUP_HINT, serverReportsMainAiKey } from '../lib/grokKey';
import { fetchNebulaPublicConfig } from '../lib/nebulaPublicConfig';
import { dispatchOpenUiStudio, dispatchStartUiUxWorkflow } from '../lib/nebulaUiStudioEvents';
import { withProjectBody, withProjectQuery } from '../lib/nebulaProjectApi';
import { buildNebulaAssistantSystemPrompt } from '../lib/nebulaAssistantSystemPrompt';
import { fetchConversationLogEntries } from '../lib/conversationLogClient';
import { uploadFileToR2 } from '../lib/nebulaStorageClient';
import {
  MIC_REENABLE_AFTER_TTS_MS,
  splitTextForTts,
  TTS_START_DEBOUNCE_MS,
  VOICE_SILENCE_BEFORE_SEND_MS,
} from '../lib/voiceTtsShared';

const MASTER_PLAN_TITLES = [
  '1. Goal of the app',
  '2. Tech Research',
  '3. Features and KPIs',
  '4. Pages and navigation',
  '5. UI/UX design',
  '6. Environment Setup',
] as const;

function splitMasterPlanSectionsFromBlock(block: string): Partial<Record<number, string>> {
  const lines = block.split('\n');
  const out: Partial<Record<number, string>> = {};
  let current: number | null = null;
  const headingRe = /^\s{0,3}(?:#{2,4}\s*)?(\d)\.\s*(Goal of the app|Tech Research|Features and KPIs|Pages and navigation|UI\/UX design|Environment Setup)\s*$/i;
  for (const line of lines) {
    const m = line.match(headingRe);
    if (m) {
      current = Number(m[1]);
      if (current >= 1 && current <= 6 && !out[current]) out[current] = '';
      continue;
    }
    if (current) out[current] = `${out[current] ?? ''}${line}\n`;
  }
  for (let i = 1; i <= 6; i++) {
    const raw = (out[i] ?? '').trim();
    if (!raw) {
      delete out[i];
      continue;
    }
    // Hard guard: never persist orchestration/rules dump into a user-facing tab.
    if (/Project Execution Rules|INITIAL ONBOARDING|START_CODING|AUTOMATED WORKFLOW|TAB \d HIDDEN RULES/i.test(raw)) {
      delete out[i];
      continue;
    }
    out[i] = raw;
  }
  return out;
}

export function AssistantSidebar({
  width = 320,
  userId = 'anonymous',
  projectName = 'Untitled Project',
  activeProjectKey = 'default',
  codeMode = false,
  onExitCodeMode,
}: {
  width?: number;
  userId?: string;
  projectName?: string;
  /** Server cloud workspace id (matches App active project). */
  activeProjectKey?: string;
  /** When true, the assistant sidebar does not send chat; orchestration is code-only per project-execution-rules.md */
  codeMode?: boolean;
  onExitCodeMode?: () => void;
}) {
  const swarm = useSwarm();
  const modelSettings = useModelSettings();

  const [isLive, setIsLive] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [aboutAppActive, setAboutAppActive] = useState(() => !readOnboardingAutopilotDone());
  const [aboutAppInput, setAboutAppInput] = useState('');
  const [messages, setMessages] = useState<{ role: string; text: string; fullText?: string; reasoning?: string }[]>(
    () =>
      readOnboardingAutopilotDone()
        ? [
            {
              role: 'model',
              text: 'System initialized. Ready to collaborate.',
              fullText: 'System initialized. Ready to collaborate.',
            },
          ]
        : [],
  );
  const [masterPlan, setMasterPlan] = useState<any>(null);
  const [serverHasGrokKey, setServerHasGrokKey] = useState<boolean | null>(null);
  const [freeTokenUsage, setFreeTokenUsage] = useState<{ used: number; limit: number } | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshFreeTokenUsage = useCallback(async () => {
    if (userId === 'anonymous' || modelSettings.capabilities.tier !== 'free') {
      setFreeTokenUsage(null);
      return;
    }
    try {
      const data = await fetchJson<{
        used?: number;
        limit?: number | null;
        remaining?: number | null;
      }>(withProjectQuery('/api/billing/token-usage'), { credentials: 'include' });
      if (typeof data.limit === 'number' && data.limit > 0) {
        setFreeTokenUsage({ used: Number(data.used ?? 0), limit: data.limit });
      } else {
        setFreeTokenUsage(null);
      }
    } catch {
      setFreeTokenUsage(null);
    }
  }, [userId, modelSettings.capabilities.tier]);

  useEffect(() => {
    fetch(withProjectQuery('/api/config'))
      .then(async (r) => readResponseJson(r))
      .then((cfg: { hasMainAiApiKey?: boolean; hasGrokApiKey?: boolean }) =>
        setServerHasGrokKey(serverReportsMainAiKey(cfg))
      )
      .catch(() => setServerHasGrokKey(false));
  }, [activeProjectKey]);

  useEffect(() => {
    void refreshFreeTokenUsage();
  }, [refreshFreeTokenUsage]);

  useEffect(() => {
    fetch(withProjectQuery('/api/master-plan/read'))
      .then(async (res) => {
        try {
          const data = await readResponseJson(res);
          if (res.ok) setMasterPlan(data);
        } catch (e) {
          console.warn('Master plan load skipped:', e);
        }
      })
      .catch(console.error);
  }, [activeProjectKey]);

  useEffect(() => {
    if (codeMode) return;
    let cancelled = false;
    void (async () => {
      try {
        const entries = await fetchConversationLogEntries();
        if (cancelled) return;
        if (entries.length === 0) {
          setMessages(
            readOnboardingAutopilotDone()
              ? [
                  {
                    role: 'model',
                    text: 'System initialized. Ready to collaborate.',
                    fullText: 'System initialized. Ready to collaborate.',
                  },
                ]
              : [],
          );
          return;
        }
        setMessages(
          entries.map((e) => ({
            role: e.role === 'assistant' ? 'model' : e.role === 'system' ? 'system' : 'user',
            text: e.body,
            fullText: e.body,
          })),
        );
      } catch (e) {
        console.warn('Conversation log load skipped:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, activeProjectKey, projectName, codeMode]);

  const [inputText, setInputText] = useState('');
  const [buildQueue, setBuildQueue] = useState<string[]>([]);

  const handleFileAttachClick = () => {
    if (codeMode || uploadBusy) return;
    fileInputRef.current?.click();
  };

  const handleFileSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file || codeMode) return;
      setUploadBusy(true);
      setChatStatus('Uploading to Cloudflare R2…');
      try {
        const result = await uploadFileToR2(file, { projectKey: activeProjectKey });
        if (!result.ok) {
          const hint = result.hint ?? result.error;
          setMessages((prev) => [...prev, { role: 'model', text: hint, fullText: hint }]);
          return;
        }
        const attachmentLine = result.url
          ? `[Attached ${file.name}](${result.url})`
          : `[Attached ${file.name}] (storage key: ${result.key})`;
        setInputText((prev) => (prev.trim() ? `${prev.trim()}\n${attachmentLine}` : attachmentLine));
      } finally {
        setUploadBusy(false);
        setChatStatus(null);
      }
    },
    [activeProjectKey, codeMode],
  );

  const sessionRef = useRef<any>(null);
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const chatSessionRef = useRef<any>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const captureStreamRef = useRef<MediaStream | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isLiveRef = useRef(isLive);
  const isAiSpeakingRef = useRef(isAiSpeaking);
  const isRecordingTextRef = useRef(false);

  /** Web Speech instance for hands-free (continuous) — never shared with dictation mic. */
  const liveRecognitionRef = useRef<any>(null);
  /** Web Speech instance for push-to-talk dictation (mic button). */
  const dictationRecognitionRef = useRef<any>(null);
  /** User started live mode while TTS was playing; begin recognition when TTS ends. */
  const deferredLiveRecognitionStartRef = useRef(false);
  /** Snapshot at TTS start: resume live recognition after playback if user still in live mode. */
  const resumeLiveAfterTtsRef = useRef(false);
  /** Snapshot at TTS start: resume dictation after playback if user was dictating. */
  const resumeDictationAfterTtsRef = useRef(false);
  /** Assigned after `startAudioCapture` exists — TTS end / interrupt call this to restore STT. */
  const resumeListeningAfterOutgoingTtsRef = useRef<() => void>(() => {});
  /** Dictation `useEffect` mounts once — call through this ref so live STT can resume after dictation. */
  const resumeLiveAfterDictationEndsRef = useRef<() => void>(() => {});

  const [isRecordingText, setIsRecordingText] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  /** Small status line for multi-step flows (e.g. Go → Grok 4 summary → Grok Code). */
  const [chatStatus, setChatStatus] = useState<string | null>(null);
  const codingStatusTimerRef = useRef<number | null>(null);

  useEffect(() => {
    isLiveRef.current = isLive;
  }, [isLive]);

  useEffect(() => {
    isAiSpeakingRef.current = isAiSpeaking;
  }, [isAiSpeaking]);

  useEffect(() => {
    isRecordingTextRef.current = isRecordingText;
  }, [isRecordingText]);
  const ttsRequestAbortRef = useRef<AbortController | null>(null);
  const ttsObjectUrlRef = useRef<string | null>(null);
  const ttsDebounceTimerRef = useRef<number | null>(null);
  /** Increment to invalidate in-flight chunked TTS or to cancel via interrupt. */
  const ttsRunIdRef = useRef(0);
  /** Resolves the current chunked-TTS `Audio` wait so interrupt cannot deadlock playback. */
  const ttsChunkPlayResolveRef = useRef<(() => void) | null>(null);
  /** Abort in-flight `/api/grok/chat` so Revert / interrupt can cancel the pending reply. */
  const grokChatAbortRef = useRef<AbortController | null>(null);
  const q1ExecutionTriggeredRef = useRef(false);
  /** After Grok TTS ends, wait before turning the mic channel back on (project-execution-rules.md). */
  const micPostTtsUnlockTimerRef = useRef<number | null>(null);

  const stopLiveRecognitionSafe = () => {
    const r = liveRecognitionRef.current;
    if (!r) return;
    try {
      r.stop();
    } catch {
      /* already stopped */
    }
  };

  const stopDictationRecognitionSafe = () => {
    const r = dictationRecognitionRef.current;
    if (!r) return;
    try {
      r.stop();
    } catch {
      /* already stopped */
    }
  };

  /** Hands-free and dictation share one mic channel — restart live STT after dictation/TTS pause. */
  const resumeLiveSttAfterDictationEnds = () => {
    queueMicrotask(() => {
      if (!isLiveRef.current || !liveRecognitionRef.current || isAiSpeakingRef.current) return;
      try {
        liveRecognitionRef.current.start();
      } catch (e) {
        console.warn('Live recognition restart failed', e);
      }
    });
  };

  /** No speech-to-text while Grok TTS is playing (avoids self-listening). Snapshots prior listen state. */
  const pauseListeningForOutgoingTts = () => {
    if (micPostTtsUnlockTimerRef.current != null) {
      window.clearTimeout(micPostTtsUnlockTimerRef.current);
      micPostTtsUnlockTimerRef.current = null;
    }
    resumeLiveAfterTtsRef.current = Boolean(
      isLiveRef.current &&
        (liveRecognitionRef.current != null || deferredLiveRecognitionStartRef.current)
    );
    resumeDictationAfterTtsRef.current = Boolean(isRecordingTextRef.current);
    stopLiveRecognitionSafe();
    stopDictationRecognitionSafe();
    isRecordingTextRef.current = false;
    setIsRecordingText(false);
  };

  const handleSendText = async (overrideText?: string, opts?: { onboardingAutopilot?: boolean }) => {
    if (codeMode) return;
    if (aboutAppActive && !opts?.onboardingAutopilot) return;
    const textToSend = overrideText || inputText;
    if (!textToSend.trim()) return;
    const hasExplicitApproval = /\b(approve|approved|yes|yep|yeah|go ahead|move on|next tab|looks good|locked in|perfect)\b/i.test(
      textToSend
    );
    
    // If it's the first message, ensure Master Plan is open
    if (messages.length <= 1 && (window as any).openMasterPlan) {
      (window as any).openMasterPlan();
    }

    if (modelSettings.capabilities.tier === 'free' && userId !== 'anonymous') {
      try {
        const [usage, pubCfg] = await Promise.all([
          fetchJson<{ remaining?: number | null }>(withProjectQuery('/api/billing/token-usage'), {
            credentials: 'include',
          }),
          fetchNebulaPublicConfig(),
        ]);
        if (
          !pubCfg.freeTierTokenLimitDisabled &&
          usage.remaining != null &&
          usage.remaining <= 0
        ) {
          setMessages((prev) => [...prev, { role: 'system', text: MONTHLY_LIMIT_MESSAGE }]);
          return;
        }
      } catch {
        /* POST /api/grok/chat still enforces Free tier */
      }
    }

    setMessages((prev) => [...prev, { role: 'user', text: textToSend }]);
    if (!opts?.onboardingAutopilot) {
      setInputText('');
    } else {
      setAboutAppInput('');
    }
    setIsLoading(true);
    setChatStatus(
      opts?.onboardingAutopilot
        ? 'Grok 4 is collecting onboarding context and preparing the Master Plan…'
        : 'Grok 4 is analyzing your request…',
    );
    
    // Clear auto-send timer if it was active
    if (autoSendTimerRef.current) {
      clearTimeout(autoSendTimerRef.current);
      autoSendTimerRef.current = null;
    }

    try {
      try {
        const r = await fetch(withProjectQuery('/api/config'));
        const cfg = (await readResponseJson(r)) as { hasMainAiApiKey?: boolean; hasGrokApiKey?: boolean };
        setServerHasGrokKey(r.ok && serverReportsMainAiKey(cfg));
      } catch {
        setServerHasGrokKey(false);
      }

      let latestMP: Record<string, unknown> = {};
      let uiStudioApprovedCode = '';
      let systemPrompt = '';
      if (!opts?.onboardingAutopilot) {
        const [mpWrap, uiWrap] = await Promise.all([
          (async () => {
            try {
              const mpRes = await fetch(withProjectQuery('/api/master-plan/read'));
              const data = await readResponseJson(mpRes);
              if (mpRes.ok) return data as Record<string, unknown>;
            } catch (e) {
              console.warn('Master plan not loaded for prompt:', e);
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
            } catch (e) {
              console.warn('Nebula UI Studio code not loaded for prompt:', e);
            }
            return '';
          })(),
        ]);
        latestMP = mpWrap;
        uiStudioApprovedCode = uiWrap;

        systemPrompt = buildNebulaAssistantSystemPrompt(latestMP, uiStudioApprovedCode);
      }

      // Connect to GROK via Backend Proxy (single body read via fetchJson)
      const grokHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      const grokUserMessageContent = textToSend;

      grokChatAbortRef.current?.abort();
      const chatAbort = new AbortController();
      grokChatAbortRef.current = chatAbort;

      const data = await fetchJson<{
        choices?: { message?: { content?: string; planningPhase?: string } }[];
        claudeFallbackNotice?: string;
      }>(withProjectQuery('/api/grok/chat'), {
        method: 'POST',
        headers: grokHeaders,
        credentials: 'include',
        signal: chatAbort.signal,
        body: JSON.stringify(
          withProjectBody({
            userId,
            projectName,
            chatModel: modelSettings.chatModel,
            onboardingAutopilot: Boolean(opts?.onboardingAutopilot),
            messages: opts?.onboardingAutopilot
              ? [{ role: 'user', content: textToSend }]
              : (() => {
                  const tail = messages.slice(-10);
                  const mapped = tail.map((m, idx, arr) => {
                    const last = idx === arr.length - 1;
                    if (last && m.role === 'user') {
                      return { role: 'user' as const, content: grokUserMessageContent };
                    }
                    return {
                      role: (m.role === 'model' ? 'assistant' : m.role) as 'user' | 'assistant' | 'system',
                      content: m.text,
                    };
                  });
                  return [{ role: 'system' as const, content: systemPrompt }, ...mapped];
                })(),
          }),
        ),
      });
      if (grokChatAbortRef.current === chatAbort) {
        grokChatAbortRef.current = null;
      }
      const rawAssistantContent = data.choices?.[0]?.message?.content || '';
      const planningPhase = data.choices?.[0]?.message?.planningPhase || '';
      const masterPlanSource = planningPhase || rawAssistantContent;
      if (typeof data.claudeFallbackNotice === 'string' && data.claudeFallbackNotice.trim()) {
        setMessages((prev) => [
          ...prev,
          { role: 'system', text: data.claudeFallbackNotice!.trim() },
        ]);
      }
      setChatStatus('Grok 4 response received. Syncing Master Plan updates…');
      void refreshFreeTokenUsage();

      const phaseSync = computePhaseSyncAfterResponse({
        current: swarm.currentPhase,
        planningPhaseRaw: planningPhase,
        rawAssistant: rawAssistantContent,
      });
      if (phaseSync.phaseChanged) {
        swarm.setCurrentPhase(phaseSync.nextPhase);
      }

      // Grok 4 behavior: Immediate Frontend Master Plan Update
      // Guard: during onboarding autopilot / coding handoff, keep Master Plan writes backend-only.
      const backendOnlyMasterPlanTurn =
        Boolean(opts?.onboardingAutopilot) ||
        /<\s*START_CODING\s*>|\bSTART_CODING\b/i.test(masterPlanSource);
      const masterPlanMatch = masterPlanSource.match(/<START_MASTERPLAN>([\s\S]*?)<\/?END_MASTERPLAN>/i);
      if (masterPlanMatch && (window as any).updateMasterPlanSection && !backendOnlyMasterPlanTurn) {
        const newPlanContent = masterPlanMatch[1].trim();
        const parsed = splitMasterPlanSectionsFromBlock(newPlanContent);
        const updatePromises = MASTER_PLAN_TITLES.map(async (_title, i) => {
          const sectionNumber = i + 1;
          const content = (parsed[sectionNumber] ?? '').trim();
          if (content) await (window as any).updateMasterPlanSection(sectionNumber, content);
        });

        await Promise.all(updatePromises);
        try {
          window.dispatchEvent(new CustomEvent('nebula-master-plan-updated'));
        } catch {
          /* ignore */
        }
      } else if (masterPlanMatch && backendOnlyMasterPlanTurn) {
        // Explicit status so user knows this is intentionally backend-only.
        setChatStatus('Master Plan captured in backend only (hidden during first-generation flow).');
      }

      // Grok 4 behavior: Automated Workflow Transitions
      if (masterPlanSource.includes('<APPROVE_MASTERPLAN>') && hasExplicitApproval) {
        if ((window as any).syncMindMapFromMasterPlan) await (window as any).syncMindMapFromMasterPlan();
        if ((window as any).openMindMap) (window as any).openMindMap();
      }
      if (masterPlanSource.includes('<APPROVE_MINDMAP>') && hasExplicitApproval) {
        dispatchOpenUiStudio({ tab: 'mockups' });
      }
      if (masterPlanSource.includes('<APPROVE_UI>') && hasExplicitApproval) {
        if ((window as any).openMasterPlanTab) {
          (window as any).openMasterPlanTab(6);
        } else if ((window as any).openMasterPlan) {
          (window as any).openMasterPlan();
        }
      }

      // Grok 4 behavior: Sync Mind Map from Master Plan when finished
      if (masterPlanSource.includes('<FINISH_MASTERPLAN>') && (window as any).syncMindMapFromMasterPlan) {
        await (window as any).syncMindMapFromMasterPlan();
      }

      const runGoCodePipeline = async (codingSource: string, note?: string) => {
        if ((window as any).openCodingMode) {
          (window as any).openCodingMode('project-execution-rules.md');
        }
        startRealtimeCodingStatus('Grok Code starting implementation');
        setMessages((prev) => [...prev, { role: 'system', text: 'Grok Code started. Building implementation now…' }]);
        const goHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
        const goPayloadMessages = [
          { role: 'assistant' as const, content: codingSource.slice(0, 12000) },
          {
            role: 'user' as const,
            content:
              'START_CODING — begin implementation now. Output file artifacts only (paths + file bodies), no conversational text.',
          },
        ];
        try {
          const goData = await fetchJson<{
            choices?: { message?: { content?: string } }[];
            codeError?: string;
            error?: string;
          }>(withProjectQuery('/api/grok/go-code'), {
            method: 'POST',
            headers: goHeaders,
            credentials: 'include',
            body: JSON.stringify(
              withProjectBody({
                userId,
                projectName,
                messages: goPayloadMessages,
                userNote: note || undefined,
              }),
            ),
          });
          const goText = goData.choices?.[0]?.message?.content?.trim() || '';
          if (goData.error || goData.codeError) {
            stopRealtimeCodingStatus();
            setMessages((prev) => [
              ...prev,
              { role: 'system', text: `Grok Code error: ${goData.error || goData.codeError}` },
            ]);
            setChatStatus('Grok Code failed. Check error details.');
          } else if (goText) {
            try {
              startRealtimeCodingStatus('Applying generated files');
              const apply = await fetchJson<{
                success?: boolean;
                written?: string[];
                skipped?: string[];
                parsedBlocks?: number;
                usedFallbackPath?: string;
                error?: string;
              }>(withProjectQuery('/api/files/apply-generated'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(withProjectBody({ content: goText })),
              });
              if (apply.error) {
                stopRealtimeCodingStatus();
                setMessages((prev) => [
                  ...prev,
                  {
                    role: 'system',
                    text: `Code returned, but files were not applied: ${apply.error}`,
                  },
                ]);
                setChatStatus('Grok returned code, but file apply failed.');
              } else {
                stopRealtimeCodingStatus();
                const writtenCount = Array.isArray(apply.written) ? apply.written.length : 0;
                const skippedCount = Array.isArray(apply.skipped) ? apply.skipped.length : 0;
                setMessages((prev) => [
                  ...prev,
                  {
                    role: 'system',
                    text:
                      writtenCount > 0
                        ? `Applied ${writtenCount} file(s)${skippedCount ? `, skipped ${skippedCount}` : ''}${
                            apply.usedFallbackPath ? ` (fallback path: ${apply.usedFallbackPath})` : ''
                          }.`
                        : 'No file blocks detected in output; nothing was written.',
                  },
                ]);
                setChatStatus(
                  writtenCount > 0
                    ? `Grok Code applied ${writtenCount} file(s).`
                    : 'Grok Code returned text, but no writable file blocks were found.',
                );
              }
            } catch (applyErr: unknown) {
              stopRealtimeCodingStatus();
              const msg = applyErr instanceof Error ? applyErr.message : 'Failed to apply files';
              setMessages((prev) => [...prev, { role: 'system', text: `File apply error: ${msg}` }]);
              setChatStatus('Grok returned code, but apply step failed.');
            }
            // Keep code mode discreet: report status, avoid dumping full generated code into chat.
          } else {
            stopRealtimeCodingStatus();
            setChatStatus('Grok Code started, but returned no output yet.');
          }
        } catch (goErr: unknown) {
          stopRealtimeCodingStatus();
          const msg = goErr instanceof Error ? goErr.message : 'Unknown go-code failure';
          setMessages((prev) => [...prev, { role: 'system', text: `Grok Code start failed: ${msg}` }]);
          setChatStatus('Could not start Grok Code.');
        }
      };

      // Auto-trigger: after Q1 approval, execute project-execution-rules.md with Grok 4.
      if (
        /\bANSWER_Q1\b/i.test(masterPlanSource) &&
        hasExplicitApproval &&
        !q1ExecutionTriggeredRef.current &&
        !/<\s*START_MASTERPLAN\b|\bSTART_CODING\b|<\s*START_CODING\s*>/i.test(masterPlanSource)
      ) {
        q1ExecutionTriggeredRef.current = true;
        setBuildQueue((prev) => [...prev, 'Auto-trigger: running first generation coding']);
        setChatStatus('Grok 4 approved Q1. Running rules and preparing first-generation coding…');
        try {
          const executeData = await fetchJson<{
            choices?: { message?: { content?: string } }[];
          }>(withProjectQuery('/api/grok/execute-project-rules'), {
            method: 'POST',
            headers: grokHeaders,
            credentials: 'include',
            body: JSON.stringify(
              withProjectBody({
                userId,
                projectName,
                messages: [
                  ...messages.slice(-8).map((m) => ({
                    role: m.role === 'model' ? 'assistant' : m.role,
                    content: m.text,
                  })),
                  { role: 'assistant', content: masterPlanSource },
                ],
              }),
            ),
          });
          const autoResponse = executeData.choices?.[0]?.message?.content || '';
          const autoClean = autoResponse
            .replace(/<REASONING>[\s\S]*?<\/REASONING>/g, '')
            .replace(/<GROK_B_SUMMARY_Q([1-6])>[\s\S]*?<\/GROK_B_SUMMARY_Q\1>/g, '')
            .trim();
          const hasCodingTag = /<\s*START_CODING\s*>|\bSTART_CODING\b/i.test(autoResponse);
          if (hasCodingTag) {
            setChatStatus('Coding mode detected. Opening project execution rules in code mode…');
            await runGoCodePipeline(autoResponse, textToSend);
          } else if (autoClean) {
            setMessages((prev) => [
              ...prev,
              { role: 'model', text: autoClean, fullText: autoResponse },
              {
                role: 'system',
                text: 'Rules execution returned planning output only; use Go to start Grok Code if coding has not begun.',
              },
            ]);
          }
        } catch (e: any) {
          console.error('Auto-trigger execution failed:', e);
          setMessages((prev) => [
            ...prev,
            { role: 'system', text: `Auto-trigger failed: ${e?.message || 'Could not execute project rules.'}` },
          ]);
        } finally {
          setBuildQueue((prev) => prev.slice(0, -1));
          window.setTimeout(() => setChatStatus(null), 3000);
        }
      }

      // Grok 4 behavior: Trigger UI/UX Workflow
      if (masterPlanSource.includes('<START_UIUX>')) {
        dispatchStartUiUxWorkflow({ tab: 'design', autoV0: true });
      }

      const uiStudioPromptMatch = masterPlanSource.match(/<NEBULA_UI_STUDIO_PROMPT>([\s\S]*?)<\/NEBULA_UI_STUDIO_PROMPT>/i);
      if (uiStudioPromptMatch) {
        const prompt = uiStudioPromptMatch[1].trim();
        if (prompt) {
          await fetch(withProjectQuery('/api/nebula-ui-studio/prompt'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(withProjectBody({ prompt })),
          }).catch((err) => console.error('Failed to save Nebula UI Studio prompt:', err));
        }
      }

      // Extract reasoning if present
      const reasoningMatch = masterPlanSource.match(/<REASONING>([\s\S]*?)<\/REASONING>/);
      const reasoning = reasoningMatch ? reasoningMatch[1].trim() : undefined;
      
      // Strip ALL tags for display and TTS
      const cleanText = masterPlanSource
        .replace(/<REASONING>[\s\S]*?<\/REASONING>/g, '')
        .replace(/<START_MASTERPLAN>[\s\S]*?<\/?END_MASTERPLAN>/gi, '')
        .replace(/<START_MASTERPLAN>/g, '')
        .replace(/<END_MASTERPLAN>/g, '')
        .replace(/<START_CODING>/g, '')
        .replace(/START_CODING/g, '')
        .replace(/<START_UIUX>/g, '')
        .replace(/<NEBULA_UI_STUDIO_PROMPT>[\s\S]*?<\/NEBULA_UI_STUDIO_PROMPT>/g, '')
        .replace(/<FINISH_MASTERPLAN>/g, '')
        .replace(/<APPROVE_MASTERPLAN>/g, '')
        .replace(/<APPROVE_MINDMAP>/g, '')
        .replace(/<APPROVE_UI>/g, '')
        .replace(/<GROK_B_SUMMARY_Q([1-6])>[\s\S]*?<\/GROK_B_SUMMARY_Q\1>/g, '')
        .replace(/\bANSWER_Q[1-6]\b/g, '')
        .replace(/Already fill up the question tab\./g, '')
        .trim();

      // VOICE (Grok A / TTS): speak after a short delay; skip when this turn is coding-only (Grok 4 must not narrate while shipping code)
      const isCodingTurn = /<\s*START_CODING\s*>|\bSTART_CODING\b/.test(masterPlanSource);
      if (isCodingTurn) {
        setChatStatus('Grok switched to coding mode — running Go Code and applying files…');
        await runGoCodePipeline(masterPlanSource, textToSend);
      }

      if (cleanText && !isCodingTurn) {
        try {
          if (micPostTtsUnlockTimerRef.current != null) {
            window.clearTimeout(micPostTtsUnlockTimerRef.current);
            micPostTtsUnlockTimerRef.current = null;
          }
          if (ttsDebounceTimerRef.current) {
            window.clearTimeout(ttsDebounceTimerRef.current);
            ttsDebounceTimerRef.current = null;
          }
          if (ttsRequestAbortRef.current) {
            ttsRequestAbortRef.current.abort();
            ttsRequestAbortRef.current = null;
          }

          ttsRunIdRef.current += 1;
          const runId = ttsRunIdRef.current;

          if ((window as any).nebula_currentAudio) {
            (window as any).nebula_currentAudio.pause();
            (window as any).nebula_currentAudio.currentTime = 0;
          }
          if (ttsObjectUrlRef.current) {
            URL.revokeObjectURL(ttsObjectUrlRef.current);
            ttsObjectUrlRef.current = null;
          }

          const controller = new AbortController();
          ttsRequestAbortRef.current = controller;
          ttsDebounceTimerRef.current = window.setTimeout(async () => {
            if (runId !== ttsRunIdRef.current) return;

            const chunks = splitTextForTts(cleanText);
            if (chunks.length === 0) return;

            pauseListeningForOutgoingTts();
            isAiSpeakingRef.current = true;
            setIsAiSpeaking(true);

            const resumeIfStillActive = () => {
              if (runId !== ttsRunIdRef.current) return;
              setIsAiSpeaking(false);
              isAiSpeakingRef.current = false;
              (window as any).nebula_currentAudio = null;
              if (ttsObjectUrlRef.current) {
                URL.revokeObjectURL(ttsObjectUrlRef.current);
                ttsObjectUrlRef.current = null;
              }
              resumeListeningAfterOutgoingTtsRef.current();
            };

            try {
              for (let i = 0; i < chunks.length; i++) {
                if (runId !== ttsRunIdRef.current || controller.signal.aborted) {
                  resumeIfStillActive();
                  return;
                }
                const speakRes = await fetch('/api/speak', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ text: chunks[i] }),
                  signal: controller.signal,
                });
                if (!speakRes.ok) {
                  const errBody = await speakRes.text();
                  throw new Error(`TTS request failed (${speakRes.status}): ${errBody.slice(0, 140)}`);
                }
                const audioBlob = await speakRes.blob();
                const audioUrl = URL.createObjectURL(audioBlob);
                if (ttsObjectUrlRef.current) URL.revokeObjectURL(ttsObjectUrlRef.current);
                ttsObjectUrlRef.current = audioUrl;

                await new Promise<void>((resolve) => {
                  if (runId !== ttsRunIdRef.current) {
                    URL.revokeObjectURL(audioUrl);
                    resolve();
                    return;
                  }
                  const audio = new Audio(audioUrl);
                  (window as any).nebula_currentAudio = audio;
                  let finished = false;
                  const done = () => {
                    if (finished) return;
                    finished = true;
                    ttsChunkPlayResolveRef.current = null;
                    try {
                      URL.revokeObjectURL(audioUrl);
                    } catch {
                      /* ignore */
                    }
                    if (ttsObjectUrlRef.current === audioUrl) ttsObjectUrlRef.current = null;
                    resolve();
                  };
                  ttsChunkPlayResolveRef.current = done;
                  audio.onended = done;
                  audio.onerror = done;
                  audio.play().catch((e) => {
                    if (e?.name !== 'AbortError') {
                      console.error('[TTS] Playback error:', e);
                    }
                    done();
                  });
                });
              }

              resumeIfStillActive();
            } catch (audioErr: unknown) {
              const stale = runId !== ttsRunIdRef.current;
              const aborted = (audioErr as { name?: string })?.name === 'AbortError';
              if (!stale && !aborted) {
                console.error('[TTS] Chunked speech failed:', audioErr);
              }
              if (!stale) {
                setIsAiSpeaking(false);
                isAiSpeakingRef.current = false;
                (window as any).nebula_currentAudio = null;
                if (ttsObjectUrlRef.current) {
                  URL.revokeObjectURL(ttsObjectUrlRef.current);
                  ttsObjectUrlRef.current = null;
                }
                resumeListeningAfterOutgoingTtsRef.current();
              }
            }
          }, TTS_START_DEBOUNCE_MS);
        } catch (audioErr) {
          if ((audioErr as any)?.name !== 'AbortError') {
            console.error("[TTS] Audio initialization failed:", audioErr);
          }
          setIsAiSpeaking(false);
          isAiSpeakingRef.current = false;
        }
      }

      if (!isCodingTurn && cleanText) {
        setMessages((prev) => [
          ...prev,
          { role: 'model', text: cleanText, fullText: planningPhase || rawAssistantContent, reasoning },
        ]);
      }

      if (opts?.onboardingAutopilot) {
        try {
          localStorage.setItem(ONBOARDING_DONE_KEY, '1');
        } catch {
          /* ignore */
        }
        setAboutAppActive(false);
        setChatStatus('Automatic planning finished. Review Master Plan and code mode if opened.');
        window.setTimeout(() => setChatStatus(null), 6000);
      } else if (!isCodingTurn) {
        setChatStatus('Grok response complete.');
        window.setTimeout(() => setChatStatus(null), 2000);
      }
    } catch (error: any) {
      stopRealtimeCodingStatus();
      const isAbort =
        error?.name === 'AbortError' ||
        (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError');
      if (isAbort) {
        grokChatAbortRef.current = null;
        setChatStatus(null);
        if (opts?.onboardingAutopilot) {
          setAboutAppActive(false);
        }
        return;
      }
      grokChatAbortRef.current = null;
      console.error("GROK API Error:", error);
      if (opts?.onboardingAutopilot) {
        setAboutAppActive(false);
      }
      const rawMsg = typeof error?.message === 'string' ? error.message : 'Failed to connect to GROK.';
      const isKeyHelp =
        rawMsg.includes('Grok API key') ||
        rawMsg.includes('Please add your Grok') ||
        rawMsg.includes('401') ||
        rawMsg.includes('rejected this API key');
      const displayMsg =
        isKeyHelp
          ? rawMsg.replace(/\n\n+/g, '\n\n')
          : rawMsg.includes('monthly limit') || rawMsg.includes('Upgrade to Pro')
            ? rawMsg
            : `Error: ${rawMsg}`;
      setMessages((prev) => [...prev, { role: 'system', text: displayMsg }]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    return () => stopRealtimeCodingStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAboutAppGo = () => {
    const answer = aboutAppInput.trim();
    if (!answer || isLoading || codeMode) return;
    if ((window as any).openMasterPlan) (window as any).openMasterPlan();
    setChatStatus('Running full automatic planning and coding on the server…');
    void handleSendText(answer, { onboardingAutopilot: true });
  };

  /** Go: Grok 4 writes only a short summary to master-plan.json, then Grok Code implements. */
  const handleGoCode = async () => {
    if (codeMode || isLoading) return;
    const userNote = inputText.trim();
    try {
      const r = await fetch(withProjectQuery('/api/config'));
      const cfg = (await readResponseJson(r)) as { hasGrokApiKey?: boolean };
      setServerHasGrokKey(r.ok && Boolean(cfg.hasGrokApiKey));
    } catch {
      setServerHasGrokKey(false);
    }

    if ((window as any).openMasterPlan) (window as any).openMasterPlan();

    setMessages((prev) => [
      ...prev,
      {
        role: 'user',
        text: userNote ? `Go — Grok Code (${userNote.slice(0, 200)}${userNote.length > 200 ? '…' : ''})` : 'Go — Grok Code',
      },
    ]);
    setInputText('');
    setIsLoading(true);
    setChatStatus('Grok 4: writing short Master Plan summary only, then Grok Code…');

    const grokHeaders: Record<string, string> = { 'Content-Type': 'application/json' };

    const payloadMessages = [
      {
        role: 'user' as const,
        content:
          userNote && userNote.trim()
            ? `START_CODING — implement now. Session focus: ${userNote}. Output file artifacts only (paths + file bodies), no conversation.`
            : 'START_CODING — implement now per project-execution-rules.md and master-plan.json. Output file artifacts only (paths + file bodies), no conversation.',
      },
    ];

    try {
      const data = await fetchJson<{
        preCodingSummary?: string;
        summarySaved?: boolean;
        codeError?: string;
        choices?: { message?: { content?: string } }[];
        error?: string;
      }>(withProjectQuery('/api/grok/go-code'), {
        method: 'POST',
        headers: grokHeaders,
        credentials: 'include',
        body: JSON.stringify(
          withProjectBody({
            userId,
            projectName,
            userNote: userNote || undefined,
            messages: payloadMessages,
          }),
        ),
      });

      if (data.error && !data.summarySaved) {
        setMessages((prev) => [...prev, { role: 'system', text: data.error || 'Go failed.' }]);
        setChatStatus(null);
        return;
      }

      setChatStatus('Master Plan updated — opening code mode with Grok Code output…');
      try {
        window.dispatchEvent(new CustomEvent('nebula-master-plan-updated'));
      } catch {
        /* ignore */
      }

      const codeText = data.choices?.[0]?.message?.content || '';
      const cleanCode = codeText
        .replace(/<REASONING>[\s\S]*?<\/REASONING>/gi, '')
        .replace(/<START_MASTERPLAN>[\s\S]*?<\/START_MASTERPLAN>/gi, '')
        .trim();

      if (data.codeError) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'system',
            text: `Summary saved to Master Plan. Grok Code error: ${data.codeError.slice(0, 400)}`,
          },
        ]);
      }

      if (cleanCode) {
        setChatStatus('Grok Code returned output. Applying file changes…');
        try {
          const apply = await fetchJson<{
            success?: boolean;
            written?: string[];
            skipped?: string[];
            parsedBlocks?: number;
            usedFallbackPath?: string;
            error?: string;
          }>(withProjectQuery('/api/files/apply-generated'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(withProjectBody({ content: cleanCode })),
          });
          if (apply.error) {
            setMessages((prev) => [
              ...prev,
              { role: 'system', text: `Code returned, but files were not applied: ${apply.error}` },
            ]);
            setChatStatus('Grok returned code, but file apply failed.');
          } else {
            const writtenCount = Array.isArray(apply.written) ? apply.written.length : 0;
            const skippedCount = Array.isArray(apply.skipped) ? apply.skipped.length : 0;
            setMessages((prev) => [
              ...prev,
              {
                role: 'system',
                text:
                  writtenCount > 0
                    ? `Applied ${writtenCount} file(s)${skippedCount ? `, skipped ${skippedCount}` : ''}${
                        apply.usedFallbackPath ? ` (fallback path: ${apply.usedFallbackPath})` : ''
                      }.`
                    : 'No file blocks detected in output; nothing was written.',
              },
            ]);
            setChatStatus(
              writtenCount > 0
                ? `Grok Code applied ${writtenCount} file(s).`
                : 'Grok Code returned text, but no writable file blocks were found.',
            );
          }
        } catch (applyErr: unknown) {
          const msg = applyErr instanceof Error ? applyErr.message : 'Failed to apply files';
          setMessages((prev) => [...prev, { role: 'system', text: `File apply error: ${msg}` }]);
          setChatStatus('Grok returned code, but apply step failed.');
        }
      } else if (!data.codeError) {
        setMessages((prev) => [...prev, { role: 'system', text: 'Grok Code returned empty output.' }]);
      }

      if ((window as any).openCodingMode) {
        (window as any).openCodingMode('project-execution-rules.md');
      }

      try {
        const mpRes = await fetch(withProjectQuery('/api/master-plan/read'));
        const mpData = await readResponseJson(mpRes);
        if (mpRes.ok) setMasterPlan(mpData);
      } catch {
        /* ignore */
      }

      setChatStatus(
        data.summarySaved
          ? 'Done — short summary saved under “Pre-coding summary (Grok)”; code shown above.'
          : 'Done.',
      );
      window.setTimeout(() => setChatStatus(null), 5000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Go failed.';
      setMessages((prev) => [...prev, { role: 'system', text: msg }]);
      setChatStatus(null);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleLive = () => {
    if (codeMode) return;
    if (isLiveRef.current) {
      disconnectLive();
    } else {
      if ((window as any).openMasterPlan) (window as any).openMasterPlan();
      connectLive();
      
      // If it's the start of a conversation, trigger an initial suggestion (skip during About App onboarding)
      if (messages.length <= 1 && !aboutAppActive) {
        handleSendText(
          "I'm ready. Follow project-execution-rules.md §4: ask only your first single discovery question about my app (one question in your reply).",
        );
      }
    }
  };

  const nebulaWindowApiRef = useRef({ handleSendText, toggleLive });
  nebulaWindowApiRef.current = { handleSendText, toggleLive };

  useEffect(() => {
    (window as any).nebula_handleSendText = (text: string) => {
      void nebulaWindowApiRef.current.handleSendText(text);
    };
    (window as any).nebula_toggleLive = () => {
      nebulaWindowApiRef.current.toggleLive();
    };
    return () => {
      delete (window as any).nebula_handleSendText;
      delete (window as any).nebula_toggleLive;
    };
  }, []);

  useEffect(() => {
    // 1. Handle auto-start chat (Brainstorm mode)
    const autoStart = localStorage.getItem('nebula_auto_start_chat');
    if (autoStart === 'true') {
      localStorage.removeItem('nebula_auto_start_chat');
      toggleLive();
    }

    // 2. Handle initial prompt (bypass About App card)
    const initialPrompt = localStorage.getItem('nebula_initial_prompt');
    if (initialPrompt) {
      localStorage.removeItem('nebula_initial_prompt');
      try {
        localStorage.setItem(ONBOARDING_DONE_KEY, '1');
      } catch {
        /* ignore */
      }
      setAboutAppActive(false);
      if ((window as any).openMasterPlan) (window as any).openMasterPlan();
      handleSendText(initialPrompt);
    }

    // 3. Handle GitHub import
    const githubRepo = localStorage.getItem('nebula_github_import');
    if (githubRepo) {
      localStorage.removeItem('nebula_github_import');
      try {
        localStorage.setItem(ONBOARDING_DONE_KEY, '1');
      } catch {
        /* ignore */
      }
      setAboutAppActive(false);
      handleSendText(`I want to clone and analyze this GitHub repository: ${githubRepo}`);
    }
  }, []);

  useEffect(() => {
    if ('webkitSpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onresult = (event: any) => {
        if (isAiSpeakingRef.current) return;
        const transcript = event.results[0][0].transcript;
        setInputText((prev) => prev + (prev ? ' ' : '') + transcript);
      };

      recognition.onend = () => {
        isRecordingTextRef.current = false;
        setIsRecordingText(false);
        resumeLiveAfterDictationEndsRef.current();
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        isRecordingTextRef.current = false;
        setIsRecordingText(false);
        resumeLiveAfterDictationEndsRef.current();
      };

      dictationRecognitionRef.current = recognition;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (ttsDebounceTimerRef.current) window.clearTimeout(ttsDebounceTimerRef.current);
      if (ttsRequestAbortRef.current) ttsRequestAbortRef.current.abort();
      if (ttsObjectUrlRef.current) URL.revokeObjectURL(ttsObjectUrlRef.current);
    };
  }, []);

  const toggleTextRecording = () => {
    if (isAiSpeakingRef.current) return;
    if (isRecordingText) {
      stopDictationRecognitionSafe();
      isRecordingTextRef.current = false;
      setIsRecordingText(false);
      resumeLiveSttAfterDictationEnds();
    } else {
      isRecordingTextRef.current = true;
      if (isLiveRef.current && liveRecognitionRef.current) {
        stopLiveRecognitionSafe();
      }
      try {
        dictationRecognitionRef.current?.start();
        setIsRecordingText(true);
      } catch (e) {
        isRecordingTextRef.current = false;
        console.warn('Dictation start failed', e);
        resumeLiveSttAfterDictationEnds();
      }
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const autoSendTimerRef = useRef<NodeJS.Timeout | null>(null);

  const startAudioCapture = async () => {
    try {
      if (!('webkitSpeechRecognition' in window)) {
        throw new Error('Speech recognition not supported in this browser.');
      }

      if (isAiSpeakingRef.current) {
        deferredLiveRecognitionStartRef.current = true;
        isLiveRef.current = true;
        setIsLive(true);
        return;
      }

      deferredLiveRecognitionStartRef.current = false;

      if (liveRecognitionRef.current) {
        try {
          liveRecognitionRef.current.stop();
        } catch {
          /* ignore */
        }
        liveRecognitionRef.current = null;
      }

      const SpeechRecognition = (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onresult = (event: any) => {
        if (isAiSpeakingRef.current) return;
        if (autoSendTimerRef.current) {
          clearTimeout(autoSendTimerRef.current);
          autoSendTimerRef.current = null;
        }

        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }

        if (finalTranscript) {
          setInputText((prev) => prev + (prev ? ' ' : '') + finalTranscript);
        }

        autoSendTimerRef.current = setTimeout(() => {
          const currentText = (document.getElementById('assistant-input') as HTMLTextAreaElement)?.value;
          if (currentText && currentText.trim()) {
            handleSendText(currentText);
          }
        }, VOICE_SILENCE_BEFORE_SEND_MS);
      };

      recognition.onend = () => {
        if (
          isLiveRef.current &&
          !isAiSpeakingRef.current &&
          !isRecordingTextRef.current
        ) {
          try {
            recognition.start();
          } catch (e) {
            console.warn('Speech recognition restart failed', e);
          }
        }
      };

      stopDictationRecognitionSafe();
      setIsRecordingText(false);
      isRecordingTextRef.current = false;

      recognition.start();
      liveRecognitionRef.current = recognition;
      isLiveRef.current = true;
      setIsLive(true);
    } catch (err: any) {
      console.error('Failed to start hands-free mode', err);
      let errorMsg = 'Failed to start hands-free mode.';
      if (err.name === 'NotAllowedError' || err.message.includes('Permission denied')) {
        errorMsg = 'Microphone permission denied. Please allow microphone access.';
      }
      setMessages((prev) => [...prev, { role: 'system', text: errorMsg }]);
      isLiveRef.current = false;
      setIsLive(false);
      deferredLiveRecognitionStartRef.current = false;
    }
  };

  const stopAudioCapture = () => {
    isLiveRef.current = false;
    deferredLiveRecognitionStartRef.current = false;
    resumeLiveAfterTtsRef.current = false;
    if (autoSendTimerRef.current) {
      clearTimeout(autoSendTimerRef.current);
      autoSendTimerRef.current = null;
    }
    stopLiveRecognitionSafe();
    liveRecognitionRef.current = null;
  };

  resumeLiveAfterDictationEndsRef.current = resumeLiveSttAfterDictationEnds;

  function resumeMicChannelsAfterTts() {
    if (isLiveRef.current) {
      if (deferredLiveRecognitionStartRef.current) {
        deferredLiveRecognitionStartRef.current = false;
        void startAudioCapture();
      } else if (resumeLiveAfterTtsRef.current) {
        resumeLiveAfterTtsRef.current = false;
        try {
          liveRecognitionRef.current?.start();
        } catch (e) {
          console.warn('Live recognition resume failed', e);
        }
      } else {
        resumeLiveAfterTtsRef.current = false;
      }
    } else {
      resumeLiveAfterTtsRef.current = false;
      deferredLiveRecognitionStartRef.current = false;
    }

    if (resumeDictationAfterTtsRef.current) {
      resumeDictationAfterTtsRef.current = false;
      isRecordingTextRef.current = true;
      if (isLiveRef.current && liveRecognitionRef.current) {
        stopLiveRecognitionSafe();
      }
      try {
        dictationRecognitionRef.current?.start();
        setIsRecordingText(true);
      } catch (e) {
        isRecordingTextRef.current = false;
        console.warn('Dictation resume failed', e);
        resumeLiveSttAfterDictationEnds();
      }
    }
  }

  resumeListeningAfterOutgoingTtsRef.current = () => {
    if (micPostTtsUnlockTimerRef.current != null) {
      window.clearTimeout(micPostTtsUnlockTimerRef.current);
      micPostTtsUnlockTimerRef.current = null;
    }
    micPostTtsUnlockTimerRef.current = window.setTimeout(() => {
      micPostTtsUnlockTimerRef.current = null;
      resumeMicChannelsAfterTts();
    }, MIC_REENABLE_AFTER_TTS_MS);
  };

  const connectLive = async () => {
    try {
      setMessages(prev => [...prev, { role: 'system', text: 'Hands-free mode active. I auto-send after ~2.5s silence at the end of your turn. Tap Hand (interrupt) to cancel audio or a pending send; use Revert on a user bubble to undo that send and edit.' }]);
      startAudioCapture();
    } catch (err: any) {
      console.error("Failed to connect", err);
      setMessages(prev => [...prev, { role: 'system', text: 'Failed to start conversation mode.' }]);
    }
  };

  const disconnectLive = () => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    isLiveRef.current = false;
    setIsLive(false);
    stopAudioCapture();
  };

  useEffect(() => {
    if (codeMode) disconnectLive();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to codeMode gate
  }, [codeMode]);

  const interruptAiSpeech = () => {
    grokChatAbortRef.current?.abort();
    grokChatAbortRef.current = null;
    if (autoSendTimerRef.current) {
      clearTimeout(autoSendTimerRef.current);
      autoSendTimerRef.current = null;
    }
    ttsRunIdRef.current += 1;
    ttsChunkPlayResolveRef.current?.();
    if (ttsDebounceTimerRef.current) {
      window.clearTimeout(ttsDebounceTimerRef.current);
      ttsDebounceTimerRef.current = null;
    }
    if (ttsRequestAbortRef.current) {
      ttsRequestAbortRef.current.abort();
      ttsRequestAbortRef.current = null;
    }
    const w = window as any;
    const audio = w.nebula_currentAudio;
    w.nebula_currentAudio = null;
    if (audio) {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
    if (ttsObjectUrlRef.current) {
      URL.revokeObjectURL(ttsObjectUrlRef.current);
      ttsObjectUrlRef.current = null;
    }
    setIsAiSpeaking(false);
    isAiSpeakingRef.current = false;
    if (micPostTtsUnlockTimerRef.current != null) {
      window.clearTimeout(micPostTtsUnlockTimerRef.current);
      micPostTtsUnlockTimerRef.current = null;
    }
    resumeMicChannelsAfterTts();
  };

  const stopRealtimeCodingStatus = () => {
    if (codingStatusTimerRef.current) {
      window.clearInterval(codingStatusTimerRef.current);
      codingStatusTimerRef.current = null;
    }
  };

  const startRealtimeCodingStatus = (label: string) => {
    stopRealtimeCodingStatus();
    const startedAt = Date.now();
    setChatStatus(`${label} • 0s`);
    codingStatusTimerRef.current = window.setInterval(() => {
      const elapsed = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
      setChatStatus(`${label} • ${elapsed}s`);
    }, 1000);
  };

  const showGrokSetupHint = serverHasGrokKey === false;

  const handleRevertMessage = (idx: number) => {
    if (codeMode) return;
    const target = messages[idx];
    if (!target || target.role !== 'user') return;
    interruptAiSpeech();
    setInputText(target.text);
    setMessages((prev) => prev.slice(0, idx));
    setIsLoading(false);
    setChatStatus(null);
  };

  return (
    <aside className="flex shrink-0 flex-col border-l border-border bg-card/50 backdrop-blur-md" style={{ width }}>
      <div className="flex flex-col gap-2 border-b border-border bg-card/40 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-13 font-headline text-foreground no-bold">Assistant</span>
            {isLive && <span className="flex h-2 w-2 shrink-0 animate-pulse rounded-full bg-primary" />}
          </div>
        </div>
        <ChatModelSelector />
        {freeTokenUsage ? (
          <div className="space-y-1 border-t border-border/60 pt-1">
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Monthly tokens (Free)</span>
              <span className="tabular-nums text-muted-foreground/90">
                {freeTokenUsage.used.toLocaleString()} / {freeTokenUsage.limit.toLocaleString()}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-cyan-500/70 transition-[width]"
                style={{
                  width: `${Math.min(100, Math.round((freeTokenUsage.used / freeTokenUsage.limit) * 100))}%`,
                }}
              />
            </div>
          </div>
        ) : null}
      </div>
      
      {buildQueue.length > 0 && (
        <div className="px-4 py-2 bg-cyan-900/20 border-b border-cyan-500/20 flex flex-col gap-1">
          <span className="text-[10px] text-cyan-400 font-headline uppercase tracking-wider">Build Queue ({buildQueue.length})</span>
          <span className="text-xs text-slate-300 truncate">{buildQueue[buildQueue.length - 1]}</span>
        </div>
      )}

      {(chatStatus || isLoading) ? (
        <div className="shrink-0 px-4 py-1.5 border-b border-white/5 bg-black/25">
          <p className="text-[10px] leading-snug text-slate-500 font-mono">
            {chatStatus || 'Grok is working…'}
          </p>
        </div>
      ) : null}

      <SwarmStatusBar />

      {!aboutAppActive && showGrokSetupHint ? (
        <div
          className="shrink-0 border-b border-amber-500/40 bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-transparent px-4 py-3"
          role="status"
        >
          <p className="text-xs font-headline tracking-wide text-amber-100">Grok is not configured on the server</p>
          <p className="mt-1 text-[11px] leading-relaxed text-amber-50/95">{MAIN_AI_CHAT_SETUP_HINT}</p>
          {serverHasGrokKey === null ? (
            <p className="mt-1 text-[10px] text-amber-200/70">Checking server configuration…</p>
          ) : null}
        </div>
      ) : null}

      <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-4">
        {!codeMode && aboutAppActive ? (
          <div className="rounded-xl border border-cyan-500/25 bg-cyan-950/20 p-4 space-y-3 shrink-0">
            <h3 className="text-sm font-headline text-cyan-200 tracking-wide">About App</h3>
            <p className="text-13 text-slate-300 leading-relaxed">
              What&apos;s the main thing your app should do—if you had to describe it in one core feature, what would it be?
            </p>
            <textarea
              value={aboutAppInput}
              onChange={(e) => setAboutAppInput(e.target.value)}
              disabled={isLoading}
              rows={5}
              className="w-full min-h-[6rem] max-h-[50vh] resize rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-13 text-slate-200 focus:border-cyan-500/45 focus:outline-none focus:ring-1 focus:ring-cyan-500/25 disabled:opacity-50"
              placeholder="Describe your core feature…"
              aria-label="About your app"
            />
            <p className="text-[10px] text-slate-500 leading-snug">
              Press <strong className="text-cyan-400/90">Go</strong> to run Master Plan + coding on the server in one step (no extra questions). You can reset this card from browser devtools by removing localStorage key{' '}
              <code className="text-cyan-500/80">{ONBOARDING_DONE_KEY}</code> if needed.
            </p>
            <button
              type="button"
              onClick={handleAboutAppGo}
              disabled={isLoading || !aboutAppInput.trim()}
              className="w-full flex items-center justify-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/15 py-2.5 text-sm font-headline text-emerald-100 hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Rocket className="w-4 h-4 shrink-0" aria-hidden />
              Go — automatic development
            </button>
          </div>
        ) : null}
        {codeMode ? <div className="h-1" /> : null}
        {!aboutAppActive &&
          messages.map((msg, idx) => (
          <div key={idx} className={`p-3 rounded-xl max-w-[90%] border ${
            msg.role === 'user' 
              ? 'bg-white/5 rounded-tr-none self-end border-white/5 text-slate-300' 
              : msg.role === 'system'
              ? 'bg-cyan-900/20 rounded-xl self-center border-cyan-500/20 text-cyan-300 text-xs text-center w-full'
              : 'bg-secondary-container/10 rounded-tl-none self-start border-secondary-dim/10 text-secondary'
          }`}>
            {msg.role === 'model' ? (
              <div className="flex flex-col gap-2">
                <div className="text-13 no-bold prose prose-invert prose-sm max-w-none prose-pre:bg-black/40 prose-pre:border prose-pre:border-white/10 prose-pre:p-2 prose-pre:rounded-md">
                  <ReactMarkdown>{msg.text}</ReactMarkdown>
                </div>
                {msg.reasoning && (
                  <details className="mt-2 border-t border-white/5 pt-2 group">
                    <summary className="text-[10px] text-slate-500 cursor-pointer hover:text-slate-400 uppercase tracking-widest font-headline list-none flex items-center gap-1">
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform group-open:rotate-180" aria-hidden />
                      Reasoning
                    </summary>
                    <div className="mt-2 text-[11px] text-slate-500 font-mono bg-white/5 p-2 rounded border border-white/5 whitespace-pre-wrap">
                      {msg.reasoning}
                    </div>
                  </details>
                )}
              </div>
            ) : msg.role === 'user' ? (
              <div className="flex flex-col gap-2 items-end">
                <p className="text-13 no-bold whitespace-pre-wrap w-full">{msg.text}</p>
                <button
                  type="button"
                  onClick={() => handleRevertMessage(idx)}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-headline text-slate-400 transition-colors hover:border-cyan-500/30 hover:bg-cyan-500/10 hover:text-cyan-200"
                  title="Remove this message and everything after it; restore this text to the input. Cancels a pending Grok reply if still loading."
                >
                  Revert
                </button>
              </div>
            ) : (
              <p className="text-13 no-bold whitespace-pre-wrap">{msg.text}</p>
            )}
          </div>
        ))}
        {!aboutAppActive && isLoading && (
          <div className="flex items-start gap-3 mb-6 animate-pulse">
            <div className="w-8 h-8 rounded-full bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
              <Logo className="w-4 h-4" alt="" />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-headline text-cyan-500 uppercase tracking-widest">Nebula is thinking...</span>
              <div className="flex gap-1 mt-1">
                <div className="w-1.5 h-1.5 bg-cyan-500/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 bg-cyan-500/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 bg-cyan-500/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        {!aboutAppActive && <div ref={messagesEndRef} />}
      </div>

      <div className="shrink-0 border-t border-border bg-card/60 p-3 backdrop-blur-sm">
        {showGrokSetupHint && (
          <p className="mb-2 text-[10px] leading-snug text-amber-100/95 border border-amber-500/30 bg-amber-500/10 rounded-lg px-2 py-1.5">
            {MAIN_AI_CHAT_SETUP_HINT}
          </p>
        )}
        <div
          className={`flex flex-col gap-2 rounded-xl border border-border bg-background/80 p-2 shadow-sm ${aboutAppActive ? 'pointer-events-none opacity-40' : ''}`}
        >
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*,.svg,.pdf,.json,.webp,.png,.jpg,.jpeg,.gif"
            onChange={(e) => void handleFileSelected(e)}
            aria-hidden
            tabIndex={-1}
          />
          <textarea
            id="assistant-input"
            name="assistant-input"
            value={inputText}
            disabled={codeMode || aboutAppActive || uploadBusy}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSendText();
              }
            }}
            className="min-h-[5rem] max-h-[55vh] w-full resize-y rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-13 text-foreground no-bold placeholder:text-muted-foreground transition-colors focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-40"
            placeholder={
              codeMode
                ? 'Development running…'
                : isLive
                  ? 'Listening or type here…'
                  : 'Message the assistant…'
            }
            aria-label="Chat message"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={handleFileAttachClick}
                disabled={codeMode || uploadBusy}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:border-ring/50 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-35"
                title={uploadBusy ? 'Uploading…' : 'Attach file (Cloudflare R2)'}
              >
                <Paperclip className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
              </button>
              <button
                type="button"
                onClick={toggleTextRecording}
                disabled={codeMode || isAiSpeaking || isLoading}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-35 ${
                  isRecordingText
                    ? 'border-destructive/40 bg-destructive/15 text-destructive'
                    : 'border-border bg-card text-muted-foreground hover:border-ring/50 hover:bg-muted hover:text-foreground'
                }`}
                title={
                  isAiSpeaking
                    ? 'Mic paused while Grok is speaking (TTS)'
                    : isRecordingText
                      ? 'Stop dictation'
                      : isLive
                        ? 'Dictate text (hands-free pauses while dictating)'
                        : 'Dictate text'
                }
              >
                <Mic className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
              </button>
              <button
                type="button"
                onClick={toggleLive}
                disabled={codeMode}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-35 ${
                  isLive
                    ? 'border-destructive/35 bg-destructive/10 text-destructive'
                    : 'border-border bg-card text-muted-foreground hover:border-ring/50 hover:bg-muted hover:text-foreground'
                }`}
                title={isLive ? 'End talk (hands-free)' : 'Start talk (hands-free)'}
              >
                <VoiceLinesIcon className="h-4 w-4 shrink-0" active={isLive} />
              </button>
              <button
                type="button"
                onClick={interruptAiSpeech}
                disabled={codeMode}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:border-amber-500/40 hover:bg-amber-500/10 hover:text-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30 disabled:cursor-not-allowed disabled:opacity-35"
                title="Interrupt speech and listen again"
              >
                <Hand className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleGoCode()}
                disabled={codeMode || isLoading}
                title="Go: Grok 4 writes a short summary to Master Plan only, then Grok Code runs"
                aria-label="Go: Grok 4 summary then Grok Code"
                className="flex h-9 shrink-0 items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 text-[11px] font-headline text-emerald-100 transition-colors hover:border-emerald-400/60 hover:bg-emerald-500/25 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40 disabled:cursor-not-allowed disabled:opacity-35"
              >
                <Rocket className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                Go
              </button>
              <button
                type="button"
                onClick={() => void handleSendText()}
                disabled={codeMode || isLoading || !inputText.trim()}
                title="Send message"
                aria-busy={isLoading}
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed ${
                  isLoading
                    ? 'border-primary/50 bg-primary/20 text-primary'
                    : inputText.trim()
                      ? 'border-primary bg-primary text-primary-foreground shadow-md shadow-primary/25 hover:bg-primary/90'
                      : 'border-border bg-muted text-muted-foreground'
                }`}
              >
                {isLoading ? (
                  <span
                    className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground"
                    aria-hidden
                  />
                ) : (
                  <ArrowUp className="h-5 w-5 shrink-0" strokeWidth={2.25} aria-hidden />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
