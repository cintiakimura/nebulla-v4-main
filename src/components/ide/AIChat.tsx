import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, Hand, Loader2, Mic, Paperclip, Rocket, Send, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchSessionUser, syncActiveCloudProjectFromSession, upsertCloudProject } from '../../lib/nebulaCloud';
import {
  FREE_TIER_MONTHLY_LIMIT_MESSAGE,
  isMonthlyUsageLimitError,
  MAIN_AI_CHAT_SETUP_HINT,
  serverReportsMainAiKey,
} from '../../lib/grokKey';
import { readResponseJson } from '../../lib/apiFetch';
import {
  getBrowserProjectKey,
  getBrowserProjectName,
  setBrowserProjectKey,
  setBrowserProjectName,
  withProjectBody,
  withProjectQuery,
} from '../../lib/nebulaProjectApi';
import { uploadFileToR2 } from '../../lib/nebulaStorageClient';
import {
  cancelProjectBackgroundJobs,
  registerDesignReference,
  resetProjectFromScratch,
} from '../../lib/ideProjectReset';
import { sendIdeAssistantGrokTurn } from '../../lib/ideAssistantGrokChat';
import {
  conversationEntriesToIdeMessages,
  IDE_CHAT_DISCOVERY_BOOTSTRAP,
  IDE_CHAT_FAST_PROJECT_BOOTSTRAP,
  isHiddenBootstrapUserMessage,
} from '../../lib/ideChatBootstrap';
import { fetchConversationLogEntries } from '../../lib/conversationLogClient';
import {
  formatAssistantForIdeChatDisplay,
  persistMasterPlanFromAssistantSource,
} from '../../lib/grokChatArtifacts';
import { dispatchOpenUiStudio, dispatchStartUiUxWorkflow } from '../../lib/nebulaUiStudioEvents';
import {
  handlePostGrokCodingTurn,
  hasGrokFileBlocks,
  isCodingIntent,
  runGoCodeAndApply,
} from '../../lib/nebulaGrokCodingPipeline';
import { setGrokCodingActive } from '../../lib/nebulaGrokCodingGate';
import { runMasterPlanUiPipelineWithV0, runPostCodingWorkspaceSync } from '../../lib/ideArtifactSync';
import {
  clearIdeWorkspaceMetaCache,
  detectBuildModeIntent,
  detectOnboardingBuildStart,
  detectProjectNameAnswer,
  fetchIdeWorkspaceMeta,
} from '../../lib/ideWorkspaceChatContext';
import { createGuestProject, writeActiveGuestProjectId } from '../../lib/nebulaProjectStore';
import { handleSmartChatMessage, type SmartChatFilePreview } from '../../lib/smartChatHandler';
import { ideContextSnippetForChat, useIdeWorkspace } from '@/components/ide/IdeWorkspaceContext';
import { ChatFilePreview } from '@/components/ide/ChatFilePreview';
import {
  advanceGrokActivity,
  createGrokActivity,
  commitGrokActivityStatus,
  updateGrokActivityCurrent,
  startGrokActivityWaitTicker,
  finishGrokActivity,
  patchGrokActivityV0Status,
  type GrokActivityProgressFn,
  type GrokActivityStatus,
  type GrokActivityStep,
} from '../../lib/ideGrokActivityStatus';
import { fetchChatV0StatusSnapshot } from '../../lib/chatV0Status';
import { IdeGrokActivityPanel } from '@/components/ide/IdeGrokActivityPanel';
import {
  MIC_REENABLE_AFTER_TTS_MS,
  OPEN_TALK_MIN_SPEAKING_MS,
  OPEN_TALK_PAUSE_GRACE_MS,
  OPEN_TALK_SILENCE_SEND_MS,
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
  /** Rich file preview from Smart Chat Handler (File mode) */
  filePreview?: SmartChatFilePreview;
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


function ChatPipelineStatusBar({
  headline,
  summary,
  v0Status,
  v0Detail,
  v0Live,
  onDismiss,
}: {
  headline: string;
  summary?: string;
  v0Status?: string;
  v0Detail?: string;
  v0Live?: boolean;
  onDismiss: () => void;
}) {
  return (
    <div
      className="shrink-0 border-b border-emerald-500/20 bg-emerald-500/5 px-3 py-2"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="type-label-sm font-headline text-emerald-200">{headline}</p>
          {summary ? (
            <p className="type-body-md mt-0.5 line-clamp-2 text-muted-foreground">{summary}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-white/10 hover:text-foreground"
          aria-label="Dismiss status bar"
        >
          Dismiss
        </button>
      </div>
      {v0Status ? (
        <div
          className={cn(
            'mt-2 rounded-md border px-2 py-1.5 text-[11px] leading-snug',
            v0Live
              ? 'border-violet-500/30 bg-violet-500/10 text-violet-100'
              : 'border-white/10 bg-black/20 text-muted-foreground',
          )}
        >
          <p className="font-medium">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground/80">v0 · </span>
            {v0Live ? <Loader2 className="mr-1 inline h-3 w-3 animate-spin" aria-hidden /> : null}
            {v0Status}
          </p>
          {v0Detail ? <p className="mt-0.5 text-[10px] opacity-85">{v0Detail}</p> : null}
        </div>
      ) : null}
    </div>
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
  const [pipelineBannerDismissed, setPipelineBannerDismissed] = useState(false);
  const [v0WatchActive, setV0WatchActive] = useState(false);
  const [v0Live, setV0Live] = useState(false);
  const codingActivityRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadBusy, setUploadBusy] = useState(false);

  const resetCodingActivity = useCallback(() => {
    codingActivityRef.current = false;
    setGrokCodingActive(false);
    setV0WatchActive(false);
    setV0Live(false);
    setGrokActivity(IDLE_GROK_ACTIVITY);
  }, []);

  const dismissPipelineBanner = useCallback(() => {
    setPipelineBannerDismissed(true);
    codingActivityRef.current = false;
    setGrokCodingActive(false);
    setV0Live(false);
    setGrokActivity(IDLE_GROK_ACTIVITY);
  }, []);

  const beginCodingActivity = useCallback(
    (headline: string, steps: GrokActivityStep[], options?: Parameters<typeof createGrokActivity>[2]) => {
      setPipelineBannerDismissed(false);
      codingActivityRef.current = true;
      setGrokCodingActive(true);
      setGrokActivity(createGrokActivity(headline, steps, options));
    },
    [],
  );

  const pushActivity = useCallback<GrokActivityProgressFn>((message, kind = 'info', options) => {
    if (!codingActivityRef.current) return;
    setGrokActivity((prev) =>
      options?.currentOnly
        ? updateGrokActivityCurrent(prev, message)
        : commitGrokActivityStatus(prev, message, kind),
    );
  }, []);

  const refreshChatV0Status = useCallback(async () => {
    try {
      const snap = await fetchChatV0StatusSnapshot();
      setGrokActivity((prev) => patchGrokActivityV0Status(prev, snap.line, snap.detail));
      setV0Live(Boolean(snap.live));
      if (snap.live) setV0WatchActive(true);
      return snap;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    const onProgress = (ev: Event) => {
      const d = (ev as CustomEvent<{ line?: string; detail?: string }>).detail;
      if (!d?.line) return;
      setV0Live(true);
      setV0WatchActive(true);
      setPipelineBannerDismissed(false);
      setGrokActivity((prev) => patchGrokActivityV0Status(prev, d.line!, d.detail));
    };
    const onWatch = (ev: Event) => {
      const active = Boolean((ev as CustomEvent<{ active?: boolean }>).detail?.active);
      setV0WatchActive(active);
      setV0Live(active);
      if (active) {
        setPipelineBannerDismissed(false);
        void refreshChatV0Status();
      }
    };
    const onV0Done = () => {
      setV0WatchActive(false);
      setV0Live(false);
      void refreshChatV0Status();
    };
    window.addEventListener('nebula-chat-v0-progress', onProgress);
    window.addEventListener('nebula-chat-v0-watch', onWatch);
    window.addEventListener('nebula-ui-studio-v0-complete', onV0Done);
    window.addEventListener('nebula-v0-demo-ready', onV0Done);
    return () => {
      window.removeEventListener('nebula-chat-v0-progress', onProgress);
      window.removeEventListener('nebula-chat-v0-watch', onWatch);
      window.removeEventListener('nebula-ui-studio-v0-complete', onV0Done);
      window.removeEventListener('nebula-v0-demo-ready', onV0Done);
    };
  }, [refreshChatV0Status]);

  useEffect(() => {
    if (!v0WatchActive && grokActivity.tone !== 'work') return;
    void refreshChatV0Status();
    const id = window.setInterval(() => void refreshChatV0Status(), 4000);
    return () => window.clearInterval(id);
  }, [v0WatchActive, grokActivity.tone, refreshChatV0Status]);

  const showFullActivityPanel = grokActivity.tone === 'work';
  const showCompactPipelineBar =
    !pipelineBannerDismissed &&
    !showFullActivityPanel &&
    (grokActivity.tone === 'ready' || v0WatchActive || Boolean(grokActivity.v0Status));
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
  const handsFreeGraceTimerRef = useRef<number | null>(null);
  const handsFreeSendTimerRef = useRef<number | null>(null);
  const handsFreeFirstSpeechAtRef = useRef<number | null>(null);
  const micInputBlockedRef = useRef(false);
  const sendingRef = useRef(false);
  const isHandsFreeRef = useRef(false);
  const openTalkDesiredRef = useRef(false);
  const handsFreeResumeAfterTtsRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const bootstrapStartedRef = useRef(false);
  const chatHistoryLoadedRef = useRef(false);

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

  const clearHandsFreeAutoSendTimers = () => {
    if (handsFreeGraceTimerRef.current != null) {
      window.clearTimeout(handsFreeGraceTimerRef.current);
      handsFreeGraceTimerRef.current = null;
    }
    if (handsFreeSendTimerRef.current != null) {
      window.clearTimeout(handsFreeSendTimerRef.current);
      handsFreeSendTimerRef.current = null;
    }
  };

  const resetHandsFreeSpeechTurn = () => {
    clearHandsFreeAutoSendTimers();
    handsFreeFirstSpeechAtRef.current = null;
  };

  const stopHandsFree = useCallback(() => {
    resetHandsFreeSpeechTurn();
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
    clearHandsFreeAutoSendTimers();
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
    resetHandsFreeSpeechTurn();
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

  const attemptHandsFreeAutoSend = useCallback(() => {
    handsFreeSendTimerRef.current = null;
    if (!openTalkDesiredRef.current || !isHandsFreeRef.current) return;
    if (micInputBlockedRef.current || sendingRef.current) return;

    const firstSpeechAt = handsFreeFirstSpeechAtRef.current;
    if (firstSpeechAt != null) {
      const elapsed = Date.now() - firstSpeechAt;
      if (elapsed < OPEN_TALK_MIN_SPEAKING_MS) {
        handsFreeSendTimerRef.current = window.setTimeout(
          () => attemptHandsFreeAutoSend(),
          OPEN_TALK_MIN_SPEAKING_MS - elapsed,
        );
        return;
      }
    }

    const t = inputRef.current.trim();
    if (!t) return;

    resetHandsFreeSpeechTurn();
    void sendChatRef.current(t);
  }, []);

  const scheduleHandsFreeAutoSend = useCallback(() => {
    if (!openTalkDesiredRef.current || !isHandsFreeRef.current) return;
    if (micInputBlockedRef.current || sendingRef.current) return;

    clearHandsFreeAutoSendTimers();
    handsFreeGraceTimerRef.current = window.setTimeout(() => {
      handsFreeGraceTimerRef.current = null;
      if (!openTalkDesiredRef.current || !isHandsFreeRef.current) return;
      if (micInputBlockedRef.current || sendingRef.current) return;

      handsFreeSendTimerRef.current = window.setTimeout(() => {
        attemptHandsFreeAutoSend();
      }, OPEN_TALK_SILENCE_SEND_MS);
    }, OPEN_TALK_PAUSE_GRACE_MS);
  }, [attemptHandsFreeAutoSend]);

  const noteHandsFreeSpeechActivity = useCallback(() => {
    if (handsFreeFirstSpeechAtRef.current == null) {
      handsFreeFirstSpeechAtRef.current = Date.now();
    }
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
      clearHandsFreeAutoSendTimers();
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
      let hasInterim = false;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalText += event.results[i][0].transcript;
        } else {
          hasInterim = true;
        }
      }
      if (finalText) {
        const next = `${inputRef.current}${inputRef.current ? ' ' : ''}${finalText}`.trim();
        setInput(next);
        inputRef.current = next;
      }
      if (finalText || hasInterim) {
        noteHandsFreeSpeechActivity();
        scheduleHandsFreeAutoSend();
      }
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
        resetHandsFreeSpeechTurn();
        setAccessoryHint(
          'Open talk is on — speak naturally. I wait at least 10s while you talk, then 3s after you pause, then send.',
        );
        window.setTimeout(() => setAccessoryHint(null), 5200);
      }
    } catch (err) {
      console.warn('[AIChat] hands-free start', err);
      setAccessoryHint('Could not start open talk — check browser permissions.');
      window.setTimeout(() => setAccessoryHint(null), 4500);
    }
  }, [stopHandsFree, scheduleHandsFreeAutoSend, noteHandsFreeSpeechActivity]);

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
    let cancelled = false;
    chatHistoryLoadedRef.current = false;
    bootstrapStartedRef.current = false;
    void (async () => {
      try {
        const entries = await fetchConversationLogEntries();
        if (cancelled) return;
        if (entries.length > 0) {
          const restored = conversationEntriesToIdeMessages(entries);
          setMessages(restored);
          messagesRef.current = restored;
        } else {
          setMessages([]);
          messagesRef.current = [];
        }
      } catch (e) {
        console.warn('[AIChat] conversation log load skipped:', e);
      } finally {
        if (!cancelled) chatHistoryLoadedRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [diskProjectKey]);

  useEffect(() => {
    const onReset = () => {
      setMessages([]);
      messagesRef.current = [];
      chatHistoryLoadedRef.current = true;
      bootstrapStartedRef.current = false;
      setSendError(null);
      if (serverHasGrokKey === true) {
        bootstrapStartedRef.current = true;
        void sendChatRef.current(IDE_CHAT_DISCOVERY_BOOTSTRAP);
      }
    };
    window.addEventListener('nebula-project-reset', onReset);
    return () => window.removeEventListener('nebula-project-reset', onReset);
  }, [serverHasGrokKey]);

  useEffect(() => {
    if (serverHasGrokKey !== true) return;
    if (!chatHistoryLoadedRef.current) return;
    if (messagesRef.current.length > 0) return;
    if (bootstrapStartedRef.current || sendingRef.current) return;
    bootstrapStartedRef.current = true;
    void sendChatRef.current(IDE_CHAT_DISCOVERY_BOOTSTRAP);
  }, [serverHasGrokKey, messages.length, diskProjectKey]);

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

  /** Detect natural language project creation requests like "Create a new project: fitness tracker" */
  function detectProjectCreationIntent(text: string): { description: string } | null {
    const t = text.trim();
    const lower = t.toLowerCase();

    const patterns = [
      /create (a )?new project[:\-]?\s*(.+)/i,
      /start (a )?new project[:\-]?\s*(.+)/i,
      /new project[:\-]?\s*(.+)/i,
      /let's (make|build|create) (a )?new (app|project)[:\-]?\s*(.+)/i,
    ];

    for (const re of patterns) {
      const m = t.match(re);
      if (m) {
        const desc = (m[2] || m[4] || m[1] || '').trim();
        if (desc.length > 3) {
          return { description: desc };
        }
      }
    }

    // Also support "Project: X" at the very start
    if (lower.startsWith('project:')) {
      const desc = t.slice(8).trim();
      if (desc.length > 3) return { description: desc };
    }

    return null;
  }

  const sendChat = useCallback(async (textOverride?: string) => {
    const text = (textOverride ?? inputRef.current).trim();
    if (!text || sending) return;

    if (micInputBlocked) return;

    // Smart Chat Handler — File mode ONLY (local/GitHub + rich preview).
    // Never intercept hidden bootstrap, Master Plan discovery replies, or Go Code turns.
    if (!isHiddenBootstrapUserMessage(text)) {
      try {
        const smart = await handleSmartChatMessage(text);
        if (smart.mode === 'file' && smart.handledLocally) {
          const stamp = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
          const userMsg: Message = {
            id: `u-${Date.now()}`,
            role: 'user',
            content: text,
            timestamp: stamp,
          };
          const assistantMsg: Message = {
            id: `a-${Date.now()}`,
            role: 'assistant',
            content: smart.assistantMessage,
            timestamp: stamp,
            filePreview: smart.filePreview,
          };
          setMessages((p) => {
            const next = [...p, userMsg, assistantMsg];
            messagesRef.current = next;
            return next;
          });
          setInput('');
          inputRef.current = '';
          return;
        }
      } catch {
        /* fall through to normal Grok / Master Plan / Go chat */
      }
    }

    // Fast project creation from chat ("Create a new project: ...")
    const projectCreation = detectProjectCreationIntent(text);
    if (projectCreation) {
      const shortName = projectCreation.description.split(' ').slice(0, 4).join(' ').replace(/[^a-z0-9 ]/gi, '').trim() || 'New Project';
      const entry = createGuestProject({
        pages: [],
        edges: [],
        projectName: shortName || 'New Project',
      });
      writeActiveGuestProjectId(entry.id);
      setBrowserProjectKey(entry.id);
      setBrowserProjectName(entry.name);
      clearIdeWorkspaceMetaCache();

      setInput('');
      inputRef.current = '';

      // Send the hidden fast bootstrap first (Grok will start the short interview)
      setTimeout(() => {
        void sendChatRef.current(IDE_CHAT_FAST_PROJECT_BOOTSTRAP);
      }, 10);

      // Then send the user's description as the visible follow-up
      setTimeout(() => {
        void sendChatRef.current(projectCreation.description);
      }, 80);

      return;
    }

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
    resetHandsFreeSpeechTurn();
    stopVoiceRecognition();
    if (openTalkDesiredRef.current) {
      pauseHandsFreeListening();
    }

    const prior = messagesRef.current;
    const isBootstrapTrigger = isHiddenBootstrapUserMessage(text);
    const projectNameAnswer = detectProjectNameAnswer(text, prior);
    if (projectNameAnswer) {
      setBrowserProjectName(projectNameAnswer);
      clearIdeWorkspaceMetaCache();
      void upsertCloudProject({ name: projectNameAnswer, pages: [], edges: [] }).catch(() => {});
    }
    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
    };
    if (!isBootstrapTrigger) {
      setMessages((p) => {
        const next = [...p, userMsg];
        messagesRef.current = next;
        return next;
      });
    }
    setInput('');
    inputRef.current = '';
    setSending(true);
    setSendError(null);
    const buildMode = detectBuildModeIntent(text);
    const onboardingBuildStart = detectOnboardingBuildStart(text, prior);
    const showWorkActivity = buildMode || onboardingBuildStart;
    if (buildMode) {
      beginCodingActivity(
        'Build mode — Grok is implementing your request',
        CHAT_WORK_STEPS,
        {
          subhead: 'Master Plan → Grok Code → files on disk.',
          initialLog: `Build mode — "${text.slice(0, 80)}${text.length > 80 ? '…' : ''}"`,
        },
      );
      pushActivity(`Project: ${getBrowserProjectName().trim() || 'Untitled project'}`, 'info');
    } else if (onboardingBuildStart) {
      beginCodingActivity(
        'Discovery complete — saving Master Plan and starting code',
        CHAT_WORK_STEPS,
        {
          subhead:
            'Your reply means nothing else to add. Grok will write the Master Plan, then Grok Code builds files.',
          initialLog: `Discovery complete — "${text.trim()}"`,
        },
      );
      pushActivity('Final discovery question answered — waiting for Grok Master Plan', 'info');
    }

    const projectName = getBrowserProjectName().trim() || 'Untitled project';
    if (buildMode && activePath) {
      pushActivity(`Open in editor: ${activePath}`, 'info');
    }
    if (buildMode && workspacePaths.length > 0) {
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
      if (showWorkActivity) {
        setGrokActivity((prev) =>
          advanceGrokActivity(prev, 1, {
            currentAction: onboardingBuildStart
              ? 'Grok is writing your Master Plan from discovery…'
              : 'Calling Grok API with Master Plan and workspace context…',
            log: { message: 'POST /api/grok/chat — waiting for Grok response', kind: 'info' },
          }),
        );
      }

      const stopGrokWait = showWorkActivity
        ? startGrokActivityWaitTicker('Waiting for Grok', (msg, kind, options) =>
            pushActivity(msg, kind, options),
          )
        : () => {};
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
      if (showWorkActivity) {
        pushActivity(`Grok replied (${raw.length.toLocaleString()} chars)`, 'success');
        setGrokActivity((prev) =>
          advanceGrokActivity(prev, 2, {
            currentAction: 'Parsing Master Plan tags and saving sections…',
            log: { message: 'Scanning response for <START_MASTERPLAN> and file blocks', kind: 'info' },
          }),
        );
      }

      const mpSaved = await persistMasterPlanFromAssistantSource(
        masterPlanSource,
        showWorkActivity ? pushActivity : undefined,
      );

      if (/<NEBULA_UI_STUDIO_PROMPT>/i.test(masterPlanSource)) {
        dispatchOpenUiStudio({ tab: 'mockups' });
      }

      const { displayText, hadCodingTag } = formatAssistantForIdeChatDisplay(raw);
      const willCode =
        hadCodingTag || hasGrokFileBlocks(raw) || isCodingIntent(masterPlanSource);

      let masterPlanPipeline: Awaited<ReturnType<typeof runMasterPlanUiPipelineWithV0>> = {};
      if (mpSaved > 0) {
        if (showWorkActivity) {
          setGrokActivity((prev) =>
            advanceGrokActivity(prev, 3, {
              currentAction: willCode
                ? 'UI Studio pipeline — v0 prompt & mind map (v0 runs after Grok Code)…'
                : 'UI Studio pipeline — v0 prompt, mind map, optional v0…',
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
        }
        masterPlanPipeline = await runMasterPlanUiPipelineWithV0({
          projectName,
          autoV0: false,
          onProgress: showWorkActivity ? pushActivity : undefined,
        });
        if ((masterPlanPipeline.mindMapPageCount ?? 0) > 0 || masterPlanPipeline.v0Ok) {
          try {
            window.dispatchEvent(new CustomEvent('nebula-master-plan-updated'));
            if ((masterPlanPipeline.mindMapPageCount ?? 0) > 0) {
              window.dispatchEvent(new CustomEvent('nebula-mind-map-updated'));
            }
            if (masterPlanPipeline.v0Ok && !willCode) {
              window.dispatchEvent(new CustomEvent('nebula-files-applied'));
              dispatchOpenUiStudio({ tab: 'design' });
            }
          } catch {
            /* ignore */
          }
        }
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
        if (willCode && !codingActivityRef.current) {
          beginCodingActivity('Grok Code — writing files to workspace', GO_WORK_STEPS, {
            subhead: 'Grok Code first, then v0 UI generation so files integrate.',
            initialLog: 'Coding intent detected — starting file apply',
          });
        }

        if (willCode) {
          setGrokActivity((prev) => {
            const mm =
              masterPlanPipeline.mindMapPageCount != null && masterPlanPipeline.mindMapPageCount > 0
                ? `Mind map: ${masterPlanPipeline.mindMapPageCount} page(s).`
                : undefined;
            return advanceGrokActivity(prev, showWorkActivity ? 4 : 2, {
              currentAction: 'Grok Code generating files — applying to workspace…',
              log: { message: 'Running Grok Code / file apply', kind: 'info' },
              ...(mm ? { stepDetail: { index: showWorkActivity ? 3 : 1, detail: mm } } : {}),
            });
          });
        }

        const coding = await handlePostGrokCodingTurn({
          assistantContent: masterPlanSource,
          planningPhase,
          userId,
          projectName,
          userNote: text,
          onProgress: codingActivityRef.current ? pushActivity : undefined,
        });
        if (coding.ran) {
          setGrokActivity((prev) =>
            advanceGrokActivity(prev, showWorkActivity ? 5 : 3, {
              currentAction: coding.statusMessage || 'Syncing mind map, explorer, and preview…',
              ...(coding.statusMessage
                ? {
                    stepDetail: { index: showWorkActivity ? 4 : 2, detail: coding.statusMessage },
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
          if (showWorkActivity) {
            setGrokActivity((prev) =>
              advanceGrokActivity(prev, showWorkActivity ? 6 : 4, {
                currentAction: 'Grok Code finished — starting v0 UI generation…',
                log: { message: 'UI Studio pipeline after Grok Code', kind: 'info' },
              }),
            );
          }
          masterPlanPipeline = await runMasterPlanUiPipelineWithV0({
            projectName,
            autoV0: false,
            onProgress: pushActivity,
          });
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
          pushActivity('Coding pass finished', 'success');
          resetCodingActivity();
        }
      } catch (codingErr) {
        console.warn('[AIChat] coding apply:', codingErr);
        if (codingActivityRef.current) {
          setSendError(
            codingErr instanceof Error ? codingErr.message : 'Could not write files to workspace',
          );
          resetCodingActivity();
        }
      }

      if (
        /<START_UIUX>/i.test(masterPlanSource) &&
        !willCode &&
        !masterPlanPipeline.v0Ok &&
        !masterPlanPipeline.v0Triggered
      ) {
        dispatchStartUiUxWorkflow({ tab: 'design', autoV0: false });
      }

      if (spoken.trim()) {
        scheduledTts = true;
        handsFreeResumeAfterTtsRef.current = openTalkDesiredRef.current;
        void playTtsForText(spoken);
      }
    } catch (e) {
      if (codingActivityRef.current) {
        resetCodingActivity();
      }
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
  }, [sending, activePath, activeTab?.content, serverHasGrokKey, micInputBlocked, workspaceRootLabel, gitBranch, tabs, pauseHandsFreeListening, resumeOpenTalkIfWanted, beginCodingActivity, pushActivity, resetCodingActivity, workspacePaths.length]);

  sendChatRef.current = sendChat;

  const playTtsForText = async (plain: string) => {
    resetHandsFreeSpeechTurn();
    pauseHandsFreeListening();

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
    setIsTtsPlaying(true);

    ttsDebounceTimerRef.current = window.setTimeout(async () => {
      ttsDebounceTimerRef.current = null;
      if (runId !== ttsRunIdRef.current) return;

      const chunks = splitTextForTts(plain);
      if (chunks.length === 0) {
        setIsTtsPlaying(false);
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

  const handleDesignFileUpload = useCallback(async (file: File) => {
    if (uploadBusy || sending) return;
    setUploadBusy(true);
    setAccessoryHint(`Uploading ${file.name}…`);
    try {
      const uploaded = await uploadFileToR2(file, {
        projectKey: getBrowserProjectKey(),
        category: file.type.startsWith('image/') ? 'images' : 'assets',
      });
      if (!uploaded.ok) {
        setAccessoryHint('error' in uploaded ? uploaded.error : 'Upload failed');
        window.setTimeout(() => setAccessoryHint(null), 5000);
        return;
      }
      await registerDesignReference({
        filename: file.name,
        url: uploaded.url,
        storageKey: uploaded.key,
        note: 'Brand / design reference from discovery upload',
      });
      setAccessoryHint(`Saved design reference: ${file.name}`);
      window.setTimeout(() => setAccessoryHint(null), 4500);
    } catch (e) {
      setAccessoryHint(e instanceof Error ? e.message : 'Upload failed');
      window.setTimeout(() => setAccessoryHint(null), 5000);
    } finally {
      setUploadBusy(false);
    }
  }, [uploadBusy, sending]);

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
    beginCodingActivity('Go — full coding pass', GO_WORK_STEPS, {
      subhead: 'One Go — Grok Code writes the full app (auto-continues if needed). Wait for the finished message.',
      initialLog: userNote ? `Go started — focus: ${userNote.slice(0, 120)}` : 'Go started — full implementation pass',
    });
    void refreshChatV0Status();

    void cancelProjectBackgroundJobs();

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
      const history = messagesRef.current
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .slice(-24)
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }));

      const go = await runGoCodeAndApply({
        userId,
        projectName,
        userNote,
        messages: history,
        onProgress: pushActivity,
      });
      await refreshChatV0Status();
      if (go.ok) {
        window.dispatchEvent(new CustomEvent('nebula-master-plan-updated'));
      }
      const goTs = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      const chatCompleteLine = go.ok
        ? `**Finished.** ${go.statusMessage}`
        : `**Go could not finish.** ${go.statusMessage}`;
      setMessages((p) => {
        const next = [
          ...p,
          {
            id: `go-a-${Date.now()}`,
            role: 'assistant' as const,
            content: chatCompleteLine,
            timestamp: goTs,
          },
        ];
        messagesRef.current = next;
        return next;
      });
      setGrokActivity((prev) =>
        advanceGrokActivity(prev, 3, {
          currentAction: go.ok ? 'Syncing Master Plan, mind map, explorer…' : go.statusMessage,
          ...(go.statusMessage
            ? { stepDetail: { index: 2, detail: go.statusMessage }, log: { message: go.statusMessage, kind: go.ok ? 'success' : 'error' } }
            : {}),
        }),
      );
      if (!go.ok) {
        setSendError(go.statusMessage);
        resetCodingActivity();
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
          currentAction: 'Grok Code done — syncing mind map & v0 prompt (Generate v0 in UI Studio when ready)…',
          log: { message: 'UI Studio pipeline (v0 prompt & mind map)', kind: 'info' },
        }),
      );
      const pipeline = await runMasterPlanUiPipelineWithV0({
        projectName,
        autoV0: false,
        onProgress: pushActivity,
      });
      const v0Snap = await refreshChatV0Status();
      if (pipeline.v0Ok) {
        window.dispatchEvent(new CustomEvent('nebula-ui-studio-v0-complete'));
        window.dispatchEvent(new CustomEvent('nebula-files-applied'));
        dispatchOpenUiStudio({ tab: 'design' });
      }
      if (pipeline.v0PromptWritten) {
        pushActivity('v0 prompt synced from Master Plan §4+§5', 'success');
      }
      pushActivity('Go pipeline finished', 'success');
      codingActivityRef.current = false;
      setGrokCodingActive(false);
      setGrokActivity((prev) => {
        const finished = finishGrokActivity(
          prev,
          'Go finished',
          GO_WORK_STEPS,
          go.statusMessage,
        );
        return v0Snap ? patchGrokActivityV0Status(finished, v0Snap.line, v0Snap.detail) : finished;
      });
      setV0Live(Boolean(v0Snap?.live));
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Go failed');
      resetCodingActivity();
    } finally {
      setSending(false);
      setAccessoryHint(null);
      if (openTalkDesiredRef.current) {
        resumeOpenTalkIfWanted();
      }
    }
  }, [micInputBlocked, sending, serverHasGrokKey, stopVoiceRecognition, refreshWorkspaceMeta, resumeOpenTalkIfWanted, pushActivity, beginCodingActivity, resetCodingActivity, refreshChatV0Status, workspacePaths.length]);

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

      {showFullActivityPanel ? (
        <div className="max-h-[min(240px,36vh)] shrink-0 overflow-y-auto border-b border-primary/15">
          <IdeGrokActivityPanel activity={grokActivity} />
        </div>
      ) : null}

      {showCompactPipelineBar ? (
        <ChatPipelineStatusBar
          headline={grokActivity.headline || 'Pipeline status'}
          summary={grokActivity.footer || grokActivity.currentAction}
          v0Status={grokActivity.v0Status}
          v0Detail={grokActivity.v0StatusDetail}
          v0Live={v0Live}
          onDismiss={dismissPipelineBanner}
        />
      ) : null}

      <div ref={scrollContainerRef} className="min-h-0 flex-1 space-y-3 overflow-auto p-3">
        {messages.length === 0 && !sending ? (
          <p className="type-body-md px-1 text-center text-muted-foreground">
            Grok will ask your first discovery question here — follow{' '}
            <span className="text-foreground/80">project-execution-rules.md</span> (one question per turn).
          </p>
        ) : null}
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
                {message.filePreview ? <ChatFilePreview preview={message.filePreview} /> : null}
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
                {showFullActivityPanel
                  ? 'Working… see live steps in the panel above.'
                  : 'Grok is thinking…'}
              </p>
            </div>
          </div>
        ) : null}
        <div ref={messagesEndRef} className="h-px shrink-0" aria-hidden />
      </div>

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
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf,.svg,.png,.jpg,.jpeg,.webp,.gif"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) void handleDesignFileUpload(file);
                }}
              />
              <ChatRoundButton
                label="Attach design reference (logo, brand guide)"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadBusy || sending}
              >
                <Paperclip className={cn('h-[18px] w-[18px]', uploadBusy ? 'opacity-50' : '')} />
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
