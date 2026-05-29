import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, Hand, Mic, Paperclip, Rocket, Send, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchSessionUser } from '../../lib/nebulaCloud';
import {
  FREE_TIER_MONTHLY_LIMIT_MESSAGE,
  isMonthlyUsageLimitError,
  MAIN_AI_CHAT_SETUP_HINT,
  serverReportsMainAiKey,
} from '../../lib/grokKey';
import { readResponseJson } from '../../lib/apiFetch';
import { getBrowserProjectName, withProjectBody, withProjectQuery } from '../../lib/nebulaProjectApi';
import { sendIdeAssistantGrokTurn } from '../../lib/ideAssistantGrokChat';
import {
  formatAssistantForIdeChatDisplay,
  persistMasterPlanFromAssistantSource,
} from '../../lib/grokChatArtifacts';
import { dispatchOpenUiStudio, dispatchStartUiUxWorkflow } from '../../lib/nebulaUiStudioEvents';
import {
  handlePostGrokCodingTurn,
  isCodingIntent,
  runGoCodeAndApply,
} from '../../lib/nebulaGrokCodingPipeline';
import { syncActiveCloudProjectFromSession } from '../../lib/nebulaCloud';
import { runMasterPlanUiPipeline, runPostCodingWorkspaceSync } from '../../lib/ideArtifactSync';
import {
  clearIdeWorkspaceMetaCache,
  detectBuildModeIntent,
  fetchIdeWorkspaceMeta,
} from '../../lib/ideWorkspaceChatContext';
import { ideContextSnippetForChat, useIdeWorkspace } from '@/components/ide/IdeWorkspaceContext';
import {
  advanceGrokActivity,
  createGrokActivity,
  errorGrokActivity,
  finishGrokActivity,
  setGrokActivityAction,
  startGrokActivityWaitTicker,
  type GrokActivityProgressFn,
  type GrokActivityStatus,
} from '../../lib/ideGrokActivityStatus';
import { IdeGrokActivityPanel } from '@/components/ide/IdeGrokActivityPanel';
import {
  MIC_REENABLE_AFTER_TTS_MS,
  splitTextForTts,
  stripAssistantTagsForVoice,
  TTS_START_DEBOUNCE_MS,
  VOICE_SILENCE_BEFORE_SEND_MS,
} from '../../lib/voiceTtsShared';

const IDLE_GROK_ACTIVITY: GrokActivityStatus = {
  headline: 'Ready',
  subhead: 'Chat for discovery and planning · Go runs Grok Code and writes files to your workspace.',
  liveLog: [],
  steps: [],
  activeStepIndex: 0,
  footer: 'Live activity appears here while Grok is thinking or coding — like Cursor’s agent status.',
  tone: 'ready',
};

const CHAT_WORK_STEPS = [
  { label: 'Send your message to Grok' },
  { label: 'Grok reads Master Plan, file index, and workspace context' },
  { label: 'Save Master Plan sections to project tabs' },
  { label: 'Update mind map & UI Studio pipeline (when plan changes)' },
  { label: 'Run Grok Code and apply files (when building)' },
  { label: 'Sync explorer, mind map, and preview' },
];

const GO_WORK_STEPS = [
  { label: 'Load workspace & Master Plan context' },
  { label: 'Grok writes pre-coding summary to Master Plan' },
  { label: 'Grok Code generates implementation files' },
  { label: 'Write files to your cloud project folder' },
  { label: 'Refresh mind map & run v0 UI when configured' },
];

/** WebKit speech types (not always present in TS `lib` for this project). */
type IdeSpeechRecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type IdeSpeechRecognitionResultList = { length: number; [index: number]: IdeSpeechRecognitionResult };
type IdeSpeechRecognitionEvent = { resultIndex: number; results: IdeSpeechRecognitionResultList };
type IdeSpeechRecognitionErrorEvent = { error: string };
type IdeSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: IdeSpeechRecognitionEvent) => void) | null;
  onerror: ((event: IdeSpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
};

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
};

function SoundWaveIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn('h-[18px] w-[18px]', className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M8 9v6" />
      <path d="M12 6v12" />
      <path d="M16 10v4" />
    </svg>
  );
}

function ChatRoundButton({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="btn-secondary-surface flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground ring-1 ring-[color-mix(in_srgb,var(--outline-variant)_12%,transparent)] transition-[background-color,box-shadow,color] duration-300 ease-out hover:text-foreground hover:ring-[color-mix(in_srgb,var(--outline-variant)_22%,transparent)] disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}


export function AIChat() {
  const { activePath, activeTab, diskProjectKey, refreshTree, gitBranch, tabs, workspacePaths } =
    useIdeWorkspace();
  const [workspaceRootLabel, setWorkspaceRootLabel] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [accessoryHint, setAccessoryHint] = useState<string | null>(null);
  const [grokActivity, setGrokActivity] = useState<GrokActivityStatus>(IDLE_GROK_ACTIVITY);
  const pushActivity = useCallback<GrokActivityProgressFn>((message, kind = 'info') => {
    setGrokActivity((prev) => setGrokActivityAction(prev, message, kind));
  }, []);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [serverHasGrokKey, setServerHasGrokKey] = useState<boolean | null>(null);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  /** True while TTS audio is playing; mic stays off (project-execution-rules.md). */
  const [isTtsPlaying, setIsTtsPlaying] = useState(false);
  /** Mic stays off for `MIC_REENABLE_AFTER_TTS_MS` after TTS ends. */
  const [micCooldown, setMicCooldown] = useState(false);
  const [isHandsFree, setIsHandsFree] = useState(false);

  const messagesRef = useRef(messages);
  const inputRef = useRef(input);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    inputRef.current = input;
  }, [input]);

  const voiceRecognitionRef = useRef<IdeSpeechRecognition | null>(null);
  const voiceDraftRef = useRef('');
  const voiceIdleTimerRef = useRef<number | null>(null);
  const ttsRunIdRef = useRef(0);
  const ttsDebounceTimerRef = useRef<number | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);
  const ttsObjectUrlRef = useRef<string | null>(null);
  const ttsChunkResolveRef = useRef<(() => void) | null>(null);
  const micCooldownTimerRef = useRef<number | null>(null);
  const liveHandsFreeRecognitionRef = useRef<IdeSpeechRecognition | null>(null);
  const handsFreeIdleTimerRef = useRef<number | null>(null);
  const micInputBlockedRef = useRef(false);
  const sendingRef = useRef(false);
  const isHandsFreeRef = useRef(false);
  const openTalkDesiredRef = useRef(false);
  const handsFreeResumeAfterTtsRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollChatToBottom = useCallback((instant = true) => {
    const run = () => {
      const el = scrollContainerRef.current;
      if (el) {
        el.scrollTop = el.scrollHeight;
        return;
      }
      messagesEndRef.current?.scrollIntoView({ behavior: instant ? 'auto' : 'smooth', block: 'end' });
    };
    requestAnimationFrame(() => {
      run();
      requestAnimationFrame(run);
    });
  }, []);

  useEffect(() => {
    scrollChatToBottom(true);
  }, [messages, sending, scrollChatToBottom]);

  const micInputBlocked = isTtsPlaying || micCooldown;

  useEffect(() => {
    micInputBlockedRef.current = micInputBlocked;
  }, [micInputBlocked]);
  useEffect(() => {
    sendingRef.current = sending;
  }, [sending]);

  const clearVoiceIdleTimer = () => {
    if (voiceIdleTimerRef.current != null) {
      window.clearTimeout(voiceIdleTimerRef.current);
      voiceIdleTimerRef.current = null;
    }
  };

  const clearMicCooldownTimer = () => {
    if (micCooldownTimerRef.current != null) {
      window.clearTimeout(micCooldownTimerRef.current);
      micCooldownTimerRef.current = null;
    }
  };

  const stopVoiceRecognition = () => {
    clearVoiceIdleTimer();
    const r = voiceRecognitionRef.current;
    if (r) {
      try {
        r.stop();
      } catch {
        /* ignore */
      }
    }
    voiceDraftRef.current = '';
    setIsRecordingVoice(false);
  };

  const clearHandsFreeIdleTimer = () => {
    if (handsFreeIdleTimerRef.current != null) {
      window.clearTimeout(handsFreeIdleTimerRef.current);
      handsFreeIdleTimerRef.current = null;
    }
  };

  const stopHandsFree = useCallback(() => {
    clearHandsFreeIdleTimer();
    const r = liveHandsFreeRecognitionRef.current;
    if (r) {
      try {
        r.stop();
      } catch {
        /* ignore */
      }
      liveHandsFreeRecognitionRef.current = null;
    }
    isHandsFreeRef.current = false;
    openTalkDesiredRef.current = false;
    setIsHandsFree(false);
  }, []);

  /** Pause mic only (keep Open talk intent for post-TTS resume). */
  const pauseHandsFreeListening = useCallback(() => {
    clearHandsFreeIdleTimer();
    const r = liveHandsFreeRecognitionRef.current;
    if (r) {
      try {
        r.stop();
      } catch {
        /* ignore */
      }
      liveHandsFreeRecognitionRef.current = null;
    }
  }, []);

  const interruptVoiceAndTts = useCallback(() => {
    stopVoiceRecognition();
    stopHandsFree();
    handsFreeResumeAfterTtsRef.current = false;
    ttsRunIdRef.current += 1;
    ttsChunkResolveRef.current?.();
    ttsChunkResolveRef.current = null;
    if (ttsDebounceTimerRef.current != null) {
      window.clearTimeout(ttsDebounceTimerRef.current);
      ttsDebounceTimerRef.current = null;
    }
    if (ttsAbortRef.current) {
      ttsAbortRef.current.abort();
      ttsAbortRef.current = null;
    }
    const w = window as unknown as { nebula_ide_currentAudio?: HTMLAudioElement | null };
    const audio = w.nebula_ide_currentAudio;
    w.nebula_ide_currentAudio = null;
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
    clearMicCooldownTimer();
    setIsTtsPlaying(false);
    setMicCooldown(false);
  }, [stopHandsFree]);

  const scheduleHandsFreeAutoSend = useCallback(() => {
    clearHandsFreeIdleTimer();
    handsFreeIdleTimerRef.current = window.setTimeout(() => {
      handsFreeIdleTimerRef.current = null;
      const t = inputRef.current.trim();
      if (!t || micInputBlockedRef.current || sendingRef.current) return;
      void sendChatRef.current(t);
    }, VOICE_SILENCE_BEFORE_SEND_MS);
  }, []);

  const startHandsFree = useCallback((opts?: { resumeOnly?: boolean }) => {
    if (!('webkitSpeechRecognition' in window)) {
      setAccessoryHint('Speech recognition is not supported in this browser.');
      window.setTimeout(() => setAccessoryHint(null), 4000);
      return;
    }
    if (micInputBlockedRef.current || sendingRef.current) return;
    if (opts?.resumeOnly) {
      if (!openTalkDesiredRef.current) return;
      if (!isHandsFreeRef.current) {
        isHandsFreeRef.current = true;
        setIsHandsFree(true);
      }
      clearHandsFreeIdleTimer();
      const existing = liveHandsFreeRecognitionRef.current;
      if (existing) {
        try {
          existing.stop();
        } catch {
          /* ignore */
        }
        liveHandsFreeRecognitionRef.current = null;
      }
    } else {
      stopVoiceRecognition();
      stopHandsFree();
    }
    const SR = (window as unknown as { webkitSpeechRecognition: new () => IdeSpeechRecognition }).webkitSpeechRecognition;
    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: IdeSpeechRecognitionEvent) => {
      if (!isHandsFreeRef.current || micInputBlockedRef.current || sendingRef.current) return;
      let finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalText += event.results[i][0].transcript;
        }
      }
      if (!finalText) return;
      const next = `${inputRef.current}${inputRef.current ? ' ' : ''}${finalText}`.trim();
      setInput(next);
      inputRef.current = next;
      scheduleHandsFreeAutoSend();
    };

    recognition.onerror = (ev: IdeSpeechRecognitionErrorEvent) => {
      if (ev.error === 'aborted') return;
      console.warn('[AIChat] hands-free speech:', ev.error);
      setAccessoryHint(
        `Open talk: ${ev.error === 'not-allowed' ? 'allow the microphone for this site.' : ev.error}`,
      );
      window.setTimeout(() => setAccessoryHint(null), 4500);
      stopHandsFree();
    };

    recognition.onend = () => {
      if (!isHandsFreeRef.current || micInputBlockedRef.current) return;
      try {
        recognition.start();
      } catch (e) {
        console.warn('[AIChat] hands-free restart', e);
      }
    };

    try {
      recognition.start();
      liveHandsFreeRecognitionRef.current = recognition;
      isHandsFreeRef.current = true;
      openTalkDesiredRef.current = true;
      setIsHandsFree(true);
      if (!opts?.resumeOnly) {
        setAccessoryHint('Open talk is on — I listen continuously and send after a short pause when you finish a phrase.');
        window.setTimeout(() => setAccessoryHint(null), 4200);
      }
    } catch (err) {
      console.warn('[AIChat] hands-free start', err);
      setAccessoryHint('Could not start open talk — check browser permissions.');
      window.setTimeout(() => setAccessoryHint(null), 4500);
    }
  }, [stopHandsFree, scheduleHandsFreeAutoSend]);

  const resumeOpenTalkIfWanted = useCallback(() => {
    if (!openTalkDesiredRef.current) return;
    if (sendingRef.current) {
      window.setTimeout(() => resumeOpenTalkIfWanted(), 80);
      return;
    }
    if (micInputBlockedRef.current) {
      window.setTimeout(() => resumeOpenTalkIfWanted(), 120);
      return;
    }
    isHandsFreeRef.current = true;
    setIsHandsFree(true);
    void startHandsFree({ resumeOnly: true });
  }, [startHandsFree]);

  const toggleHandsFree = useCallback(() => {
    if (isHandsFreeRef.current) {
      stopHandsFree();
      setAccessoryHint('Open talk stopped.');
      window.setTimeout(() => setAccessoryHint(null), 2200);
      return;
    }
    void startHandsFree();
  }, [startHandsFree, stopHandsFree]);


  const refreshWorkspaceMeta = useCallback(async () => {
    try {
      const meta = await fetchIdeWorkspaceMeta(true);
      setWorkspaceRootLabel(meta.workspaceRoot);
    } catch {
      setWorkspaceRootLabel(`data/cloud-projects/${diskProjectKey}`);
    }
  }, [diskProjectKey]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch(withProjectQuery('/api/config'), { credentials: 'include' });
        const cfg = (await readResponseJson(r)) as { hasMainAiApiKey?: boolean; hasGrokApiKey?: boolean };
        if (!cancelled) setServerHasGrokKey(r.ok && serverReportsMainAiKey(cfg));
      } catch {
        if (!cancelled) setServerHasGrokKey(false);
      }
      if (!cancelled) {
        await syncActiveCloudProjectFromSession();
        await refreshWorkspaceMeta();
        void refreshTree();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshTree, refreshWorkspaceMeta]);

  useEffect(() => {
    const onSync = () => {
      clearIdeWorkspaceMetaCache();
      void refreshWorkspaceMeta();
      void refreshTree();
    };
    window.addEventListener('nebula-workspace-context-synced', onSync);
    window.addEventListener('nebula-files-applied', onSync);
    return () => {
      window.removeEventListener('nebula-workspace-context-synced', onSync);
      window.removeEventListener('nebula-files-applied', onSync);
    };
  }, [refreshWorkspaceMeta, refreshTree]);

  useEffect(() => {
    setSendError(null);
  }, [activePath]);

  const scheduleVoiceAutoSend = useCallback((transcript: string) => {
    clearVoiceIdleTimer();
    const t = transcript.trim();
    if (!t) return;
    voiceIdleTimerRef.current = window.setTimeout(() => {
      voiceIdleTimerRef.current = null;
      void sendChatRef.current(t);
    }, VOICE_SILENCE_BEFORE_SEND_MS);
  }, []);

  useEffect(() => {
    if (!('webkitSpeechRecognition' in window)) return;
    const SR = (window as unknown as { webkitSpeechRecognition: new () => IdeSpeechRecognition }).webkitSpeechRecognition;
    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: IdeSpeechRecognitionEvent) => {
      let finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalText += event.results[i][0].transcript;
        }
      }
      if (finalText) {
        voiceDraftRef.current = `${voiceDraftRef.current}${voiceDraftRef.current ? ' ' : ''}${finalText}`.trim();
        setInput(voiceDraftRef.current);
        inputRef.current = voiceDraftRef.current;
      }
    };

    recognition.onerror = (ev: IdeSpeechRecognitionErrorEvent) => {
      if (ev.error === 'aborted') return;
      console.warn('[AIChat] speech recognition:', ev.error);
      setAccessoryHint(`Voice input: ${ev.error === 'not-allowed' ? 'allow the microphone for this site.' : ev.error}`);
      window.setTimeout(() => setAccessoryHint(null), 4500);
      stopVoiceRecognition();
    };

    recognition.onend = () => {
      setIsRecordingVoice(false);
      const draft = voiceDraftRef.current.trim();
      voiceDraftRef.current = '';
      if (isHandsFreeRef.current) return;
      if (draft) {
        scheduleVoiceAutoSend(draft);
      }
    };

    voiceRecognitionRef.current = recognition;
    return () => {
      stopHandsFree();
      try {
        recognition.stop();
      } catch {
        /* ignore */
      }
      voiceRecognitionRef.current = null;
    };
  }, [scheduleVoiceAutoSend, stopHandsFree]);

  const sendChatRef = useRef<(override?: string) => Promise<void>>(async () => {});

  const sendChat = useCallback(async (textOverride?: string) => {
    const text = (textOverride ?? inputRef.current).trim();
    if (!text || sending) return;

    if (micInputBlocked) return;

    if (serverHasGrokKey === null) {
      try {
        const r = await fetch(withProjectQuery('/api/config'), { credentials: 'include' });
        const cfg = (await readResponseJson(r)) as { hasMainAiApiKey?: boolean; hasGrokApiKey?: boolean };
        setServerHasGrokKey(r.ok && serverReportsMainAiKey(cfg));
      } catch {
        setServerHasGrokKey(false);
      }
    }

    clearVoiceIdleTimer();
    stopVoiceRecognition();
    if (openTalkDesiredRef.current) {
      pauseHandsFreeListening();
    }

    const prior = messagesRef.current;
    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
    };
    setMessages((p) => {
      const next = [...p, userMsg];
      messagesRef.current = next;
      return next;
    });
    setInput('');
    inputRef.current = '';
    setSending(true);
    setSendError(null);
    const buildMode = detectBuildModeIntent(text);
    setGrokActivity(
      createGrokActivity(
        buildMode ? 'Build mode — Grok is implementing your request' : 'Grok is thinking…',
        CHAT_WORK_STEPS,
        {
          subhead: buildMode
            ? 'Master Plan → Grok Code → files on disk. Activity stream updates below.'
            : 'Reading your project context and preparing a reply.',
          footer: 'Large coding passes can take 1–3 minutes on the server.',
          initialLog: buildMode
            ? `Build mode detected — "${text.slice(0, 80)}${text.length > 80 ? '…' : ''}"`
            : `Message sent — "${text.slice(0, 80)}${text.length > 80 ? '…' : ''}"`,
        },
      ),
    );

    const projectName = getBrowserProjectName().trim() || 'Untitled project';
    pushActivity(`Project: ${projectName}`, 'info');
    if (activePath) {
      pushActivity(`Open in editor: ${activePath}`, 'info');
    }
    if (workspacePaths.length > 0) {
      pushActivity(`Workspace index: ${workspacePaths.length} file(s)`, 'info');
    }
    const ideAppendix = ideContextSnippetForChat(
      activePath,
      activeTab?.content ?? '',
      undefined,
      workspaceRootLabel ?? undefined,
      {
        gitBranch,
        openTabPaths: tabs.map((t) => t.path),
      },
    );

    const historyForApi = [...prior, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    })) as { role: 'user' | 'assistant'; content: string }[];

    const session = await fetchSessionUser();
    const userId = session?.uid?.trim() || 'anonymous';
    let scheduledTts = false;

    try {
      setGrokActivity((prev) =>
        advanceGrokActivity(prev, 1, {
          currentAction: 'Calling Grok API with Master Plan and workspace context…',
          log: { message: 'POST /api/grok/chat — waiting for Grok response', kind: 'info' },
        }),
      );

      const stopGrokWait = startGrokActivityWaitTicker('Waiting for Grok', pushActivity);
      let assistantContent: string;
      let planningPhase: string;
      try {
        ({ assistantContent, planningPhase } = await sendIdeAssistantGrokTurn({
          textToSend: text,
          history: historyForApi,
          userId,
          projectName,
          ideAppendix,
          buildMode,
        }));
      } finally {
        stopGrokWait();
      }
      const raw = assistantContent.trim();
      const masterPlanSource = (planningPhase || raw).trim();
      pushActivity(`Grok replied (${raw.length.toLocaleString()} chars)`, 'success');

      setGrokActivity((prev) =>
        advanceGrokActivity(prev, 2, {
          currentAction: 'Parsing Master Plan tags and saving sections…',
          log: { message: 'Scanning response for <START_MASTERPLAN> and file blocks', kind: 'info' },
        }),
      );
      const mpSaved = await persistMasterPlanFromAssistantSource(masterPlanSource, pushActivity);

      if (/<NEBULA_UI_STUDIO_PROMPT>/i.test(masterPlanSource)) {
        dispatchOpenUiStudio({ tab: 'mockups' });
      }

      const { displayText, hadCodingTag } = formatAssistantForIdeChatDisplay(raw);

      let masterPlanPipeline: Awaited<ReturnType<typeof runMasterPlanUiPipeline>> = {};
      if (mpSaved > 0) {
        setGrokActivity((prev) =>
          advanceGrokActivity(prev, 3, {
            currentAction: 'UI Studio pipeline — v0 prompt, mind map, optional v0…',
            stepDetail: {
              index: 2,
              detail: `Saved ${mpSaved} Master Plan section(s). Building v0 prompt & mind map from §4…`,
            },
            log: {
              message: `Master Plan updated — ${mpSaved} tab(s); starting UI pipeline`,
              kind: 'success',
            },
          }),
        );
        masterPlanPipeline = await runMasterPlanUiPipeline({
          projectName,
          autoV0: true,
          onProgress: pushActivity,
        });
        if ((masterPlanPipeline.mindMapPageCount ?? 0) > 0 || masterPlanPipeline.v0Ok) {
          try {
            window.dispatchEvent(new CustomEvent('nebula-master-plan-updated'));
            if ((masterPlanPipeline.mindMapPageCount ?? 0) > 0) {
              window.dispatchEvent(new CustomEvent('nebula-mind-map-updated'));
            }
            if (masterPlanPipeline.v0Ok) {
              window.dispatchEvent(new CustomEvent('nebula-files-applied'));
              dispatchOpenUiStudio({ tab: 'design' });
            }
          } catch {
            /* ignore */
          }
        }
      }

      if (/<START_UIUX>/i.test(masterPlanSource) && !masterPlanPipeline.v0Ok && !masterPlanPipeline.v0Triggered) {
        dispatchStartUiUxWorkflow({ tab: 'design', autoV0: true });
      }
      const spoken = stripAssistantTagsForVoice(displayText);
      const ts = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      const toAppend: Message[] = [];
      if (displayText.trim()) {
        toAppend.push({
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: displayText.trim(),
          timestamp: ts,
        });
      }
      if (toAppend.length > 0) {
        setMessages((p) => {
          const next = [...p, ...toAppend];
          messagesRef.current = next;
          return next;
        });
      }

      try {
        const willCode =
          hadCodingTag || /```(?:file|filepath)\s*:/i.test(raw) || isCodingIntent(masterPlanSource);
        if (willCode) {
          setGrokActivity((prev) => {
            const mm =
              masterPlanPipeline.mindMapPageCount != null && masterPlanPipeline.mindMapPageCount > 0
                ? `Mind map: ${masterPlanPipeline.mindMapPageCount} page(s).`
                : undefined;
            return advanceGrokActivity(prev, 4, {
              currentAction: 'Grok Code generating files — applying to workspace next…',
              log: { message: 'Coding intent detected — running Grok Code / file apply', kind: 'info' },
              ...(mm
                ? { stepDetail: { index: 3, detail: mm } }
                : {}),
            });
          });
        }

        const coding = await handlePostGrokCodingTurn({
          assistantContent: masterPlanSource,
          planningPhase,
          userId,
          projectName,
          userNote: text,
          onProgress: pushActivity,
        });
        if (coding.ran) {
          setGrokActivity((prev) =>
            advanceGrokActivity(prev, 5, {
              currentAction: coding.statusMessage || 'Syncing mind map, explorer, and preview…',
              ...(coding.statusMessage
                ? {
                    stepDetail: { index: 4, detail: coding.statusMessage },
                    log: { message: coding.statusMessage, kind: 'success' },
                  }
                : {}),
            }),
          );
          const artifactSync = await runPostCodingWorkspaceSync({
            userNote: text,
            projectName,
            seedBasicUi: false,
            openMindMap: true,
            onProgress: pushActivity,
          });
          if (mpSaved > 0 || (artifactSync.masterPlanTabs ?? 0) > 0) {
            window.dispatchEvent(new CustomEvent('nebula-open-master-plan'));
          }
          if (!masterPlanPipeline.v0Ok) {
            masterPlanPipeline = await runMasterPlanUiPipeline({
              projectName,
              autoV0: true,
              onProgress: pushActivity,
            });
          }
          if (masterPlanPipeline.v0Ok) {
            try {
              window.dispatchEvent(new CustomEvent('nebula-ui-studio-v0-complete'));
              window.dispatchEvent(new CustomEvent('nebula-files-applied'));
              dispatchOpenUiStudio({ tab: 'design' });
            } catch {
              /* ignore */
            }
          } else if (masterPlanPipeline.v0PromptWritten) {
            dispatchOpenUiStudio({ tab: 'design' });
          }
          setGrokActivity((prev) =>
            finishGrokActivity(
              prev,
              'Coding complete',
              CHAT_WORK_STEPS.map((s) => ({
                ...s,
                detail:
                  s.label.includes('Grok Code') && coding.statusMessage
                    ? coding.statusMessage
                    : s.label.includes('Sync') && masterPlanPipeline.v0Ok
                      ? 'v0 UI generated in UI Studio.'
                      : undefined,
              })),
              masterPlanPipeline.v0Ok
                ? 'Files are in your workspace · UI Studio has a v0 preview.'
                : coding.statusMessage || 'Files updated — check Explorer and Master Plan.',
              'All coding steps finished',
            ),
          );
        } else if (!willCode) {
          const mm = masterPlanPipeline.mindMapPageCount ?? 0;
          const footer =
            masterPlanPipeline.v0Ok
              ? 'v0 UI generated — open UI Studio to preview.'
              : masterPlanPipeline.v0Triggered && masterPlanPipeline.v0Error
                ? `v0 note: ${String(masterPlanPipeline.v0Error).slice(0, 120)}`
                : mm > 0
                  ? 'Mind map updated — open Mind map or UI Studio next.'
                  : mpSaved > 0
                    ? 'Master Plan updated — press Go when you want files written.'
                    : 'Reply shown in chat — press Go to implement.';
          setGrokActivity((prev) =>
            finishGrokActivity(
              prev,
              'Reply ready',
              CHAT_WORK_STEPS.slice(0, 3).map((s, i) => ({
                ...s,
                detail:
                  i === 2 && mpSaved > 0 ? `${mpSaved} section(s) saved.` : i === 1 ? 'No coding this turn.' : undefined,
              })),
              footer,
              mpSaved > 0 ? 'Master Plan saved — no file apply this turn' : 'Grok reply ready in chat',
            ),
          );
        }
      } catch (codingErr) {
        console.warn('[AIChat] coding apply:', codingErr);
        setGrokActivity((prev) =>
          errorGrokActivity(
            prev,
            'File apply failed',
            codingErr instanceof Error ? codingErr.message : 'Could not write files to workspace',
          ),
        );
      }

      if (spoken.trim()) {
        scheduledTts = true;
        handsFreeResumeAfterTtsRef.current = openTalkDesiredRef.current;
        void playTtsForText(spoken);
      }
    } catch (e) {
      setGrokActivity((prev) =>
        errorGrokActivity(
          prev,
          'Grok request failed',
          e instanceof Error ? e.message : 'Check server API key and retry',
        ),
      );
      const msg = e instanceof Error ? e.message : String(e);
      const isKeyHelp =
        msg.includes('Grok API key') ||
        msg.includes('Main AI') ||
        msg.includes('MAIN_API_KEY_GROK') ||
        msg.includes('MAIN_AI_API_KEY') ||
        msg.includes('GROK_API_KEY_LUMEN') ||
        msg.includes('GROK_API_KEY') ||
        msg.includes('Grok chat is unavailable') ||
        msg.includes('Please add your Grok') ||
        msg.includes('401') ||
        msg.includes('rejected this API key');
      const isUsageLimit = isMonthlyUsageLimitError(msg);
      if (isUsageLimit) {
        setSendError(FREE_TIER_MONTHLY_LIMIT_MESSAGE);
      } else if (isKeyHelp) {
        setSendError(MAIN_AI_CHAT_SETUP_HINT);
      } else {
        setSendError(msg);
      }
    } finally {
      setSending(false);
      if (openTalkDesiredRef.current && !scheduledTts) {
        resumeOpenTalkIfWanted();
      }
    }
  }, [sending, activePath, activeTab?.content, serverHasGrokKey, micInputBlocked, workspaceRootLabel, gitBranch, tabs, pauseHandsFreeListening, resumeOpenTalkIfWanted]);

  sendChatRef.current = sendChat;

  const playTtsForText = async (plain: string) => {
    if (ttsDebounceTimerRef.current != null) {
      window.clearTimeout(ttsDebounceTimerRef.current);
      ttsDebounceTimerRef.current = null;
    }
    if (ttsAbortRef.current) {
      ttsAbortRef.current.abort();
      ttsAbortRef.current = null;
    }
    ttsRunIdRef.current += 1;
    const runId = ttsRunIdRef.current;
    const controller = new AbortController();
    ttsAbortRef.current = controller;

    clearMicCooldownTimer();
    setMicCooldown(false);

    ttsDebounceTimerRef.current = window.setTimeout(async () => {
      ttsDebounceTimerRef.current = null;
      if (runId !== ttsRunIdRef.current) return;

      const chunks = splitTextForTts(plain);
      if (chunks.length === 0) {
        const shouldResume = handsFreeResumeAfterTtsRef.current;
        handsFreeResumeAfterTtsRef.current = false;
        if (shouldResume) {
          clearMicCooldownTimer();
          micCooldownTimerRef.current = window.setTimeout(() => {
            micCooldownTimerRef.current = null;
            setMicCooldown(false);
            resumeOpenTalkIfWanted();
          }, MIC_REENABLE_AFTER_TTS_MS);
        }
        return;
      }

      const resumeHandsFree = openTalkDesiredRef.current;
      stopVoiceRecognition();
      pauseHandsFreeListening();
      handsFreeResumeAfterTtsRef.current = resumeHandsFree;

      setIsTtsPlaying(true);

      const finishPlayback = () => {
        if (runId !== ttsRunIdRef.current) return;
        setIsTtsPlaying(false);
        const w = window as unknown as { nebula_ide_currentAudio?: HTMLAudioElement | null };
        w.nebula_ide_currentAudio = null;
        if (ttsObjectUrlRef.current) {
          URL.revokeObjectURL(ttsObjectUrlRef.current);
          ttsObjectUrlRef.current = null;
        }
        setMicCooldown(true);
        clearMicCooldownTimer();
        micCooldownTimerRef.current = window.setTimeout(() => {
          micCooldownTimerRef.current = null;
          setMicCooldown(false);
          if (handsFreeResumeAfterTtsRef.current) {
            handsFreeResumeAfterTtsRef.current = false;
            resumeOpenTalkIfWanted();
          }
        }, MIC_REENABLE_AFTER_TTS_MS);
      };

      try {
        for (let i = 0; i < chunks.length; i++) {
          if (runId !== ttsRunIdRef.current || controller.signal.aborted) {
            finishPlayback();
            return;
          }
          const speakRes = await fetch(withProjectQuery('/api/speak'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ text: chunks[i] }),
            signal: controller.signal,
          });
          if (!speakRes.ok) {
            const errBody = await speakRes.text();
            throw new Error(`TTS failed (${speakRes.status}): ${errBody.slice(0, 120)}`);
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
            const w = window as unknown as { nebula_ide_currentAudio?: HTMLAudioElement | null };
            w.nebula_ide_currentAudio = audio;
            let doneOnce = false;
            const done = () => {
              if (doneOnce) return;
              doneOnce = true;
              ttsChunkResolveRef.current = null;
              try {
                URL.revokeObjectURL(audioUrl);
              } catch {
                /* ignore */
              }
              if (ttsObjectUrlRef.current === audioUrl) ttsObjectUrlRef.current = null;
              resolve();
            };
            ttsChunkResolveRef.current = done;
            audio.onended = done;
            audio.onerror = done;
            audio.play().catch((err) => {
              if ((err as { name?: string })?.name !== 'AbortError') {
                console.warn('[AIChat] TTS playback', err);
              }
              done();
            });
          });
        }
        finishPlayback();
      } catch (e) {
        const aborted = (e as { name?: string })?.name === 'AbortError';
        if (!aborted && runId === ttsRunIdRef.current) {
          console.warn('[AIChat] TTS', e);
        }
        finishPlayback();
      }
    }, TTS_START_DEBOUNCE_MS);
  };

  const toggleVoiceMic = () => {
    if (sending || micInputBlocked) return;
    const r = voiceRecognitionRef.current;
    if (!r) {
      setAccessoryHint('Speech recognition is not supported in this browser.');
      window.setTimeout(() => setAccessoryHint(null), 4000);
      return;
    }
    if (isRecordingVoice) {
      try {
        r.stop();
      } catch {
        /* ignore */
      }
      return;
    }
    stopHandsFree();
    clearVoiceIdleTimer();
    voiceDraftRef.current = '';
    try {
      r.start();
      setIsRecordingVoice(true);
    } catch (err) {
      console.warn('[AIChat] mic start', err);
      setAccessoryHint('Could not start the microphone — check browser permissions.');
      window.setTimeout(() => setAccessoryHint(null), 4500);
    }
  };

  useEffect(() => {
    return () => {
      interruptVoiceAndTts();
    };
  }, [interruptVoiceAndTts]);

  const showGrokKeyBanner = serverHasGrokKey === false;

  const handleGo = useCallback(async () => {
    const userNote = inputRef.current.trim();
    if (sending || micInputBlocked) return;

    if (serverHasGrokKey === null) {
      try {
        const r = await fetch(withProjectQuery('/api/config'), { credentials: 'include' });
        const cfg = (await readResponseJson(r)) as { hasMainAiApiKey?: boolean; hasGrokApiKey?: boolean };
        setServerHasGrokKey(r.ok && serverReportsMainAiKey(cfg));
      } catch {
        setServerHasGrokKey(false);
      }
    }

    clearVoiceIdleTimer();
    stopVoiceRecognition();

    const ts = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const userMsg: Message = {
      id: `go-${Date.now()}`,
      role: 'user',
      content: userNote ? `Go — ${userNote}` : 'Go — implement project',
      timestamp: ts,
    };
    setMessages((p) => {
      const next = [...p, userMsg];
      messagesRef.current = next;
      return next;
    });
    setInput('');
    inputRef.current = '';
    setSending(true);
    setSendError(null);
    setGrokActivity(
      createGrokActivity('Go — full coding pass', GO_WORK_STEPS, {
        subhead: 'Pre-coding summary → Grok Code → file apply → mind map & v0.',
        footer: 'Server-side coding often takes 1–3 minutes — watch the activity stream below.',
        initialLog: userNote ? `Go started — focus: ${userNote.slice(0, 120)}` : 'Go started — full implementation pass',
      }),
    );

    const session = await fetchSessionUser();
    const userId = session?.uid?.trim() || 'anonymous';
    const projectName = getBrowserProjectName().trim() || 'Untitled project';

    try {
      setGrokActivity((prev) =>
        advanceGrokActivity(prev, 1, {
          currentAction: 'Refreshing workspace metadata…',
          log: { message: 'Loading workspace file index and git branch', kind: 'info' },
        }),
      );
      await refreshWorkspaceMeta();
      pushActivity(`Workspace ready — ${workspacePaths.length} indexed file(s)`, 'info');
      setGrokActivity((prev) =>
        advanceGrokActivity(prev, 2, {
          currentAction: 'Grok Code on server — summary then implementation…',
          log: { message: 'Starting /api/grok/go-code (this may take 1–3 min)', kind: 'info' },
        }),
      );
      const go = await runGoCodeAndApply({ userId, projectName, userNote, onProgress: pushActivity });
      if (go.ok) {
        window.dispatchEvent(new CustomEvent('nebula-master-plan-updated'));
      }
      setGrokActivity((prev) =>
        advanceGrokActivity(prev, 3, {
          currentAction: go.ok ? 'Syncing Master Plan, mind map, explorer…' : go.statusMessage,
          ...(go.statusMessage
            ? { stepDetail: { index: 2, detail: go.statusMessage }, log: { message: go.statusMessage, kind: go.ok ? 'success' : 'error' } }
            : {}),
        }),
      );
      if (!go.ok) {
        setGrokActivity((prev) => errorGrokActivity(prev, 'Go did not complete', go.statusMessage));
        setSendError(go.statusMessage);
        return;
      }
      await runPostCodingWorkspaceSync({
        userNote,
        projectName,
        seedBasicUi: false,
        openMindMap: true,
        onProgress: pushActivity,
      });
      window.dispatchEvent(new CustomEvent('nebula-master-plan-updated'));
      setGrokActivity((prev) =>
        advanceGrokActivity(prev, 4, {
          currentAction: 'Mind map & v0 UI pipeline…',
          log: { message: 'POST /api/ide/master-plan-ui-pipeline', kind: 'info' },
        }),
      );
      const pipeline = await runMasterPlanUiPipeline({
        projectName,
        autoV0: true,
        onProgress: pushActivity,
      });
      if (pipeline.v0Ok) {
        window.dispatchEvent(new CustomEvent('nebula-ui-studio-v0-complete'));
        window.dispatchEvent(new CustomEvent('nebula-files-applied'));
        dispatchOpenUiStudio({ tab: 'design' });
      }
      setGrokActivity((prev) =>
        finishGrokActivity(
          prev,
          'Go complete — workspace updated',
          GO_WORK_STEPS.map((s) => ({
            ...s,
            detail:
              s.label.includes('Write files') && go.statusMessage
                ? go.statusMessage
                : s.label.includes('v0') && pipeline.v0Ok
                  ? 'v0 UI ready in UI Studio.'
                  : undefined,
          })),
          pipeline.v0Ok
            ? `${go.statusMessage} · v0 UI generated.`
            : go.statusMessage || 'Check Explorer for new files.',
          'Go pipeline finished',
        ),
      );
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Go failed');
      setGrokActivity((prev) =>
        errorGrokActivity(prev, 'Go failed', e instanceof Error ? e.message : 'Unexpected error'),
      );
    } finally {
      setSending(false);
      setAccessoryHint(null);
      if (openTalkDesiredRef.current) {
        resumeOpenTalkIfWanted();
      }
    }
  }, [micInputBlocked, sending, serverHasGrokKey, stopVoiceRecognition, refreshWorkspaceMeta, resumeOpenTalkIfWanted, pushActivity, workspacePaths.length]);

  return (
    <div className="surface-active tonal-seam-l flex h-full min-h-0 flex-col overflow-hidden">
      {showGrokKeyBanner ? (
        <div
          className="shrink-0 border-b border-amber-500/40 bg-gradient-to-r from-amber-500/20 via-amber-500/12 to-transparent px-3 py-3"
          role="status"
        >
          <p className="type-label-sm font-headline text-amber-100">Grok is not configured on the server</p>
          <p className="type-body-md mt-1 leading-relaxed text-amber-50/95">{MAIN_AI_CHAT_SETUP_HINT}</p>
        </div>
      ) : null}

      {accessoryHint ? (
        <p
          className="type-label-sm shrink-0 border-b border-border/70 bg-muted/25 px-3 py-1.5 text-muted-foreground"
          role="status"
        >
          {accessoryHint}
        </p>
      ) : null}

      {sendError ? (
        <p className="type-label-sm border-b border-red-500/20 bg-red-500/10 px-3 py-1.5 text-red-100/95" role="alert">
          {sendError}
        </p>
      ) : null}

      <div ref={scrollContainerRef} className="flex-1 space-y-3 overflow-auto p-3">
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn('flex gap-2', message.role === 'user' ? 'flex-row-reverse' : 'flex-row')}
          >
            <div
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                message.role === 'user' ? 'surface-float' : 'active-tab-sheen text-primary',
              )}
            >
              {message.role === 'user' ? (
                <User className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <Bot className="h-3.5 w-3.5 text-primary" />
              )}
            </div>
            <div className={cn('max-w-[85%]', message.role === 'user' ? 'text-right' : 'text-left')}>
              <div
                className={cn(
                  'type-body-md inline-block rounded-lg px-3 py-2',
                  message.role === 'user' ? 'surface-float text-primary' : 'surface-active text-foreground',
                )}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
              </div>
              <p className="type-label-sm mt-0.5 opacity-80">{message.timestamp}</p>
            </div>
          </div>
        ))}

        {sending ? (
          <div className="flex gap-2">
            <div className="active-tab-sheen flex h-6 w-6 shrink-0 items-center justify-center rounded-full">
              <Bot className="h-3.5 w-3.5 text-primary" />
            </div>
            <div className="surface-active max-w-[85%] rounded-lg px-3 py-2">
              <p className="type-label-sm text-muted-foreground">
                Working… live activity updates in the panel below.
              </p>
            </div>
          </div>
        ) : null}
        <div ref={messagesEndRef} className="h-px shrink-0" aria-hidden />
      </div>

      <IdeGrokActivityPanel activity={grokActivity} />

      <div className="tonal-seam-t shrink-0 p-3">
        <div className="surface-float rounded-lg border border-transparent p-2 ring-1 ring-[color-mix(in_srgb,var(--outline-variant)_12%,transparent)] transition-[box-shadow,background-color] duration-300 ease-out focus-within:ring-[color-mix(in_srgb,var(--outline-variant)_22%,transparent)]">
          <textarea
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              inputRef.current = e.target.value;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void sendChat();
              }
            }}
            placeholder="Message Grok…"
            rows={3}
            disabled={sending || micInputBlocked}
            className="type-body-md min-h-[4.5rem] w-full resize-y bg-transparent text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-50"
          />

          <div className="mt-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <ChatRoundButton
                label={isHandsFree ? 'Stop open talk (hands-free)' : 'Start open talk (hands-free)'}
                onClick={() => toggleHandsFree()}
                disabled={sending}
              >
                <SoundWaveIcon
                  className={cn(isHandsFree ? 'text-primary' : '', micInputBlocked ? 'opacity-50' : '')}
                />
              </ChatRoundButton>
              <ChatRoundButton
                label="Interrupt Grok voice"
                onClick={() => {
                  interruptVoiceAndTts();
                  setAccessoryHint('Stopped voice playback and any pending dictation send.');
                  window.setTimeout(() => setAccessoryHint(null), 3200);
                }}
              >
                <Hand className="h-[18px] w-[18px]" />
              </ChatRoundButton>
              <ChatRoundButton
                label={isRecordingVoice ? 'Stop dictation' : 'Speak (push-to-talk)'}
                onClick={() => toggleVoiceMic()}
                disabled={sending || micInputBlocked || isHandsFree}
              >
                <Mic
                  className={cn(
                    'h-[18px] w-[18px]',
                    isRecordingVoice ? 'text-destructive' : '',
                    micInputBlocked || isHandsFree ? 'opacity-50' : '',
                  )}
                />
              </ChatRoundButton>
            </div>

            <div className="flex items-center gap-1.5">
              <ChatRoundButton
                label="Attach file"
                onClick={() => {
                  setAccessoryHint('Attach files in the main Assistant sidebar (stored in Cloudflare R2).');
                  window.setTimeout(() => setAccessoryHint(null), 4200);
                }}
              >
                <Paperclip className="h-[18px] w-[18px]" />
              </ChatRoundButton>
              <button
                type="button"
                onClick={handleGo}
                disabled={!input.trim() || sending || micInputBlocked}
                className="btn-primary-cta flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-[0.8125rem] disabled:opacity-40"
              >
                <Rocket className="h-3.5 w-3.5" />
                Go
              </button>
              <ChatRoundButton
                label="Send message"
                onClick={() => void sendChat()}
                disabled={!input.trim() || sending || micInputBlocked}
              >
                <Send className="h-[18px] w-[18px]" />
              </ChatRoundButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
