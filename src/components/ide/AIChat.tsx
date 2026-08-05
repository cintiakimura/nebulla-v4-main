import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Hand, Loader2, Mic, Paperclip, Send, User, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchSessionUser, syncActiveCloudProjectFromSession, upsertCloudProject } from '../../lib/nebulaCloud';
import {
  MAIN_AI_CHAT_SETUP_HINT,
  resolveAiLimitUserMessage,
  serverReportsMainAiKey,
} from '../../lib/grokKey';
import { fetchNebulaPublicConfig } from '../../lib/nebulaPublicConfig';
import { readResponseJson } from '../../lib/apiFetch';
import {
  getBrowserProjectKey,
  getBrowserProjectName,
  setBrowserProjectName,
  withProjectBody,
  withProjectQuery,
} from '../../lib/nebulaProjectApi';
import {
  cancelProjectBackgroundJobs,
  resetProjectFromScratch,
} from '../../lib/ideProjectReset';
import { sendIdeAssistantGrokTurn } from '../../lib/ideAssistantGrokChat';
import {
  conversationEntriesToIdeMessages,
  buildDiscoveryBootstrap,
  buildFastPrototypeBootstrap,
  buildIdeaDiscoveryBootstrap,
  FAST_PROTOTYPE_BOOTSTRAP_PREFIX,
  isHiddenBootstrapUserMessage,
} from '../../lib/ideChatBootstrap';
import {
  clearStoredStartMode,
  consumePendingStartMode,
  detectGuidedInterviewIntent,
  detectInferenceFirstIntent,
  isFastPrototypeMode,
  peekPendingStartMode,
  setPendingStartMode,
  setStoredStartMode,
} from '../../lib/ideStartMode';
import { fetchConversationLogEntries } from '../../lib/conversationLogClient';
import {
  formatAssistantForIdeChatDisplay,
  persistMasterPlanFromAssistantSource,
} from '../../lib/grokChatArtifacts';
import { sanitizeAssistantChatText } from '../../../lib/assistantChatSanitize';
import { dispatchOpenUiStudio, dispatchStartUiUxWorkflow } from '../../lib/nebulaUiStudioEvents';
import {
  handlePostGrokCodingTurn,
  applyArchitectureArtifactsFromAssistant,
  hasGrokFileBlocks,
  isCodingIntent,
  runGoCodeAndApply,
} from '../../lib/nebulaAiCodingPipeline';
import { isShortCodingGoNudge, SHORT_CODING_GO_SUMMARY } from '../../lib/ideShortCodingNudge';
import { setGrokCodingActive } from '../../lib/nebulaGrokCodingGate';
import { runMasterPlanUiPipeline, runPostCodingWorkspaceSync } from '../../lib/ideArtifactSync';
import {
  dispatchOpenUiStudioBeta,
  triggerUiStudioBetaAfterPlanReady,
} from '../../lib/uiStudioBetaEngine';
import {
  clearDiscoveryClosed,
  clearIdeWorkspaceMetaCache,
  detectBuildModeIntent,
  detectOnboardingBuildStart,
  detectProjectNameAnswer,
  fetchIdeWorkspaceMeta,
  isDiscoveryClosed,
  markDiscoveryClosed,
} from '../../lib/ideWorkspaceChatContext';
import {
  assessUiMockupReadiness,
  clearUiMockupStageFlags,
  markUiMockupStageStarted,
  setInferenceFirstStage,
} from '../../lib/uiMockupGate';
import { createProjectForCurrentSession } from '../../lib/nebulaCloud';
import { handleSmartChatMessage, type SmartChatFilePreview } from '../../lib/smartChatHandler';
import { isMasterPlanCompleteForDiscovery } from '../../lib/masterPlanSections';
import {
  interactionModeIdleSubhead,
  type IdeAssistantInteractionMode,
} from '../../lib/ideAssistantInteractionMode';
import {
  consumeGuidedStartOnReady,
  consumePendingProjectIdea,
  consumePendingProjectType,
  peekPendingProjectIdea,
  setPendingProjectIdea,
  setPendingProjectType,
  NEBULA_CHAT_OPEN_FILE,
  NEBULA_START_FREE_CHAT,
  NEBULA_START_GUIDED_CHAT,
  NEBULA_START_GUIDED_ON_READY_KEY,
  type StartGuidedChatDetail,
} from '../../lib/ideHomeEvents';
import { shortNameFromIdea } from '../../lib/projectNameFromIdea';
import { ideContextSnippetForChat, useIdeWorkspace } from '@/components/ide/IdeWorkspaceContext';
import { useIdeCenterTabs } from '@/components/ide/IdeCenterTabsContext';
import { ChatFilePreview } from '@/components/ide/ChatFilePreview';
import { uploadFileToR2 } from '../../lib/nebulaStorageClient';
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
  type GrokActivityLogKind,
} from '../../lib/ideGrokActivityStatus';
import { emitChatV0Progress, emitChatV0Watch, fetchChatV0StatusSnapshot } from '../../lib/chatV0Status';
import { requestCancelV0ClientPoll } from '../../lib/v0GenerationClient';
import { getV0RequestHeaders } from '../../lib/v0Key';
import {
  MIC_REENABLE_AFTER_TTS_MS,
  OPEN_TALK_MIN_SPEAKING_MS,
  OPEN_TALK_PAUSE_GRACE_MS,
  OPEN_TALK_SILENCE_SEND_MS,
  stripAssistantTagsForVoice,
} from '../../lib/voiceTtsShared';
import { playTtsText } from '../../lib/ttsPlayback';
import { IdeGrokActivityPanel } from './IdeGrokActivityPanel';
import { IdeAppStatusMenuButton } from './IdeAppStatusMenu';
import {
  APP_STATUS_EVENTS,
  assistantSkippedNdmVerify,
  formatLatestAppStatusDebugMessage,
  getAppRuntimeSnapshot,
  getAppStatusDebugIssues,
  looksLikeBrokenAppComplaint,
  markAppRuntimePendingValidation,
  reportAppRuntimeIssue,
  requestAppPreviewReload,
  resetAppRuntimeForProject,
  shouldMarkAppStatusValidation,
} from '../../lib/ideAppRuntimeStatus';
import { postContractTelemetry } from '../../lib/contractTelemetryClient';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import { bcp47ForLocale } from '../../lib/i18n/locales';
import { t as translateStatic } from '../../lib/i18n/t';

const MAX_CHAT_ATTACH_BYTES = 12 * 1024 * 1024;

function idleGrokActivity(mode: IdeAssistantInteractionMode): GrokActivityStatus {
  return {
    headline: translateStatic('ide.activity.ready'),
    liveLog: [],
    steps: [],
    activeStepIndex: 0,
    footer: translateStatic('ide.activity.readyFooter'),
    tone: 'ready',
    subhead: interactionModeIdleSubhead(mode),
  };
}

function chatWorkSteps(): { label: string }[] {
  return [1, 2, 3, 4, 5, 6].map((n) => ({ label: translateStatic(`ide.activity.chat.${n}`) }));
}

function goWorkSteps(): { label: string }[] {
  return [1, 2, 3, 4, 5].map((n) => ({ label: translateStatic(`ide.activity.go.${n}`) }));
}

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
  /** Chat mode blocked coding — show Switch to Agent CTA */
  showSwitchToAgentCta?: boolean;
  /** Pending user text to re-send after switching to Agent */
  pendingAgentText?: string;
  /** After Go — nudge reload Preview to validate slice */
  validateReloadHint?: boolean;
  /** Live thinking / action step — shown in-chat, not sent to the model API */
  variant?: 'status';
  statusKind?: GrokActivityLogKind;
};

function ChatRoundButton({
  children,
  label,
  onClick,
  disabled,
  size = 'md',
}: {
  children: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'btn-secondary-surface flex shrink-0 items-center justify-center rounded-full text-muted-foreground ring-1 ring-[color-mix(in_srgb,var(--outline-variant)_12%,transparent)] transition-[background-color,box-shadow,color] duration-300 ease-out hover:text-foreground hover:ring-[color-mix(in_srgb,var(--outline-variant)_22%,transparent)] disabled:pointer-events-none disabled:opacity-40',
        size === 'sm' ? 'h-7 w-7' : 'h-9 w-9',
      )}
    >
      {children}
    </button>
  );
}

function statusKindClass(kind?: GrokActivityLogKind): string {
  switch (kind) {
    case 'success':
      return 'text-emerald-300/90';
    case 'error':
      return 'text-red-300/95';
    case 'warn':
      return 'text-amber-200/90';
    case 'file':
      return 'text-primary/90';
    case 'wait':
      return 'text-muted-foreground';
    default:
      return 'text-muted-foreground/90';
  }
}

export function AIChat() {
  const {
    activePath,
    activeTab,
    diskProjectKey,
    refreshTree,
    gitBranch,
    tabs,
    workspacePaths,
    chatModel,
    assistantInteractionMode,
    setAssistantInteractionMode,
  } = useIdeWorkspace();
  const { activeTab: centerActiveTab, openPanel } = useIdeCenterTabs();
  /** Center My Projects / discovery already owns the hero — keep chat secondary. */
  const centerIsProjectsHome =
    centerActiveTab?.kind === 'panel' && centerActiveTab.pane === 'projects';
  const {
    t,
    resolvedIdeLocale,
    resolvedContentLocale,
    prefs,
    noteUserMessageForMirror,
    localeLabels,
  } = useLanguage();
  const contentLocaleRef = useRef(resolvedContentLocale);
  contentLocaleRef.current = resolvedContentLocale;
  const voiceLocaleFallbackNotifiedRef = useRef(false);
  const interactionModeRef = useRef(assistantInteractionMode);
  interactionModeRef.current = assistantInteractionMode;
  const [workspaceRootLabel, setWorkspaceRootLabel] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [uploadBusy, setUploadBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [accessoryHint, setAccessoryHint] = useState<string | null>(null);
  const [grokActivity, setGrokActivity] = useState<GrokActivityStatus>(() =>
    idleGrokActivity(assistantInteractionMode),
  );
  const [v0WatchActive, setV0WatchActive] = useState(false);
  const [v0Live, setV0Live] = useState(false);
  const [masterPlanCompleteHint, setMasterPlanCompleteHint] = useState(false);
  const codingActivityRef = useRef(false);
  const syncedStatusLogIdsRef = useRef<Set<string>>(new Set());
  const stickToBottomRef = useRef(true);
  const lastV0StatusRef = useRef<string>('');
  const pendingAgentResendRef = useRef<string | null>(null);

  const resetCodingActivity = useCallback(() => {
    codingActivityRef.current = false;
    setGrokCodingActive(false);
    setV0WatchActive(false);
    setV0Live(false);
    setGrokActivity(idleGrokActivity(interactionModeRef.current));
  }, []);

  useEffect(() => {
    setGrokActivity((prev) =>
      prev.tone === 'ready'
        ? idleGrokActivity(assistantInteractionMode)
        : { ...prev, subhead: interactionModeIdleSubhead(assistantInteractionMode) },
    );
  }, [assistantInteractionMode, t]);

  useEffect(() => {
    const onLooksFixed = () => {
      setAccessoryHint(t('appStatus.looksFixed'));
      window.setTimeout(() => setAccessoryHint(null), 4000);
    };
    window.addEventListener(APP_STATUS_EVENTS.looksFixed, onLooksFixed);
    return () => window.removeEventListener(APP_STATUS_EVENTS.looksFixed, onLooksFixed);
  }, [t]);

  useEffect(() => {
    resetAppRuntimeForProject();
  }, [diskProjectKey]);

  const appStatusVoiceNudgeRef = useRef(0);
  const playTtsForTextRef = useRef<(plain: string) => Promise<void>>(async () => {});
  const onAppStatusVoiceNudge = useCallback((spoken: string) => {
    const now = Date.now();
    if (now - appStatusVoiceNudgeRef.current < 15000) return;
    if (!openTalkDesiredRef.current) return;
    appStatusVoiceNudgeRef.current = now;
    void playTtsForTextRef.current(spoken).catch(() => {});
  }, []);

  const beginCodingActivity = useCallback(
    (headline: string, steps: GrokActivityStep[], options?: Parameters<typeof createGrokActivity>[2]) => {
      codingActivityRef.current = true;
      setGrokCodingActive(true);
      stickToBottomRef.current = true;
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
    // In-place update of the latest status bubble for wait/elapsed ticks (Cursor-like).
    if (options?.currentOnly) {
      setMessages((prev) => {
        for (let i = prev.length - 1; i >= 0; i--) {
          if (prev[i]?.variant === 'status') {
            const next = [...prev];
            next[i] = { ...next[i], content: message, statusKind: kind };
            messagesRef.current = next;
            return next;
          }
        }
        return prev;
      });
    }
  }, []);

  /** Manual V0 watch only — do not inject V0 readiness into Live Activity after Go / file apply. */
  const refreshChatV0Status = useCallback(async () => {
    try {
      const snap = await fetchChatV0StatusSnapshot();
      return snap;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    const onProgress = (ev: Event) => {
      const d = (ev as CustomEvent<{ line?: string; detail?: string }>).detail;
      if (!d?.line) return;
      // Only surface when user explicitly started a manual V0 watch (original studio).
      setV0Live(true);
      setV0WatchActive(true);
      setGrokActivity((prev) => {
        let next = patchGrokActivityV0Status(prev, d.line!, d.detail);
        const line = `v0 · ${d.line}`;
        if (lastV0StatusRef.current !== line) {
          lastV0StatusRef.current = line;
          next = commitGrokActivityStatus(next, line, 'info');
        }
        return next;
      });
    };
    const onWatch = (ev: Event) => {
      const active = Boolean((ev as CustomEvent<{ active?: boolean }>).detail?.active);
      setV0WatchActive(active);
      setV0Live(active);
    };
    const onV0Done = () => {
      setV0WatchActive(false);
      setV0Live(false);
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
  }, []);

  useEffect(() => {
    if (!v0WatchActive) return;
    void refreshChatV0Status().then((snap) => {
      if (!snap) return;
      setGrokActivity((prev) => patchGrokActivityV0Status(prev, snap.line, snap.detail));
      setV0Live(Boolean(snap.live));
    });
    const id = window.setInterval(() => {
      void refreshChatV0Status().then((snap) => {
        if (!snap) return;
        setGrokActivity((prev) => patchGrokActivityV0Status(prev, snap.line, snap.detail));
        setV0Live(Boolean(snap.live));
      });
    }, 4000);
    return () => window.clearInterval(id);
  }, [v0WatchActive, refreshChatV0Status]);

  // Fallback cancel/clear when UI Studio editor is not mounted.
  useEffect(() => {
    const onCancel = () => {
      requestCancelV0ClientPoll();
      emitChatV0Watch(false);
      void cancelProjectBackgroundJobs().then(() => {
        emitChatV0Progress('v0 cancelled — polling stopped. Use Resume if v0-pro is still working.');
        void refreshChatV0Status();
      });
    };
    const onClear = () => {
      requestCancelV0ClientPoll();
      emitChatV0Watch(false);
      void (async () => {
        await cancelProjectBackgroundJobs();
        try {
          await fetch(withProjectQuery('/api/nebula-ui-studio/v0-clear'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getV0RequestHeaders() },
            credentials: 'include',
            body: JSON.stringify(withProjectBody({})),
          });
        } catch {
          /* ignore */
        }
        emitChatV0Progress('v0 session cleared — use original UI Studio to generate manually if needed.');
        void refreshChatV0Status();
      })();
    };
    window.addEventListener('nebula-ui-studio-cancel-v0', onCancel);
    window.addEventListener('nebula-ui-studio-clear-v0', onClear);
    return () => {
      window.removeEventListener('nebula-ui-studio-cancel-v0', onCancel);
      window.removeEventListener('nebula-ui-studio-clear-v0', onClear);
    };
  }, [refreshChatV0Status]);

  // Stream activity log into the chat as status messages (newest at bottom).
  useEffect(() => {
    const entries = grokActivity.liveLog;
    if (!entries.length) return;
    const fresh = entries.filter((e) => !syncedStatusLogIdsRef.current.has(e.id));
    if (!fresh.length) return;
    for (const e of fresh) syncedStatusLogIdsRef.current.add(e.id);
    const ts = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    setMessages((prev) => {
      const next = [
        ...prev,
        ...fresh.map((e) => ({
          id: `status-${e.id}`,
          role: 'assistant' as const,
          variant: 'status' as const,
          content: e.message,
          timestamp: ts,
          statusKind: e.kind,
        })),
      ];
      messagesRef.current = next;
      return next;
    });
  }, [grokActivity.liveLog]);

  const showActivityPanel =
    grokActivity.tone === 'work' ||
    v0WatchActive ||
    v0Live ||
    Boolean(grokActivity.v0Status) ||
    grokActivity.liveLog.length > 0;

  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [serverHasGrokKey, setServerHasGrokKey] = useState<boolean | null>(null);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  /** True while TTS audio is playing; mic stays off (project-execution-rules.md). */
  const [isTtsPlaying, setIsTtsPlaying] = useState(false);
  /** Mic stays off for `MIC_REENABLE_AFTER_TTS_MS` after TTS ends. */
  const [micCooldown, setMicCooldown] = useState(false);
  const [, setIsHandsFree] = useState(false);

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
  /** State (not only ref) so bootstrap effect re-runs after history finishes loading. */
  const [chatHistoryReady, setChatHistoryReady] = useState(false);

  const isNearBottom = useCallback((el: HTMLDivElement, thresholdPx = 96) => {
    return el.scrollHeight - el.scrollTop - el.clientHeight <= thresholdPx;
  }, []);

  const scrollChatToBottom = useCallback((instant = true) => {
    if (!stickToBottomRef.current) return;
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

  const onChatScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    stickToBottomRef.current = isNearBottom(el);
  }, [isNearBottom]);

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
      setAccessoryHint(t('chat.speechUnsupported'));
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
    recognition.lang = bcp47ForLocale(contentLocaleRef.current);

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
        ev.error === 'not-allowed'
          ? t('chat.openTalkMicDenied')
          : t('chat.openTalkError', { error: ev.error }),
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
        setAccessoryHint(t('chat.openTalkOn'));
        window.setTimeout(() => setAccessoryHint(null), 5200);
      }
    } catch (err) {
      console.warn('[AIChat] hands-free start', err);
      setAccessoryHint(t('chat.openTalkStartFailed'));
      window.setTimeout(() => setAccessoryHint(null), 4500);
    }
  }, [stopHandsFree, scheduleHandsFreeAutoSend, noteHandsFreeSpeechActivity, t]);

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
    setChatHistoryReady(false);
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
        if (!cancelled) {
          chatHistoryLoadedRef.current = true;
          setChatHistoryReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [diskProjectKey]);

  const startGuidedDiscovery = useCallback(() => {
    clearDiscoveryClosed(diskProjectKey);
    const startMode = consumePendingStartMode();
    setStoredStartMode(startMode, diskProjectKey);
    const ideaPrompt = consumePendingProjectIdea();
    const projectType = consumePendingProjectType();

    if (startMode === 'fast_prototype') {
      // Fast Prototype drafts + codes — Agent on; do not force Guided rediscovery.
      markDiscoveryClosed(diskProjectKey);
      if (interactionModeRef.current === 'chat') {
        interactionModeRef.current = 'agent';
        setAssistantInteractionMode('agent');
      }
      if (ideaPrompt) {
        const stamp = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        const visibleIdea: Message = {
          id: `u-idea-${Date.now()}`,
          role: 'user',
          content: ideaPrompt,
          timestamp: stamp,
        };
        setMessages([visibleIdea]);
        messagesRef.current = [visibleIdea];
      }
      void sendChatRef.current(buildFastPrototypeBootstrap(ideaPrompt, projectType));
      return;
    }

    if (ideaPrompt) {
      const stamp = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      const visibleIdea: Message = {
        id: `u-idea-${Date.now()}`,
        role: 'user',
        content: ideaPrompt,
        timestamp: stamp,
      };
      setMessages([visibleIdea]);
      messagesRef.current = [visibleIdea];
      void sendChatRef.current(buildIdeaDiscoveryBootstrap(ideaPrompt, projectType));
      return;
    }
    void sendChatRef.current(buildDiscoveryBootstrap(projectType));
  }, [diskProjectKey, setAssistantInteractionMode]);

  useEffect(() => {
    const onReset = () => {
      setMessages([]);
      messagesRef.current = [];
      chatHistoryLoadedRef.current = true;
      setChatHistoryReady(true);
      bootstrapStartedRef.current = false;
      setSendError(null);
      clearDiscoveryClosed(diskProjectKey);
      clearStoredStartMode(diskProjectKey);
      clearUiMockupStageFlags(diskProjectKey);
      // Do NOT consume guided-on-ready here. "Start with a prompt" reloads the page after
      // reset; consuming the flag on reset left the idea stranded in localStorage.
    };
    window.addEventListener('nebula-project-reset', onReset);
    return () => window.removeEventListener('nebula-project-reset', onReset);
  }, [diskProjectKey]);

  // Post-login: stay quiet until My Projects → New Project (or explicit guided event).
  useEffect(() => {
    if (serverHasGrokKey !== true) return;
    if (!chatHistoryReady) return;
    if (bootstrapStartedRef.current || sendingRef.current) return;
    // Prefer pending idea from "Start with a prompt" even if chat log restored noise.
    const pendingIdea = peekPendingProjectIdea();
    // Peek-only until we commit — do not burn the flag on a skipped turn.
    let guidedFlag = false;
    try {
      guidedFlag = localStorage.getItem(NEBULA_START_GUIDED_ON_READY_KEY) === '1';
    } catch {
      guidedFlag = false;
    }
    if (!guidedFlag && !pendingIdea) return;
    if (!pendingIdea && messagesRef.current.length > 0) return;
    bootstrapStartedRef.current = true;
    consumeGuidedStartOnReady();
    startGuidedDiscovery();
  }, [serverHasGrokKey, chatHistoryReady, messages.length, diskProjectKey, startGuidedDiscovery]);

  useEffect(() => {
    const stamp = () =>
      new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

    const onGuided = (ev: Event) => {
      if (sendingRef.current) return;
      const detail = (ev as CustomEvent<StartGuidedChatDetail>).detail;
      const fromEventType = detail?.projectType;
      const fromEventIdea = detail?.ideaPrompt?.trim();
      if (fromEventIdea) setPendingProjectIdea(fromEventIdea);
      if (fromEventType) setPendingProjectType(fromEventType);
      // Live event without pending mode → respect stored pending, else default inference-first.
      if (!peekPendingStartMode()) setPendingStartMode('fast_prototype');
      const pendingIdea = peekPendingProjectIdea() || fromEventIdea;
      if (!pendingIdea && messagesRef.current.length > 0) return;
      bootstrapStartedRef.current = true;
      startGuidedDiscovery();
    };

    const onFree = () => {
      if (messagesRef.current.length > 0) return;
      bootstrapStartedRef.current = true;
      const welcome: Message = {
        id: `a-free-${Date.now()}`,
        role: 'assistant',
        content: t('chat.greeting'),
        timestamp: stamp(),
      };
      setMessages([welcome]);
      messagesRef.current = [welcome];
    };

    const onOpenFile = (ev: Event) => {
      const detail = (ev as CustomEvent<{ path?: string; url?: string }>).detail || {};
      const text = detail.url
        ? detail.url
        : detail.path
          ? `open file ${detail.path}`
          : '';
      if (!text) return;
      void sendChatRef.current(text);
    };

    window.addEventListener(NEBULA_START_GUIDED_CHAT, onGuided);
    window.addEventListener(NEBULA_START_FREE_CHAT, onFree);
    window.addEventListener(NEBULA_CHAT_OPEN_FILE, onOpenFile as EventListener);
    return () => {
      window.removeEventListener(NEBULA_START_GUIDED_CHAT, onGuided);
      window.removeEventListener(NEBULA_START_FREE_CHAT, onFree);
      window.removeEventListener(NEBULA_CHAT_OPEN_FILE, onOpenFile as EventListener);
    };
  }, [t]);

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
    const rawText = (textOverride ?? inputRef.current).trim();
    if (!rawText || sending) return;

    if (micInputBlocked) return;

    // Mirror sticky content locale (hysteresis) — skip hidden bootstraps.
    if (!isHiddenBootstrapUserMessage(rawText)) {
      const before = contentLocaleRef.current;
      const after = noteUserMessageForMirror(rawText) || before;
      if (prefs.contentMode === 'mirror' && after !== before) {
        setAccessoryHint(
          t('chat.replyingIn', { lang: localeLabels[after] || after }),
        );
        window.setTimeout(() => setAccessoryHint(null), 3200);
      }
    }

    // Attach App Status Verify evidence when user says "it's broken" (or payload already present).
    let text = rawText;
    const alreadyHasAppStatus = /\[APP_STATUS_DEBUG\]/i.test(rawText);
    if (!alreadyHasAppStatus && looksLikeBrokenAppComplaint(rawText)) {
      const payload = formatLatestAppStatusDebugMessage({
        openFilePath: activePath || undefined,
      });
      if (payload) {
        text = `${rawText}\n\n${payload}`;
      }
    } else if (alreadyHasAppStatus && activePath && !/ide_open_file:/i.test(text)) {
      text = `${text.trimEnd()}\nide_open_file: ${activePath}`;
    }
    const hasAppStatusPayload = /\[APP_STATUS_DEBUG\]/i.test(text);
    const appStatusTechnicalMessages = hasAppStatusPayload
      ? (() => {
          const { primary, related } = getAppStatusDebugIssues(3);
          return [primary, ...related]
            .filter(Boolean)
            .map((i) => i!.technicalMessage);
        })()
      : [];

    // Smart Chat Handler — File mode short-circuits; other modes pass hints into Grok.
    // Never intercept hidden bootstrap, Master Plan discovery replies, or Go Code turns.
    let chatMode: string | undefined;
    let codingHint: string | undefined;
    let discoveryRequired: boolean | undefined;
    if (!isHiddenBootstrapUserMessage(rawText)) {
      try {
        let masterPlanComplete = false;
        try {
          const mpRes = await fetch(withProjectQuery('/api/master-plan/read'), {
            credentials: 'include',
            cache: 'no-store',
          });
          if (mpRes.ok) {
            const mp = (await readResponseJson(mpRes)) as Record<string, unknown>;
            masterPlanComplete = isMasterPlanCompleteForDiscovery(mp);
          }
        } catch {
          masterPlanComplete = false;
        }
        const smart = await handleSmartChatMessage(rawText, {
          masterPlanComplete,
          interactionMode: interactionModeRef.current,
        });
        chatMode = smart.mode;
        codingHint = smart.codingHint;
        discoveryRequired = smart.modeMeta?.discoveryRequired === true;
        // User already confirmed final Discovery — never force rediscovery on later turns.
        if (isDiscoveryClosed(diskProjectKey) || masterPlanComplete) {
          discoveryRequired = false;
        }
        const interviewIntent = detectGuidedInterviewIntent(rawText);
        const inferenceIntent = detectInferenceFirstIntent(rawText, {
          masterPlanComplete,
          hasAppStatusPayload: /\[APP_STATUS_DEBUG\]/i.test(rawText),
        });
        const runInferenceFirst =
          !interviewIntent &&
          chatMode !== 'debugging' &&
          chatMode !== 'file' &&
          (inferenceIntent ||
            smart.codingHint === 'fast-prototype' ||
            Boolean(smart.modeMeta?.inferenceFirst && chatMode === 'coding'));

        if (interviewIntent) {
          setStoredStartMode('guided', diskProjectKey);
          discoveryRequired = true;
          chatMode = 'guided';
          codingHint = 'guided-onboarding';
        } else if (runInferenceFirst) {
          // Default path: inference-first — auto Agent so files/plan apply.
          setStoredStartMode('fast_prototype', diskProjectKey);
          markDiscoveryClosed(diskProjectKey);
          if (interactionModeRef.current === 'chat') {
            interactionModeRef.current = 'agent';
            setAssistantInteractionMode('agent');
          }
          discoveryRequired = false;
          chatMode = 'coding';
          codingHint = 'fast-prototype';
        } else if (!masterPlanComplete && !interviewIntent) {
          // Casual chat: never force Guided rediscovery when inference-first is the default path.
          discoveryRequired = false;
          if (
            isFastPrototypeMode(diskProjectKey) &&
            (codingHint === 'discovery-required' || codingHint === 'guided-onboarding')
          ) {
            codingHint = undefined;
          }
        }
        setMasterPlanCompleteHint(masterPlanComplete);
        if (hasAppStatusPayload && interactionModeRef.current === 'agent') {
          chatMode = 'debugging';
          codingHint =
            'NDM: Verify from App Status payload (do not ask what error they see). Analyze → Trace → Fix → Validate.';
        }
        if (smart.handledLocally && (smart.mode === 'file' || smart.switchToAgentSuggested)) {
          const stamp = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
          const userMsg: Message = {
            id: `u-${Date.now()}`,
            role: 'user',
            content: rawText,
            timestamp: stamp,
          };
          const assistantMsg: Message = {
            id: `a-${Date.now()}`,
            role: 'assistant',
            content: smart.assistantMessage,
            timestamp: stamp,
            filePreview: smart.filePreview,
            showSwitchToAgentCta: Boolean(smart.switchToAgentSuggested),
            pendingAgentText: smart.switchToAgentSuggested ? rawText : undefined,
          };
          setMessages((p) => {
            const next = [...p, userMsg, assistantMsg];
            messagesRef.current = next;
            return next;
          });
          setInput('');
          inputRef.current = '';
          if (smart.switchToAgentSuggested) {
            try {
              console.info('[AIChat] interaction_mode=chat blocked agent intent', {
                detector_mode: smart.mode,
                interaction_mode: 'chat',
              });
            } catch {
              /* ignore */
            }
          }
          return;
        }
      } catch {
        /* fall through to normal Grok / Master Plan / Go chat */
      }
    } else if (rawText.trim().startsWith(FAST_PROTOTYPE_BOOTSTRAP_PREFIX)) {
      discoveryRequired = false;
      codingHint = 'fast-prototype';
      chatMode = 'coding';
    }

    // Chat "Create a new project: …" — default inference-first (same as My Projects Continue).
    const projectCreation = detectProjectCreationIntent(rawText);
    if (projectCreation) {
      const shortName = shortNameFromIdea(projectCreation.description);
      await createProjectForCurrentSession(shortName);
      clearIdeWorkspaceMetaCache();
      setStoredStartMode('fast_prototype', diskProjectKey);
      markDiscoveryClosed(diskProjectKey);
      if (interactionModeRef.current === 'chat') {
        interactionModeRef.current = 'agent';
        setAssistantInteractionMode('agent');
      }

      setInput('');
      inputRef.current = '';

      const stamp = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      const visibleIdea: Message = {
        id: `u-idea-${Date.now()}`,
        role: 'user',
        content: projectCreation.description,
        timestamp: stamp,
      };
      setMessages((p) => {
        const next = [...p, visibleIdea];
        messagesRef.current = next;
        return next;
      });

      setTimeout(() => {
        void sendChatRef.current(buildFastPrototypeBootstrap(projectCreation.description));
      }, 10);

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
    const isBootstrapTrigger = isHiddenBootstrapUserMessage(rawText);
    const projectNameAnswer = detectProjectNameAnswer(rawText, prior);
    if (projectNameAnswer) {
      setBrowserProjectName(projectNameAnswer);
      clearIdeWorkspaceMetaCache();
      void upsertCloudProject({ name: projectNameAnswer, pages: [], edges: [] }).catch(() => {});
    }
    const latestAppIssue = alreadyHasAppStatus ? getAppStatusDebugIssues(1).primary : null;
    const displayContent =
      alreadyHasAppStatus && latestAppIssue?.friendlyTitle
        ? `Fix preview issue: ${latestAppIssue.friendlyTitle}`
        : alreadyHasAppStatus
          ? 'Fix the preview issue from App Status'
          : rawText;
    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: displayContent,
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
    stickToBottomRef.current = true;
    setSending(true);
    setSendError(null);
    const discoveryCompleteAck = detectOnboardingBuildStart(rawText, prior);
    // Product promise: "nothing more to add" starts coding — even if the toggle is still Chat.
    if (discoveryCompleteAck && interactionModeRef.current === 'chat') {
      interactionModeRef.current = 'agent';
      setAssistantInteractionMode('agent');
      setAccessoryHint('Discovery done — switching to Agent and starting the first coding slice.');
      window.setTimeout(() => setAccessoryHint(null), 4500);
    }
    if (discoveryCompleteAck) {
      markDiscoveryClosed(diskProjectKey);
      discoveryRequired = false;
      chatMode = 'coding';
      codingHint = 'discovery-complete-start-coding';
    }
    const lockedChat = interactionModeRef.current === 'chat';
    const onboardingBuildStart = discoveryCompleteAck;
    const fastPrototypeTurn =
      codingHint === 'fast-prototype' ||
      rawText.trim().startsWith(FAST_PROTOTYPE_BOOTSTRAP_PREFIX);
    const buildMode =
      !lockedChat &&
      !hasAppStatusPayload &&
      (detectBuildModeIntent(rawText) || onboardingBuildStart || fastPrototypeTurn);
    const showWorkActivity = buildMode || onboardingBuildStart || fastPrototypeTurn;
    try {
      console.info('[AIChat] turn', {
        interaction_mode: interactionModeRef.current,
        detector_mode: chatMode,
        build_mode: buildMode,
        onboarding_build_start: onboardingBuildStart,
        discovery_required: discoveryRequired,
        app_status: hasAppStatusPayload,
      });
    } catch {
      /* ignore */
    }
    if (onboardingBuildStart) {
      beginCodingActivity(
        'Discovery complete — saving Master Plan and starting code',
        chatWorkSteps(),
        {
          subhead:
            'Nothing more to add — writing Master Plan, then Grok Code builds the first slice.',
          initialLog: `Discovery complete — "${rawText.trim()}"`,
        },
      );
      pushActivity('Final discovery confirmed — Master Plan + START_CODING', 'info');
    } else if (fastPrototypeTurn) {
      beginCodingActivity(
        'Fast Prototype — inferring standards and drafting the first build',
        chatWorkSteps(),
        {
          subhead:
            'Industry defaults → draft Master Plan (assumptions labeled) → Foundation slice.',
          initialLog: 'Fast Prototype mode — inference-first (Guided interview skipped)',
        },
      );
      pushActivity('Fast Prototype — drafting Master Plan from inferred standards', 'info');
    } else if (buildMode) {
      beginCodingActivity(
        'Build mode — Grok is implementing your request',
        chatWorkSteps(),
        {
          subhead: 'Master Plan → Grok Code → files on disk.',
          initialLog: `Build mode — "${rawText.slice(0, 80)}${rawText.length > 80 ? '…' : ''}"`,
        },
      );
      pushActivity(`Project: ${getBrowserProjectName().trim() || 'Untitled project'}`, 'info');
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

    const historyForApi = [...prior, { ...userMsg, content: text }]
      .filter((m) => m.variant !== 'status')
      .map((m) => ({
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
          chatModel,
          chatMode,
          codingHint,
          discoveryRequired,
          interactionMode: interactionModeRef.current,
          hasAppStatusPayload,
          appStatusTechnicalMessages,
          ideLocale: resolvedIdeLocale,
          contentLocale: contentLocaleRef.current,
          contentMode: prefs.contentMode,
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
      const agentAllowed = interactionModeRef.current === 'agent';
      const shortCodingNudge = isShortCodingGoNudge(displayText || raw);
      const willCode =
        agentAllowed &&
        (hadCodingTag ||
          hasGrokFileBlocks(raw) ||
          isCodingIntent(masterPlanSource) ||
          onboardingBuildStart ||
          fastPrototypeTurn ||
          shortCodingNudge);
      const spoken = stripAssistantTagsForVoice(
        shortCodingNudge && !displayText.trim() ? SHORT_CODING_GO_SUMMARY : displayText,
      );
      const ts = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      const toAppend: Message[] = [];
      if (displayText.trim()) {
        toAppend.push({
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: displayText.trim(),
          timestamp: ts,
        });
      } else if (willCode && (onboardingBuildStart || shortCodingNudge)) {
        toAppend.push({
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: onboardingBuildStart
            ? 'Discovery looks complete — starting the first coding slice in your workspace now.'
            : SHORT_CODING_GO_SUMMARY,
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

      // Start TTS as soon as spoken text exists — do not wait for UI pipeline / coding.
      if (spoken.trim()) {
        scheduledTts = true;
        handsFreeResumeAfterTtsRef.current = openTalkDesiredRef.current;
        void playTtsForText(spoken);
      }

      let masterPlanPipeline: Awaited<ReturnType<typeof runMasterPlanUiPipeline>> = {};
      if (mpSaved > 0) {
        if (showWorkActivity) {
          setGrokActivity((prev) =>
            advanceGrokActivity(prev, 3, {
              currentAction: willCode
                ? 'UI pipeline — mind map + ui-brief (mockup before coding)…'
                : 'Syncing mind map + ui-brief from Master Plan…',
              stepDetail: {
                index: 2,
                detail: `Saved ${mpSaved} Master Plan section(s). Building mind map + ui-brief from §4/§5…`,
              },
              log: {
                message: `Master Plan updated — ${mpSaved} tab(s); syncing mind map + ui-brief`,
                kind: 'success',
              },
            }),
          );
        }
        masterPlanPipeline = await runMasterPlanUiPipeline({
          projectName,
          autoV0: false,
          quietV0Status: true,
          onProgress: showWorkActivity ? pushActivity : undefined,
        });
        if ((masterPlanPipeline.mindMapPageCount ?? 0) > 0) {
          try {
            window.dispatchEvent(new CustomEvent('nebula-master-plan-updated'));
            window.dispatchEvent(new CustomEvent('nebula-mind-map-updated'));
          } catch {
            /* ignore */
          }
        }
        setInferenceFirstStage('plan_drafted', diskProjectKey);
      }

      // Architecture docs (research + optional richer ui-brief) before mockup gate — not app code.
      if (agentAllowed && (fastPrototypeTurn || willCode || mpSaved > 0) && hasGrokFileBlocks(raw)) {
        try {
          await applyArchitectureArtifactsFromAssistant(raw, {
            projectName,
            onProgress: pushActivity,
          });
        } catch (archErr) {
          console.warn('[AIChat] architecture artifact apply:', archErr);
        }
      }

      // Stage B — UI mockup after plan + ui-brief, BEFORE coding (single API key queue).
      let uiMockupStarted = false;
      if (agentAllowed && (fastPrototypeTurn || willCode || mpSaved > 0)) {
        const readiness = await assessUiMockupReadiness({ projectKey: diskProjectKey });
        if (readiness.ok) {
          uiMockupStarted = true;
          markUiMockupStageStarted(diskProjectKey);
          pushActivity(
            'Architecture draft ready — generating UI mockup from researched patterns + plan (before coding)',
            'info',
          );
          setAccessoryHint(
            'UI mockup next — grounded in Master Plan + ui-brief. Coding slices follow.',
          );
          window.setTimeout(() => setAccessoryHint(null), 8000);
          if (showWorkActivity) {
            setGrokActivity((prev) =>
              advanceGrokActivity(prev, showWorkActivity ? 4 : 2, {
                currentAction: 'UI Studio Beta — mockup from ui-brief (before coding)…',
                log: {
                  message: 'Step 8.3 — UI Gen v2 mockup (sequential; coding waits)',
                  kind: 'info',
                },
              }),
            );
          }
          const mockup = await triggerUiStudioBetaAfterPlanReady({
            projectName,
            onProgress: pushActivity,
          });
          if (mockup.ok) {
            pushActivity('UI mockup ready in UI Studio Beta — starting coding slices next', 'success');
            setMessages((p) => {
              const next = [
                ...p,
                {
                  id: `a-mockup-${Date.now()}`,
                  role: 'assistant' as const,
                  content:
                    'Architecture draft is ready. UI mockup is generated from researched patterns + your Master Plan assumptions — you can correct them anytime. Coding continues next in slices (foundation first).',
                  timestamp: new Date().toLocaleTimeString([], {
                    hour: 'numeric',
                    minute: '2-digit',
                  }),
                },
              ];
              messagesRef.current = next;
              return next;
            });
          } else if (mockup.error) {
            pushActivity(`UI mockup: ${mockup.error} — continuing to coding`, 'warn');
          }
        } else if (fastPrototypeTurn || willCode) {
          pushActivity(
            `UI mockup waiting — ${readiness.reasons.join('; ') || 'architecture inputs incomplete'}`,
            'info',
          );
        }
      }

      try {
        if (willCode && !codingActivityRef.current) {
          beginCodingActivity('Grok Code — writing files to workspace', goWorkSteps(), {
            subhead: uiMockupStarted
              ? 'UI mockup triggered — now Foundation coding slice.'
              : 'Master Plan → Grok Code → files on disk.',
            initialLog: 'Coding stage — after architecture (and UI mockup when ready)',
          });
        }

        if (willCode) {
          setInferenceFirstStage('coding', diskProjectKey);
          setGrokActivity((prev) => {
            const mm =
              masterPlanPipeline.mindMapPageCount != null && masterPlanPipeline.mindMapPageCount > 0
                ? `Mind map: ${masterPlanPipeline.mindMapPageCount} page(s).`
                : undefined;
            return advanceGrokActivity(prev, showWorkActivity ? 5 : 2, {
              currentAction: 'Grok Code generating files — applying to workspace…',
              log: { message: 'Running Grok Code / file apply (after UI mockup stage)', kind: 'info' },
              ...(mm ? { stepDetail: { index: showWorkActivity ? 4 : 1, detail: mm } } : {}),
            });
          });
        }

        let coding = agentAllowed
          ? await handlePostGrokCodingTurn({
              assistantContent: masterPlanSource,
              planningPhase,
              userId,
              projectName,
              userNote: text,
              onProgress: codingActivityRef.current ? pushActivity : undefined,
            })
          : { ran: false };
        // No Go button: Discovery complete / Fast Prototype / legacy nudge starts coding.
        if (
          !coding.ran &&
          agentAllowed &&
          (onboardingBuildStart || fastPrototypeTurn || shortCodingNudge)
        ) {
          if (!codingActivityRef.current) {
            beginCodingActivity('Starting code — first slice', goWorkSteps(), {
              subhead: onboardingBuildStart
                ? 'Nothing more to add — Master Plan saved, Grok Code building files.'
                : fastPrototypeTurn
                  ? 'Fast Prototype draft ready — Grok Code building Foundation.'
                  : 'Starting Grok Code for the next slice.',
              initialLog: onboardingBuildStart
                ? 'Discovery complete — auto START_CODING'
                : fastPrototypeTurn
                  ? 'Fast Prototype — auto START_CODING'
                  : 'Auto coding pass (no Go button)',
            });
          }
          pushActivity(
            onboardingBuildStart
              ? 'Nothing more to add — launching Go Code pipeline'
              : fastPrototypeTurn
                ? 'Fast Prototype — launching Go Code pipeline'
                : 'START_CODING — launching Go Code pipeline',
            'info',
          );
          const go = await runGoCodeAndApply({
            userId,
            projectName,
            userNote: text,
            onProgress: pushActivity,
            messages: [
              { role: 'assistant', content: masterPlanSource.slice(0, 12000) },
              {
                role: 'user',
                content:
                  'START_CODING — implement ONE coherent slice only (Build → Debug → Next). File blocks for this slice only — not the full §4 app.',
              },
            ],
          });
          coding = {
            ran: true,
            ok: go.ok,
            statusMessage: go.statusMessage,
            writtenCount: go.totalWritten,
          };
        }
        if (!agentAllowed && (hadCodingTag || hasGrokFileBlocks(raw))) {
          // Chat lock: strip accidental coding artifacts from applying.
          try {
            console.info('[AIChat] interaction_mode=chat suppressed file apply');
          } catch {
            /* ignore */
          }
        }
        if (coding.ran) {
          setGrokActivity((prev) =>
            advanceGrokActivity(prev, showWorkActivity ? 5 : 3, {
              currentAction: coding.statusMessage || 'Syncing mind map, explorer, and preview…',
              ...(coding.statusMessage
                ? {
                    stepDetail: { index: showWorkActivity ? 4 : 2, detail: coding.statusMessage },
                    log: {
                      message: coding.statusMessage,
                      kind: coding.ok === false ? 'error' : 'success',
                    },
                  }
                : {}),
            }),
          );
          if (coding.ok === false && coding.statusMessage) {
            reportAppRuntimeIssue({
              technicalMessage: coding.statusMessage.slice(0, 800),
              source: 'build',
            });
          }
          // Validate loop only after a successful apply (device IDE locale + Grok CONTENT_LOCALE unchanged).
          if (hasAppStatusPayload && shouldMarkAppStatusValidation(coding)) {
            const fps = getAppRuntimeSnapshot()
              .issues.filter((i) => i.severity !== 'info')
              .map((i) => i.fingerprint);
            markAppRuntimePendingValidation(fps);
            setAccessoryHint(t('appStatus.validateReloadHint'));
            window.setTimeout(() => {
              requestAppPreviewReload();
            }, 400);
            window.setTimeout(() => setAccessoryHint(null), 8000);
            const fileCount = coding.writtenPaths?.length ?? coding.writtenCount ?? 0;
            const skippedVerify = assistantSkippedNdmVerify(raw);
            postContractTelemetry({
              event: 'ndm_app_status_turn',
              verifyBeforeApply: !skippedVerify,
              fileCount,
              smallFix: fileCount > 0 && fileCount <= 6,
            });
          }
          if (
            hasAppStatusPayload &&
            shouldMarkAppStatusValidation(coding) &&
            assistantSkippedNdmVerify(raw)
          ) {
            window.setTimeout(() => {
              setAccessoryHint(t('appStatus.ndmNudge'));
              window.setTimeout(() => setAccessoryHint(null), 4500);
            }, 8500);
          }
          if (coding.ok === false) {
            resetCodingActivity();
          } else {
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
                  currentAction: uiMockupStarted
                    ? 'Coding slice applied — UI mockup already generated from plan'
                    : 'Grok Code finished — opening UI Studio Beta…',
                  log: {
                    message: uiMockupStarted
                      ? 'Post-code UI auto-refresh skipped (plan-first mockup)'
                      : 'UI Studio Beta after coding (fallback)',
                    kind: 'info',
                  },
                }),
              );
            }
            // Mind map only — do not auto-run V0.
            masterPlanPipeline = await runMasterPlanUiPipeline({
              projectName,
              autoV0: false,
              quietV0Status: true,
              onProgress: pushActivity,
            });
            if (!uiMockupStarted) {
              dispatchOpenUiStudioBeta();
              pushActivity('Coding pass finished — open UI Studio Beta to generate mockup', 'info');
            } else {
              pushActivity('Coding slice done — UI mockup was already generated from the plan', 'success');
            }
            resetCodingActivity();
          }
        } else if (hasAppStatusPayload && agentAllowed && assistantSkippedNdmVerify(raw)) {
          setAccessoryHint(t('appStatus.ndmNudge'));
          window.setTimeout(() => setAccessoryHint(null), 4500);
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

      if (/<START_UIUX>/i.test(masterPlanSource) && !willCode) {
        // Legacy tag: open original studio without auto V0 (Beta generates after file apply).
        dispatchStartUiUxWorkflow({ tab: 'design', autoV0: false });
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
      const pubCfg = await fetchNebulaPublicConfig();
      const limitMsg = resolveAiLimitUserMessage(msg, {
        billingEnabled: pubCfg.billingEnabled,
        freeTierTokenLimitDisabled: pubCfg.freeTierTokenLimitDisabled,
        hasUserByok: pubCfg.hasUserByok,
      });
      if (limitMsg !== msg) {
        setSendError(limitMsg);
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
  }, [sending, activePath, activeTab?.content, serverHasGrokKey, micInputBlocked, workspaceRootLabel, gitBranch, tabs, pauseHandsFreeListening, resumeOpenTalkIfWanted, beginCodingActivity, pushActivity, resetCodingActivity, workspacePaths.length, noteUserMessageForMirror, prefs.contentMode, resolvedIdeLocale, t, localeLabels]);

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

    const t0 = performance.now();
    try {
      await playTtsText({
        text: plain,
        speakUrl: withProjectQuery('/api/speak'),
        signal: controller.signal,
        credentials: 'include',
        language: contentLocaleRef.current,
        onAudio: (audio) => {
          const w = window as unknown as { nebula_ide_currentAudio?: HTMLAudioElement | null };
          w.nebula_ide_currentAudio = audio;
          if (audio) {
            // Interrupt path resolves via abort + audio.pause in interruptVoiceAndTts.
            ttsChunkResolveRef.current = () => {
              try {
                audio.pause();
              } catch {
                /* ignore */
              }
            };
          } else {
            ttsChunkResolveRef.current = null;
          }
        },
      });
      console.debug(`[TTS] full turn ${Math.round(performance.now() - t0)}ms`);
    } catch (e) {
      const aborted = (e as { name?: string })?.name === 'AbortError';
      if (!aborted && runId === ttsRunIdRef.current) {
        console.warn('[AIChat] TTS', e);
      }
    } finally {
      if (runId === ttsRunIdRef.current) finishPlayback();
    }
  };
  playTtsForTextRef.current = playTtsForText;

  const toggleVoiceMic = () => {
    if (sending) return;

    // Stop if already recording
    if (isRecordingVoice || voiceRecognitionRef.current) {
      stopVoiceRecognition();
      setIsRecordingVoice(false);
      return;
    }

    // Clear TTS / cooldown so mic can start without focusing the textarea first
    if (micInputBlocked || isTtsPlaying || micCooldown) {
      interruptVoiceAndTts();
    }
    stopHandsFree();
    clearVoiceIdleTimer();

    const w = window as unknown as {
      SpeechRecognition?: new () => IdeSpeechRecognition;
      webkitSpeechRecognition?: new () => IdeSpeechRecognition;
    };
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) {
      setAccessoryHint(t('chat.speechUnsupported'));
      window.setTimeout(() => setAccessoryHint(null), 4000);
      return;
    }

    // Create recognition inside this click (user gesture) — fixes Chrome requiring
    // a prior focus/click in the text field before r.start() works.
    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = bcp47ForLocale(contentLocaleRef.current);

    const baseText = inputRef.current.trim();
    voiceDraftRef.current = baseText;

    recognition.onresult = (event: IdeSpeechRecognitionEvent) => {
      let finals = '';
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const piece = event.results[i][0]?.transcript ?? '';
        if (event.results[i].isFinal) finals += piece;
        else interim += piece;
      }
      if (finals) {
        voiceDraftRef.current = `${voiceDraftRef.current}${voiceDraftRef.current ? ' ' : ''}${finals}`.trim();
      }
      const shown = `${voiceDraftRef.current}${interim ? (voiceDraftRef.current ? ' ' : '') + interim : ''}`.trim();
      setInput(shown);
      inputRef.current = shown;
    };

    recognition.onerror = (ev: IdeSpeechRecognitionErrorEvent) => {
      if (ev.error === 'aborted') return;
      console.warn('[AIChat] speech recognition:', ev.error);
      if (
        (ev.error === 'language-not-supported' || ev.error === 'service-not-allowed') &&
        contentLocaleRef.current !== 'en' &&
        !voiceLocaleFallbackNotifiedRef.current
      ) {
        voiceLocaleFallbackNotifiedRef.current = true;
        recognition.lang = bcp47ForLocale('en');
        setAccessoryHint(t('chat.voiceUnsupported'));
      } else {
        setAccessoryHint(
          `Voice input: ${ev.error === 'not-allowed' ? 'allow the microphone for this site.' : ev.error}`,
        );
      }
      window.setTimeout(() => setAccessoryHint(null), 4500);
      setIsRecordingVoice(false);
      if (voiceRecognitionRef.current === recognition) {
        voiceRecognitionRef.current = null;
      }
    };

    recognition.onend = () => {
      setIsRecordingVoice(false);
      // Keep transcript in the box — user clicks Send (mic stays off after Send).
      if (voiceRecognitionRef.current === recognition) {
        voiceRecognitionRef.current = null;
      }
      const draft = voiceDraftRef.current.trim();
      if (draft) {
        setInput(draft);
        inputRef.current = draft;
      }
    };

    voiceRecognitionRef.current = recognition;
    try {
      recognition.start();
      setIsRecordingVoice(true);
      setAccessoryHint('Listening… click Send when done, or mic again to stop.');
      window.setTimeout(() => setAccessoryHint(null), 3500);
    } catch (err) {
      console.warn('[AIChat] mic start', err);
      voiceRecognitionRef.current = null;
      setIsRecordingVoice(false);
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

  /** Manual / Agent-switch coding pass (replaces the removed Go button). */
  const runCodingPass = useCallback(async (opts?: { force?: boolean; note?: string }) => {
    const userNote = (opts?.note ?? inputRef.current).trim();
    if (sending || micInputBlocked) return;

    if (interactionModeRef.current === 'chat') {
      const stamp = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      setMessages((p) => {
        const next = [
          ...p,
          {
            id: `go-block-${Date.now()}`,
            role: 'assistant' as const,
            content:
              'Coding writes files to your workspace — that needs **Agent** mode.\n\nSwitch to Agent to start the next slice?',
            timestamp: stamp,
            showSwitchToAgentCta: true,
            pendingAgentText: userNote
              ? `START_CODING — ${userNote}`
              : 'START_CODING — implement next slice',
          },
        ];
        messagesRef.current = next;
        return next;
      });
      return;
    }

    // Soft discourage: validate last slice / clear App Status before next slice
    if (!opts?.force) {
      const snap = getAppRuntimeSnapshot();
      const errorCount = snap.issues.filter((i) => i.severity === 'error' || i.severity === 'warn').length;
      if (snap.pendingValidation || errorCount > 0) {
        const stamp = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        const why = snap.pendingValidation
          ? 'Validate the last slice first — reload Preview and wait for App Status to clear.'
          : 'App Status still shows issues — Fix with Agent or clear them before the next slice.';
        setAccessoryHint(`${why} Reply “continue” to build the next slice anyway.`);
        setMessages((p) => {
          const next = [
            ...p,
            {
              id: `go-soft-${Date.now()}`,
              role: 'assistant' as const,
              content: `${why}\n\nReply **continue** (or **build next**) when you want the next slice anyway.`,
              timestamp: stamp,
            },
          ];
          messagesRef.current = next;
          return next;
        });
        window.setTimeout(() => setAccessoryHint(null), 8000);
        return;
      }
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
    stopVoiceRecognition();

    const ts = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const userMsg: Message = {
      id: `go-${Date.now()}`,
      role: 'user',
      content: userNote ? `START_CODING — ${userNote}` : 'START_CODING — implement next slice',
      timestamp: ts,
    };
    setMessages((p) => {
      const next = [...p, userMsg];
      messagesRef.current = next;
      return next;
    });
    setInput('');
    inputRef.current = '';
    stickToBottomRef.current = true;
    setSending(true);
    setSendError(null);
    beginCodingActivity('Coding — one slice', goWorkSteps(), {
      subhead: 'One coherent slice (Build → Debug → Next). Validate before the next slice.',
      initialLog: userNote
        ? `Coding started — slice focus: ${userNote.slice(0, 120)}`
        : 'Coding started — next incomplete slice',
    });

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
      if (go.ok) {
        window.dispatchEvent(new CustomEvent('nebula-master-plan-updated'));
        setAccessoryHint(
          go.sliceLabel
            ? `Slice ${go.sliceLabel} applied — reload Preview to validate before the next slice.`
            : 'Reload Preview to validate this slice before the next slice.',
        );
        window.setTimeout(() => setAccessoryHint(null), 10000);
      }
      const goTs = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      const chatCompleteLine = go.ok
        ? `**Finished.** ${go.statusMessage}\n\nValidate this slice (reload Preview / App Status) before asking for the next one.`
        : `**Coding could not finish.** ${go.statusMessage}`;
      setMessages((p) => {
        const next = [
          ...p,
          {
            id: `go-a-${Date.now()}`,
            role: 'assistant' as const,
            content: chatCompleteLine,
            timestamp: goTs,
            validateReloadHint: go.ok,
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
          currentAction: 'Grok Code done — UI Studio Beta generation…',
          log: { message: 'UI Studio Beta engine (Master Plan + applied files)', kind: 'info' },
        }),
      );
      // Mind map sync only — V0 auto disabled; Beta already triggered from file apply.
      await runMasterPlanUiPipeline({
        projectName,
        autoV0: false,
        quietV0Status: true,
        onProgress: pushActivity,
      });
      dispatchOpenUiStudioBeta();
      pushActivity('Coding pipeline finished — UI Studio Beta is the active generator', 'success');
      codingActivityRef.current = false;
      setGrokCodingActive(false);
      setGrokActivity((prev) =>
        finishGrokActivity(prev, 'Coding finished', goWorkSteps(), go.statusMessage),
      );
      setV0Live(false);
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Coding failed');
      resetCodingActivity();
    } finally {
      setSending(false);
      setAccessoryHint(null);
      if (openTalkDesiredRef.current) {
        resumeOpenTalkIfWanted();
      }
    }
  }, [micInputBlocked, sending, serverHasGrokKey, stopVoiceRecognition, refreshWorkspaceMeta, resumeOpenTalkIfWanted, pushActivity, beginCodingActivity, resetCodingActivity, workspacePaths.length]);

  const applyInteractionMode = useCallback(
    async (mode: IdeAssistantInteractionMode, options?: { pendingText?: string }) => {
      interactionModeRef.current = mode;
      setAssistantInteractionMode(mode);

      if (mode === 'chat') {
        setAccessoryHint('Chat on — plan & discuss; files stay unchanged.');
        window.setTimeout(() => setAccessoryHint(null), 3200);
        return;
      }

      let complete = masterPlanCompleteHint;
      try {
        const mpRes = await fetch(withProjectQuery('/api/master-plan/read'), {
          credentials: 'include',
          cache: 'no-store',
        });
        if (mpRes.ok) {
          const mp = (await readResponseJson(mpRes)) as Record<string, unknown>;
          complete = isMasterPlanCompleteForDiscovery(mp);
          setMasterPlanCompleteHint(complete);
        }
      } catch {
        /* keep prior hint */
      }

      setAccessoryHint(
        complete
          ? 'Agent on — coding starts when Discovery is done (or you ask to build).'
          : 'Agent on — Discovery still required before a full build (architecture-first).',
      );
      window.setTimeout(() => setAccessoryHint(null), 4500);

      const pending = (options?.pendingText || pendingAgentResendRef.current || '').trim();
      pendingAgentResendRef.current = null;
      if (!pending || sending) return;

      if (/^(go|start_coding)(\s|[—-]|$)/i.test(pending)) {
        const note = pending
          .replace(/^(go|start_coding)\s*[—-]?\s*/i, '')
          .trim();
        window.setTimeout(() => {
          void runCodingPass({
            note:
              note && !/^implement (project|next slice)$/i.test(note)
                ? note
                : 'discovery complete, nothing more to add',
          });
        }, 0);
        return;
      }

      window.setTimeout(() => {
        void sendChatRef.current(pending);
      }, 0);
    },
    [masterPlanCompleteHint, sending, setAssistantInteractionMode, runCodingPass],
  );

  const handleFixWithAgent = useCallback(
    (debugMessage: string) => {
      let msg = debugMessage;
      if (activePath && /\[APP_STATUS_DEBUG\]/i.test(msg) && !/ide_open_file:/i.test(msg)) {
        msg = `${msg.trimEnd()}\nide_open_file: ${activePath}`;
      }
      if (interactionModeRef.current === 'chat') {
        void applyInteractionMode('agent', { pendingText: msg });
        return;
      }
      void sendChatRef.current(msg);
    },
    [applyInteractionMode, activePath],
  );

  const handleFileAttachClick = useCallback(() => {
    if (sending || uploadBusy || micInputBlocked) return;
    fileInputRef.current?.click();
  }, [sending, uploadBusy, micInputBlocked]);

  const handleFileSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file || sending) return;
      if (file.size > MAX_CHAT_ATTACH_BYTES) {
        setAccessoryHint('That file is a bit large (max about 12MB). Try a smaller image or doc.');
        window.setTimeout(() => setAccessoryHint(null), 4500);
        return;
      }
      setUploadBusy(true);
      setAccessoryHint('Uploading…');
      try {
        const result = await uploadFileToR2(file, { projectKey: getBrowserProjectKey() });
        if (!result.ok) {
          const fail = result as { hint?: string; error?: string };
          const hint = fail.hint || fail.error || t('chat.uploadFailed');
          setAccessoryHint(hint);
          window.setTimeout(() => setAccessoryHint(null), 5500);
          return;
        }
        const attachmentLine = result.url
          ? `[Attached ${file.name}](${result.url})`
          : `[Attached ${file.name}] (storage key: ${result.key})`;
        setInput((prev) => {
          const next = prev.trim() ? `${prev.trim()}\n${attachmentLine}` : attachmentLine;
          inputRef.current = next;
          return next;
        });
        setAccessoryHint(t('chat.attached'));
        window.setTimeout(() => setAccessoryHint(null), 2800);
      } catch {
        setAccessoryHint(t('chat.uploadFailed'));
        window.setTimeout(() => setAccessoryHint(null), 4500);
      } finally {
        setUploadBusy(false);
      }
    },
    [sending, t],
  );

  const [rideStatusLine, setRideStatusLine] = useState<string | null>(null);

  useEffect(() => {
    const onRideStatus = (ev: Event) => {
      const msg = (ev as CustomEvent<{ message?: string }>).detail?.message?.trim();
      setRideStatusLine(msg || null);
      if (msg) {
        window.setTimeout(() => setRideStatusLine((cur) => (cur === msg ? null : cur)), 12000);
      }
    };
    const onUiDone = () => setRideStatusLine(null);
    window.addEventListener('nebula-ride-status', onRideStatus);
    window.addEventListener('nebula-ui-studio-beta-complete', onUiDone);
    return () => {
      window.removeEventListener('nebula-ride-status', onRideStatus);
      window.removeEventListener('nebula-ui-studio-beta-complete', onUiDone);
    };
  }, []);

  return (
    <div className="surface-active flex h-full min-h-0 flex-col overflow-hidden">
      <IdeAppStatusMenuButton
        onFixWithAgent={handleFixWithAgent}
        onVoiceNudge={onAppStatusVoiceNudge}
        rideStatus={rideStatusLine}
      />

      {showActivityPanel ? (
        <IdeGrokActivityPanel activity={grokActivity} v0Live={v0Live || v0WatchActive} />
      ) : null}

      {showGrokKeyBanner ? (
        <div
          className="shrink-0 border-b border-amber-500/40 bg-gradient-to-r from-amber-500/20 via-amber-500/12 to-transparent px-3 py-3"
          role="status"
        >
          <p className="type-label-sm font-headline text-amber-100">{t('chat.grokMissing')}</p>
          <p className="type-body-md mt-1 leading-relaxed text-amber-50/95">{MAIN_AI_CHAT_SETUP_HINT}</p>
        </div>
      ) : null}

      {accessoryHint ? (
        <div
          className="type-label-sm flex shrink-0 items-center justify-between gap-2 border-b border-border/70 bg-muted/25 px-3 py-1.5 text-muted-foreground"
          role="status"
        >
          <span className="min-w-0 flex-1">{accessoryHint}</span>
          {accessoryHint === t('appStatus.validateReloadHint') ? (
            <button
              type="button"
              className="shrink-0 rounded-md px-2 py-0.5 font-medium text-primary hover:bg-primary/10"
              onClick={() => requestAppPreviewReload()}
            >
              {t('appStatus.validateReloadCta')}
            </button>
          ) : null}
        </div>
      ) : null}

      {sendError ? (
        <div
          className="type-label-sm flex items-start gap-2 border-b border-red-500/20 bg-red-500/10 px-3 py-1.5 text-red-100/95"
          role="alert"
        >
          <p className="min-w-0 flex-1 leading-snug">{sendError}</p>
          {/Secrets|BYOK|API key|403|console\.x\.ai|permissions/i.test(sendError) ? (
            <button
              type="button"
              className="shrink-0 rounded-md px-2 py-0.5 font-medium text-red-50 ring-1 ring-red-400/40 hover:bg-red-500/20"
              onClick={() => openPanel('secrets')}
            >
              Open Secrets
            </button>
          ) : null}
        </div>
      ) : null}

      <div
        ref={scrollContainerRef}
        onScroll={onChatScroll}
        className="min-h-0 flex-1 space-y-3 overflow-auto p-3"
      >
        {messages.length === 0 && !sending ? (
          <div className="px-1 pt-2 pb-4 text-left">
            <p className="text-[12px] leading-relaxed text-foreground/90">
              {centerIsProjectsHome ? t('chat.greeting.projects') : t('chat.greeting')}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {centerIsProjectsHome ? t('chat.greetingSub.projects') : t('chat.greetingSub')}
            </p>
          </div>
        ) : null}
        {messages.map((message) =>
          message.variant === 'status' ? (
            <div
              key={message.id}
              className="flex gap-2 pl-1"
              role="status"
              aria-live="polite"
            >
              <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                {message.statusKind === 'wait' || (sending && message.id === messages[messages.length - 1]?.id) ? (
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/70" aria-hidden />
                ) : (
                  <Bot className="h-3 w-3 text-muted-foreground/50" aria-hidden />
                )}
              </div>
              <p
                className={cn(
                  'type-label-sm max-w-[92%] py-0.5 leading-snug',
                  statusKindClass(message.statusKind),
                )}
              >
                {message.content}
              </p>
            </div>
          ) : (
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
                  'type-body-md inline-block rounded-2xl px-3 py-2',
                  message.role === 'user' ? 'bg-[#111111] text-foreground' : 'bg-transparent text-foreground',
                )}
              >
                <p className="whitespace-pre-wrap">
                  {message.role === 'assistant'
                    ? sanitizeAssistantChatText(message.content, {
                        fallback:
                          'I’ve updated the project. Ask me anything in plain language — Master Plan and code stay in their tabs.',
                      })
                    : message.content}
                </p>
                {message.showSwitchToAgentCta ? (
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      disabled={sending}
                      onClick={() =>
                        void applyInteractionMode('agent', {
                          pendingText: message.pendingAgentText,
                        })
                      }
                      className="btn-cyan inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm disabled:opacity-45"
                    >
                      <Wrench className="h-4 w-4 shrink-0" aria-hidden />
                      {t('chat.switchToAgent')}
                    </button>
                    <button
                      type="button"
                      disabled={sending}
                      onClick={() => {
                        setAccessoryHint(t('chat.stayHint'));
                        window.setTimeout(() => setAccessoryHint(null), 2800);
                      }}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-border/80 bg-transparent px-3 py-2.5 text-sm font-medium text-muted-foreground transition hover:text-foreground disabled:opacity-45"
                    >
                      {t('chat.stayInChat')}
                    </button>
                  </div>
                ) : null}
                {message.filePreview ? <ChatFilePreview preview={message.filePreview} /> : null}
              </div>
              <p className="type-label-sm mt-0.5 opacity-80">{message.timestamp}</p>
            </div>
          </div>
          ),
        )}

        {sending && grokActivity.tone !== 'work' ? (
          <div className="flex gap-2 pl-1" role="status">
            <Loader2 className="mt-0.5 h-3 w-3 animate-spin text-muted-foreground/70" aria-hidden />
            <p className="type-label-sm text-muted-foreground">{t('chat.thinking')}</p>
          </div>
        ) : null}
        <div ref={messagesEndRef} className="h-px shrink-0" aria-hidden />
      </div>

      <div className="shrink-0 border-t border-border p-2">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/*,.svg,.pdf,.json,.webp,.png,.jpg,.jpeg,.gif,.txt,.md,.markdown"
          onChange={(e) => void handleFileSelected(e)}
          aria-hidden
          tabIndex={-1}
        />
        <div className="surface-float relative rounded-md border border-transparent p-1.5 pt-1 ring-1 ring-[color-mix(in_srgb,var(--outline-variant)_12%,transparent)] transition-[box-shadow,background-color] duration-300 ease-out focus-within:ring-[color-mix(in_srgb,var(--outline-variant)_22%,transparent)]">
          <button
            type="button"
            aria-pressed={assistantInteractionMode === 'agent'}
            title={
              assistantInteractionMode === 'agent'
                ? t('chat.mode.agentHint')
                : t('chat.mode.chatHint')
            }
            onClick={() =>
              void applyInteractionMode(
                assistantInteractionMode === 'agent' ? 'chat' : 'agent',
              )
            }
            className={cn(
              'absolute right-1.5 top-1 z-10 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-normal transition',
              assistantInteractionMode === 'agent'
                ? 'bg-primary/20 text-primary ring-1 ring-primary/30'
                : 'bg-black/40 text-muted-foreground ring-1 ring-border hover:text-foreground',
            )}
          >
            <Wrench className="h-3 w-3" aria-hidden />
            {t('chat.mode.agent')}
          </button>
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
            placeholder={
              assistantInteractionMode === 'agent'
                ? t('chat.placeholder.agent')
                : t('chat.placeholder.chat')
            }
            rows={2}
            disabled={sending || uploadBusy}
            className="min-h-[2.75rem] w-full resize-none bg-transparent pt-0 pr-16 text-[12px] leading-snug text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-50"
          />

          <div className="mt-1 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <ChatRoundButton
                size="sm"
                label={uploadBusy ? t('chat.uploading') : t('chat.attach')}
                onClick={handleFileAttachClick}
                disabled={sending || uploadBusy || micInputBlocked}
              >
                {uploadBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <Paperclip className="h-3.5 w-3.5" aria-hidden />
                )}
              </ChatRoundButton>
              <ChatRoundButton
                size="sm"
                label={t('chat.interruptVoice')}
                onClick={() => {
                  interruptVoiceAndTts();
                  setAccessoryHint(t('chat.voiceStopped'));
                  window.setTimeout(() => setAccessoryHint(null), 3200);
                }}
              >
                <Hand className="h-3.5 w-3.5" />
              </ChatRoundButton>
              <ChatRoundButton
                size="sm"
                label={isRecordingVoice ? t('chat.micStop') : t('chat.mic')}
                onClick={() => toggleVoiceMic()}
                disabled={sending || uploadBusy}
              >
                <Mic
                  className={cn(
                    'h-3.5 w-3.5',
                    isRecordingVoice ? 'text-destructive' : '',
                  )}
                />
              </ChatRoundButton>
            </div>

            <ChatRoundButton
              size="sm"
              label={t('chat.sendMessage')}
              onClick={() => {
                stopVoiceRecognition();
                setIsRecordingVoice(false);
                void sendChat();
              }}
              disabled={!input.trim() || sending || uploadBusy}
            >
              <Send className="h-3.5 w-3.5" />
            </ChatRoundButton>
          </div>
        </div>
      </div>
    </div>
  );
}
