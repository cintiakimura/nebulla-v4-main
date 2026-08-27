import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Hand, Loader2, MessageSquare, Mic, Paperclip, Send, Square, User, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchSessionUser, rememberActiveCloudProject, syncActiveCloudProjectFromSession, upsertCloudProject } from '../../lib/nebulaCloud';
import { MAIN_AI_CHAT_SETUP_HINT } from '../../lib/grokKey';
import { getGrokRequestHeaders, hasUsableGrokKeyForChat } from '../../lib/grokUserKey';
import {
  classifyContinueFailure,
  clearAllMainAiAuthRejected,
  clearMainAiAuthRejected,
  continueFailureActivityLine,
  isKeyAuthFailureMessage,
  isMainAiAuthRejected,
  markMainAiAuthRejected,
  userFacingContinueFailureMessage,
} from '../../lib/continueFailureTaxonomy';
import { fetchNebulaPublicConfig } from '../../lib/nebulaPublicConfig';
import { isAbortLikeError, isAbortLikeMessage } from '../../lib/abortLikeError';
import { fetchJson, readResponseJson } from '../../lib/apiFetch';
import { isUserAppProductPath } from '../../../lib/nebulaOrchestrationPaths';
import {
  getBrowserProjectKey,
  getBrowserProjectName,
  resolveActiveProjectIds,
  setBrowserProjectName,
  withProjectBody,
  withProjectQuery,
} from '../../lib/nebulaProjectApi';
import {
  cancelProjectBackgroundJobs,
  resetProjectFromScratch,
} from '../../lib/ideProjectReset';
import { sendIdeAssistantGrokTurn } from '../../lib/ideAssistantGrokChat';
import { ChatGrokStatusPane } from './ChatGrokStatusPane';
import { openSettingsAiKeys } from './shell/SettingsScreen';
import {
  conversationEntriesToIdeMessages,
  buildDiscoveryBootstrap,
  buildFastPrototypeBootstrap,
  buildFastPrototypeContinueBootstrap,
  buildIdeaDiscoveryBootstrap,
  FAST_PROTOTYPE_BOOTSTRAP_PREFIX,
  FAST_PROTOTYPE_CONTINUE_PREFIX,
  isHiddenBootstrapUserMessage,
} from '../../lib/ideChatBootstrap';
import { sourceHasMasterPlanBlock } from '../../../lib/masterPlanTags';
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
  isOrchestrationOnlyPlanSource,
} from '../../lib/grokChatArtifacts';
import { sanitizeAssistantChatText } from '../../../lib/assistantChatSanitize';
import { dispatchOpenUiStudio, dispatchStartUiUxWorkflow } from '../../lib/nebulaUiStudioEvents';
import {
  abortGoCodeWait,
  abortApplyWait,
  ackConsumedGoCodeResult,
  handlePostGrokCodingTurn,
  applyArchitectureArtifactsFromAssistant,
  hasGrokFileBlocks,
  isCodingIntent,
  runGoCodeAndApply,
} from '../../lib/nebulaAiCodingPipeline';
import {
  isAssistantCodingPromise,
  isShortCodingGoNudge,
  isUserExplicitCodingRequest,
  SHORT_CODING_GO_SUMMARY,
} from '../../lib/ideShortCodingNudge';
import {
  buildAutopilotSliceInstruction,
  FAST_PROTOTYPE_SAME_SESSION_AUTOPILOT,
  APPLY_IN_FLIGHT_STALL_MS,
  FOUNDATION_APPLY_STALL_MS,
  FOUNDATION_PRODUCT_ROUTE_MIN,
  getAutopilotSliceCount,
  incrementAutopilotSliceCount,
  looksLikeApplyInFlightStall,
  looksLikePostApplyCodingStall,
  persistLastAppliedSlice,
  parsePersistedSliceLabel,
  policyAStopMessage,
  preferLaterSlice,
  readLastAppliedSlice,
  resetAutopilotSliceCount,
  resolveNextContinueSlice,
  shouldAutopilotAdvance,
  userNoteRequestsNextSlice,
  workspaceFoundationLanded,
  workspaceHasProductAppRoutes,
  FOUNDATION_RETRY_ACTIVITY,
  FOUNDATION_SLICE_INSTRUCTION,
} from '../../lib/fastPrototypeNextSlice';
import { setGrokCodingActive } from '../../lib/nebulaGrokCodingGate';
import { publishGrokActivity } from '../../lib/nebulaGrokActivityBus';
import { runMasterPlanUiPipeline } from '../../lib/ideArtifactSync';
import {
  applyUiStudioBetaToAppPreview,
  dispatchStudioShowLiveApp,
  runUiStudioBetaGeneration,
  triggerUiStudioBetaAfterPlanReady,
} from '../../lib/uiStudioBetaEngine';
import { userNoteRequestsUiGeneration } from '../../lib/chatModeDetector';
import { figmaPickActivityLine } from '../../lib/uiGenStatusLabels';
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
  canStartFoundationCoding,
  clearUiMockupStageFlags,
  hasPersistedUiMockup,
  markUiMockupStageStarted,
  markUiMockupSucceeded,
  readinessBlocksAutoFoundation,
  setInferenceFirstStage,
} from '../../lib/uiMockupGate';
import {
  ensureResearchBeforeUiAndGo,
  fetchResearchStatus,
  formatResearchStopMessage,
  RESEARCH_STAGE_BRIEF,
  RESEARCH_STOPPED,
} from '../../lib/nebulaResearchClient';
import { createProjectForCurrentSession } from '../../lib/nebulaCloud';
import { handleSmartChatMessage, type SmartChatFilePreview } from '../../lib/smartChatHandler';
import { isMasterPlanCompleteForDiscovery, PRE_CODING_SUMMARY_KEY } from '../../lib/masterPlanSections';
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
import {
  ASK_FOR_SHORT_GOAL,
  extractGoalFromUserNote,
  isUsableProjectGoal,
  planRecordHasUsableGoal,
} from '../../lib/spineSequenceGates';
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
  finishGrokActivityWithProblems,
  errorGrokActivity,
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
import { IdeAppStatusMenuButton } from './IdeAppStatusMenu';
import {
  APP_STATUS_EVENTS,
  assistantSkippedNdmVerify,
  formatLatestAppStatusDebugMessage,
  getAppRuntimeSnapshot,
  getAppStatusDebugIssues,
  looksLikeBrokenAppComplaint,
  markAppRuntimePendingValidation,
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
  const { activeTab: centerActiveTab } = useIdeCenterTabs();
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
  const foundationStallRecoveredRef = useRef(false);
  const applyStallStartedAtRef = useRef<number | null>(null);
  const autoSliceAbortRef = useRef(false);
  const autoSliceInFlightRef = useRef(false);
  const lastAutoSliceLabelRef = useRef<string | null>(null);
  const lastAutoProductRouteCountRef = useRef<number | undefined>(undefined);
  const runAutoNextSliceRef = useRef<() => Promise<void>>(async () => {});
  /** One handoff after Foundation — stall watchdog and sendChat finally must not both start Go. */
  const autopilotHandoffScheduledRef = useRef(false);

  const resetCodingActivity = useCallback(() => {
    codingActivityRef.current = false;
    setGrokCodingActive(false);
    setV0WatchActive(false);
    setV0Live(false);
    setGrokActivity((prev) => {
      if ((prev.liveLog?.length || 0) > 0 || prev.tone === 'error' || prev.tone === 'work') {
        return finishGrokActivity(
          prev,
          prev.headline || 'Coding finished',
          prev.steps?.length ? prev.steps : goWorkSteps(),
          prev.footer,
        );
      }
      return idleGrokActivity(interactionModeRef.current);
    });
  }, []);

  /** Keep the last error on the shell status strip — do not idle-wipe (that hid "Code pass 1" timeouts). */
  const holdCodingFailure = useCallback((detail: string) => {
    codingActivityRef.current = false;
    setGrokCodingActive(false);
    setV0WatchActive(false);
    setV0Live(false);
    setGrokActivity((prev) => errorGrokActivity(prev, 'Coding stopped', detail));
  }, []);

  useEffect(() => {
    setGrokActivity((prev) => {
      if ((prev.liveLog?.length || 0) > 0 || prev.tone !== 'ready') {
        return { ...prev, subhead: interactionModeIdleSubhead(assistantInteractionMode) };
      }
      return idleGrokActivity(assistantInteractionMode);
    });
  }, [assistantInteractionMode, t]);

  useEffect(() => {
    publishGrokActivity({ activity: grokActivity, v0Live: v0Live || v0WatchActive });
  }, [grokActivity, v0Live, v0WatchActive]);

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
    foundationStallRecoveredRef.current = false;
    autoSliceAbortRef.current = false;
    autoSliceInFlightRef.current = false;
    const { projectKey } = resolveActiveProjectIds(diskProjectKey);
    lastAutoSliceLabelRef.current = readLastAppliedSlice(projectKey);
    lastAutoProductRouteCountRef.current = undefined;
    autopilotHandoffScheduledRef.current = false;
    resetAutopilotSliceCount(projectKey);
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

  /** Plan / research / mockup feed — must not set Grok coding-active or Go work steps. */
  const beginPlanActivity = useCallback(
    (headline: string, steps: GrokActivityStep[], options?: Parameters<typeof createGrokActivity>[2]) => {
      codingActivityRef.current = true;
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
    // Wait ticks stay on the compact status line only — never rewrite the last chat row
    // (that left “Syncing project artifacts…” stuck after files were already applied).
    if (options?.currentOnly || kind === 'wait') return;
  }, []);

  /** Next Go slice without a user chat message (Plan → mockup → Foundation already ran). */
  const runAutoNextSlice = useCallback(async () => {
    if (!FAST_PROTOTYPE_SAME_SESSION_AUTOPILOT) {
      const { projectKey: stopKey } = resolveActiveProjectIds(diskProjectKey);
      const landed =
        typeof lastAutoProductRouteCountRef.current === 'number' &&
        lastAutoProductRouteCountRef.current >= 3;
      const decision = shouldAutopilotAdvance({
        codingOk: landed,
        lastSlice: lastAutoSliceLabelRef.current,
        autoCount: getAutopilotSliceCount(stopKey),
        autopilotKickoff: true,
        productRouteCount: lastAutoProductRouteCountRef.current,
      });
      pushActivity(decision.message, decision.stopReason === 'failed' ? 'error' : 'success');
      resetCodingActivity();
      sendingRef.current = false;
      setSending(false);
      return;
    }
    if (autoSliceAbortRef.current) return;
    if (autoSliceInFlightRef.current) return;
    if (interactionModeRef.current === 'chat') {
      interactionModeRef.current = 'agent';
      setAssistantInteractionMode('agent');
    }
    const { projectKey, projectName } = resolveActiveProjectIds(diskProjectKey);
    const decision = shouldAutopilotAdvance({
      codingOk: true,
      lastSlice: lastAutoSliceLabelRef.current,
      autoCount: getAutopilotSliceCount(projectKey),
      autopilotKickoff: true,
      productRouteCount: lastAutoProductRouteCountRef.current,
      productRoutesOnDisk:
        typeof lastAutoProductRouteCountRef.current === 'number' &&
        lastAutoProductRouteCountRef.current >= FOUNDATION_PRODUCT_ROUTE_MIN,
      wroteFiles: (lastAutoProductRouteCountRef.current ?? 0) > 0,
    });
    if (!decision.advance || !decision.nextLabel) {
      pushActivity(decision.message, 'success');
      resetCodingActivity();
      sendingRef.current = false;
      setSending(false);
      return;
    }

    autoSliceInFlightRef.current = true;
    sendingRef.current = true;
    setSending(true);
    incrementAutopilotSliceCount(projectKey);
    if (!codingActivityRef.current) {
      beginCodingActivity(`Autopilot — ${decision.nextLabel} slice`, goWorkSteps(), {
        subhead: 'No chat wait — next Master Plan pages after Foundation.',
        initialLog: decision.message,
      });
    } else {
      pushActivity(decision.message, 'info');
    }

    try {
      const session = await fetchSessionUser();
      const userId = session?.uid?.trim() || 'anonymous';
      const instruction = buildAutopilotSliceInstruction(decision.nextLabel);
      ackConsumedGoCodeResult(projectName);
      const go = await runGoCodeAndApply({
        userId,
        projectName,
        userNote: instruction,
        messages: [{ role: 'user', content: instruction }],
        onProgress: pushActivity,
      });
      // Persist the slice we launched — Grok dump / thin apply must not rewrite it to Foundation.
      if (go.ok) {
        lastAutoSliceLabelRef.current = decision.nextLabel;
        lastAutoProductRouteCountRef.current = Math.max(
          lastAutoProductRouteCountRef.current ?? 0,
          go.productRouteCount ?? 0,
        );
        persistLastAppliedSlice(projectKey, decision.nextLabel);
      }
      if (autoSliceAbortRef.current) {
        resetCodingActivity();
        return;
      }
      if (!go.ok) {
        const failureClass = classifyContinueFailure({ message: go.statusMessage || 'Go failed' });
        if (failureClass === 'key/auth fail') {
          markMainAiAuthRejected(diskProjectKey);
          pushActivity(continueFailureActivityLine('key/auth fail', go.statusMessage || ''), 'error');
          setSendError(go.statusMessage || 'API key rejected — autopilot stopped.');
          resetCodingActivity();
          return;
        }
        pushActivity(
          go.statusMessage
            ? `${go.statusMessage} — autopilot stopped (not asking for Continue)`
            : 'Slice apply failed — autopilot stopped (not asking for Continue)',
          'warn',
        );
      }
      const again = shouldAutopilotAdvance({
        codingOk: go.ok,
        lastSlice: lastAutoSliceLabelRef.current,
        autoCount: getAutopilotSliceCount(projectKey),
        autopilotKickoff: true,
        productRouteCount: lastAutoProductRouteCountRef.current,
        productRoutesOnDisk:
          typeof lastAutoProductRouteCountRef.current === 'number' &&
          lastAutoProductRouteCountRef.current >= FOUNDATION_PRODUCT_ROUTE_MIN,
        wroteFiles: go.ok && (go.totalWritten ?? go.productRouteCount ?? 0) > 0,
      });
      if (again.advance) {
        pushActivity(again.message, 'info');
        autoSliceInFlightRef.current = false;
        window.setTimeout(() => {
          void runAutoNextSliceRef.current();
        }, 120);
        return;
      }
      pushActivity(again.message, 'success');
      resetCodingActivity();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const failureClass = classifyContinueFailure({ message: msg });
      if (failureClass === 'key/auth fail' || isKeyAuthFailureMessage(msg)) {
        pushActivity(continueFailureActivityLine(failureClass, msg), 'error');
        markMainAiAuthRejected(diskProjectKey);
        setSendError(msg);
        resetCodingActivity();
        return;
      }
      pushActivity(
        `${continueFailureActivityLine(failureClass, msg)} — autopilot stopped (Retry Go for Foundation if routes are missing)`,
        'error',
      );
      resetCodingActivity();
      return;
    } finally {
      autoSliceInFlightRef.current = false;
      sendingRef.current = false;
      setSending(false);
    }
  }, [beginCodingActivity, diskProjectKey, pushActivity, resetCodingActivity, setAssistantInteractionMode]);

  runAutoNextSliceRef.current = runAutoNextSlice;

  const scheduleAutopilotHandoff = useCallback(() => {
    if (!FAST_PROTOTYPE_SAME_SESSION_AUTOPILOT) return;
    if (autoSliceAbortRef.current) return;
    if (autopilotHandoffScheduledRef.current) return;
    autopilotHandoffScheduledRef.current = true;
    foundationStallRecoveredRef.current = true;
    const { projectName } = resolveActiveProjectIds(diskProjectKey);
    ackConsumedGoCodeResult(projectName);
    window.setTimeout(() => {
      if (autoSliceAbortRef.current) return;
      void runAutoNextSliceRef.current();
    }, 80);
  }, [diskProjectKey]);

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
    const fresh = entries.filter((e) => !syncedStatusLogIdsRef.current.has(e.id) && e.kind !== 'wait');
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
  const sendingAbortRef = useRef<AbortController | null>(null);
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

  const stopSending = useCallback(() => {
    autoSliceAbortRef.current = true;
    autoSliceInFlightRef.current = false;
    sendingAbortRef.current?.abort();
    sendingAbortRef.current = null;
    sendingRef.current = false;
    setSending(false);
    const { projectName } = resolveActiveProjectIds(diskProjectKey);
    abortGoCodeWait(projectName);
    holdCodingFailure('Stopped — coding cancelled. Chat is unlocked.');
  }, [diskProjectKey, holdCodingFailure]);

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
        const r = await fetch(withProjectQuery('/api/config'), {
          credentials: 'include',
          headers: getGrokRequestHeaders(),
        });
        const cfg = (await readResponseJson(r)) as { hasMainAiApiKey?: boolean; hasGrokApiKey?: boolean };
        if (!cancelled) setServerHasGrokKey(hasUsableGrokKeyForChat(r.ok ? cfg : null));
      } catch {
        if (!cancelled) setServerHasGrokKey(hasUsableGrokKeyForChat(null));
      }
      if (!cancelled) {
        await syncActiveCloudProjectFromSession();
        await refreshWorkspaceMeta();
        void refreshTree();
      }
    })();
    const onByok = () => {
      clearAllMainAiAuthRejected();
      setSendError(null);
      setServerHasGrokKey(hasUsableGrokKeyForChat(null));
      void (async () => {
        try {
          const r = await fetch(withProjectQuery('/api/config'), {
            credentials: 'include',
            headers: getGrokRequestHeaders(),
          });
          const cfg = (await readResponseJson(r)) as { hasMainAiApiKey?: boolean; hasGrokApiKey?: boolean };
          setServerHasGrokKey(hasUsableGrokKeyForChat(r.ok ? cfg : null));
        } catch {
          setServerHasGrokKey(hasUsableGrokKeyForChat(null));
        }
      })();
    };
    window.addEventListener('nebula-byok-updated', onByok);
    return () => {
      cancelled = true;
      window.removeEventListener('nebula-byok-updated', onByok);
    };
  }, [refreshTree, refreshWorkspaceMeta]);

  useEffect(() => {
    sendingRef.current = false;
    setSending(false);
    codingActivityRef.current = false;
    setGrokCodingActive(false);
    setGrokActivity(idleGrokActivity(interactionModeRef.current));
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

  useEffect(() => {
    if (sending || grokActivity.tone === 'work') return;
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (
        !last ||
        last.variant !== 'status' ||
        (last.statusKind !== 'wait' && !/Syncing project artifacts/i.test(last.content || ''))
      ) {
        return prev;
      }
      const next = [
        ...prev.slice(0, -1),
        {
          ...last,
          statusKind: 'success' as const,
          content: 'Files are on disk. Next slice starts automatically…',
        },
      ];
      messagesRef.current = next;
      return next;
    });
  }, [sending, grokActivity.tone]);

  const startGuidedDiscovery = useCallback(() => {
    consumeGuidedStartOnReady();
    void rememberActiveCloudProject();
    clearDiscoveryClosed(diskProjectKey);
    const startMode = consumePendingStartMode();
    setStoredStartMode(startMode, diskProjectKey);
    const ideaPrompt = consumePendingProjectIdea();
    const projectType = consumePendingProjectType();

    if (startMode === 'fast_prototype') {
      // Phase 1: IF goal empty/junk THEN stop and ask; do not open Go or UI Gen.
      if (!isUsableProjectGoal(ideaPrompt || '')) {
        const stamp = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        const ask: Message = {
          id: `a-goal-${Date.now()}`,
          role: 'assistant',
          content: ASK_FOR_SHORT_GOAL,
          timestamp: stamp,
        };
        const next: Message[] = ideaPrompt
          ? [
              {
                id: `u-idea-${Date.now()}`,
                role: 'user',
                content: ideaPrompt,
                timestamp: stamp,
              },
              ask,
            ]
          : [ask];
        setMessages(next);
        messagesRef.current = next;
        pushActivity('Stopped: need a short usable goal before Master Plan, UI Gen, or Go.', 'warn');
        return;
      }
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
  }, [diskProjectKey, pushActivity, setAssistantInteractionMode]);

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

  // Post-login / landing handoff: stay quiet until New Project or pending goal idea.
  useEffect(() => {
    // Phase 7.0: prior 401/403 — do not auto-stampede Start/Continue.
    if (isMainAiAuthRejected(diskProjectKey) && !hasUsableGrokKeyForChat(null)) return;
    if (!chatHistoryReady) return;
    if (bootstrapStartedRef.current || sendingRef.current) return;
    // Prefer pending idea from landing / "Start with a prompt" even if chat log restored noise.
    const pendingIdea = peekPendingProjectIdea();
    // Peek-only until we commit — do not burn the flag on a skipped turn.
    let guidedFlag = false;
    try {
      guidedFlag = localStorage.getItem(NEBULA_START_GUIDED_ON_READY_KEY) === '1';
    } catch {
      guidedFlag = false;
    }
    if (!guidedFlag && !pendingIdea) return;
    // Without a confirmed key, still bootstrap when a landing goal is pending so the
    // visible user turn is stamped; send may fail until a key is available.
    if (serverHasGrokKey !== true && !pendingIdea) return;
    // Refresh must not redo Fast Prototype / Code pass 1 when chat or product files already exist.
    if (messagesRef.current.length > 0) return;
    if (workspaceHasProductAppRoutes(workspacePaths)) return;
    // Leftover shell-goal idea without a fresh landing/My Projects handoff — keep the saved project.
    if (!guidedFlag) return;
    let cancelled = false;
    void (async () => {
      try {
        const mpRes = await fetch(withProjectQuery('/api/master-plan/read'), {
          credentials: 'include',
          cache: 'no-store',
        });
        if (cancelled) return;
        if (mpRes.ok) {
          const plan = (await readResponseJson(mpRes)) as Record<string, unknown>;
          if (planRecordHasUsableGoal(plan)) {
            consumeGuidedStartOnReady();
            return;
          }
        }
      } catch {
        /* empty / unread plan — may still bootstrap */
      }
      if (cancelled || bootstrapStartedRef.current || sendingRef.current) return;
      if (messagesRef.current.length > 0) return;
      bootstrapStartedRef.current = true;
      consumeGuidedStartOnReady();
      startGuidedDiscovery();
    })();
    return () => {
      cancelled = true;
    };
  }, [serverHasGrokKey, chatHistoryReady, messages.length, diskProjectKey, startGuidedDiscovery, workspacePaths]);

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

  // Foundation apply used to freeze on "Applying N files" / "Runnable skeleton filled".
  // Unlock coding; do not auto-start Primary. Heartbeats must not reset the apply clock.
  useEffect(() => {
    if (grokActivity.tone !== 'work') {
      applyStallStartedAtRef.current = null;
      return;
    }
    const last = grokActivity.liveLog[grokActivity.liveLog.length - 1]?.message || '';
    const goStarted = grokActivity.liveLog.some((e) =>
      /Go — |Code pass 1|Received Grok Code/i.test(e.message),
    );
    const applyInFlight = looksLikeApplyInFlightStall(last) && goStarted;
    const postApplyStall = looksLikePostApplyCodingStall(last);
    if (!applyInFlight && !postApplyStall) {
      applyStallStartedAtRef.current = null;
      return;
    }
    if (applyInFlight && applyStallStartedAtRef.current == null) {
      applyStallStartedAtRef.current = Date.now();
    }
    const started = applyStallStartedAtRef.current ?? Date.now();
    const remaining = applyInFlight
      ? Math.max(0, APPLY_IN_FLIGHT_STALL_MS - (Date.now() - started))
      : FOUNDATION_APPLY_STALL_MS;
    const timer = window.setTimeout(() => {
      if (!codingActivityRef.current) return;
      if (foundationStallRecoveredRef.current) return;
      if (autoSliceAbortRef.current) return;
      foundationStallRecoveredRef.current = true;
      if (applyInFlight) {
        const { projectName } = resolveActiveProjectIds(diskProjectKey);
        abortApplyWait(projectName);
        pushActivity(
          'Apply POST still open — checking disk (not stopping coding)',
          'warn',
        );
        return;
      }
      const { projectName } = resolveActiveProjectIds(diskProjectKey);
      abortGoCodeWait(projectName);
      pushActivity(
        'Coding complete. Send Continue for the next slice — not started automatically.',
        'success',
      );
      resetCodingActivity();
      sendingRef.current = false;
      setSending(false);
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [diskProjectKey, grokActivity.liveLog, grokActivity.tone, holdCodingFailure, pushActivity, resetCodingActivity]);

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
    if (!rawText || sendingRef.current) return;

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
          if (smart.switchToAgentSuggested && isUserExplicitCodingRequest(rawText)) {
            // Explicit continue/finish must code — do not stop at Switch-to-Agent CTA.
          } else {
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
        }
      } catch {
        /* fall through to normal Grok / Master Plan / Go chat */
      }
    } else if (
      rawText.trim().startsWith(FAST_PROTOTYPE_BOOTSTRAP_PREFIX) ||
      rawText.trim().startsWith(FAST_PROTOTYPE_CONTINUE_PREFIX)
    ) {
      discoveryRequired = false;
      codingHint = 'fast-prototype';
      chatMode = 'coding';
    }

    // Chat "Create a new project: …" — default inference-first (same as My Projects Continue).
    const projectCreation = detectProjectCreationIntent(rawText);
    if (projectCreation) {
      // Phase 7.0: do not create + bootstrap a false pipeline when chat key is missing/rejected.
      let hasKeyForCreate = serverHasGrokKey === true || hasUsableGrokKeyForChat(null);
      if (hasKeyForCreate === false && serverHasGrokKey === null) {
      try {
        const r = await fetch(withProjectQuery('/api/config'), {
          credentials: 'include',
          headers: getGrokRequestHeaders(),
        });
          const cfg = (await readResponseJson(r)) as { hasMainAiApiKey?: boolean; hasGrokApiKey?: boolean };
          hasKeyForCreate = hasUsableGrokKeyForChat(r.ok ? cfg : null);
          setServerHasGrokKey(hasKeyForCreate);
      } catch {
          hasKeyForCreate = hasUsableGrokKeyForChat(null);
        setServerHasGrokKey(hasKeyForCreate);
      }
      }
      if (hasUsableGrokKeyForChat(null)) {
        clearMainAiAuthRejected(diskProjectKey);
        hasKeyForCreate = true;
        setServerHasGrokKey(true);
      }
      if (hasKeyForCreate === false) {
        const failureClass = classifyContinueFailure({
          message: 'Grok chat is unavailable: no valid API key on the server.',
        });
        setSendError(
          userFacingContinueFailureMessage(
            failureClass,
            'Grok chat is unavailable: no valid API key on the server.',
          ),
        );
        pushActivity(continueFailureActivityLine(failureClass), 'error');
        return;
      }

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

    let hasMainAiKey = serverHasGrokKey === true || hasUsableGrokKeyForChat(null);
    if (hasMainAiKey === false && serverHasGrokKey === null) {
      try {
        const r = await fetch(withProjectQuery('/api/config'), {
          credentials: 'include',
          headers: getGrokRequestHeaders(),
        });
        const cfg = (await readResponseJson(r)) as { hasMainAiApiKey?: boolean; hasGrokApiKey?: boolean };
        hasMainAiKey = hasUsableGrokKeyForChat(r.ok ? cfg : null);
        setServerHasGrokKey(hasMainAiKey);
      } catch {
        hasMainAiKey = hasUsableGrokKeyForChat(null);
        setServerHasGrokKey(hasMainAiKey);
      }
    }

    // Phase 7.0: block only when no usable key. A prior 401 must not stick after BYOK/local save.
    if (hasUsableGrokKeyForChat(null)) {
      clearMainAiAuthRejected(diskProjectKey);
      hasMainAiKey = true;
      setServerHasGrokKey(true);
    }
    if (hasMainAiKey === false) {
      const failureClass = classifyContinueFailure({
        message: 'Grok chat is unavailable: no valid API key on the server.',
      });
      setSendError(
        userFacingContinueFailureMessage(
          failureClass,
          'Grok chat is unavailable: no valid API key on the server.',
        ),
      );
      pushActivity(continueFailureActivityLine(failureClass), 'error');
      return;
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
    sendingRef.current = true;
    sendingAbortRef.current?.abort();
    sendingAbortRef.current = new AbortController();
    const sendAbort = sendingAbortRef.current;
    setSendError(null);
    const discoveryCompleteAck = detectOnboardingBuildStart(rawText, prior);
    /** Bare "go" / "start coding" — must launch Foundation even if the model omits START_CODING. */
    const userForcedCoding = isUserExplicitCodingRequest(rawText);
    if (userNoteRequestsUiGeneration(rawText) && !userForcedCoding && !hasAppStatusPayload) {
      beginPlanActivity('Generating UI from Master Plan…', chatWorkSteps(), {
        subhead: 'UI Gen v2 — §1 Goal and Go are not rewritten.',
        initialLog: 'Generating UI from §5 tokens and ui-brief…',
      });
      try {
        const result = await runUiStudioBetaGeneration({
          projectName: getBrowserProjectName().trim() || undefined,
          regenerate: true,
          uiPhase: 'manual',
          openPane: false,
          onProgress: pushActivity,
        });
        if (result.ok) {
          await applyUiStudioBetaToAppPreview(pushActivity, { preferMockup: true });
          pushActivity('UI mockup ready — App Preview updated. Goal was not rewritten.', 'success');
        } else {
          pushActivity(result.error || 'UI generation failed — retry Generate UI.', 'error');
        }
      } catch (uiErr) {
        pushActivity(uiErr instanceof Error ? uiErr.message : 'UI generation failed', 'error');
      }
      resetCodingActivity();
      setSending(false);
      sendingRef.current = false;
      return;
    }
    // Product promise: "nothing more to add" / explicit "go" starts coding — even if still Chat.
    const fastPrototypeTurnEarly =
      codingHint === 'fast-prototype' ||
      rawText.trim().startsWith(FAST_PROTOTYPE_BOOTSTRAP_PREFIX) ||
      rawText.trim().startsWith(FAST_PROTOTYPE_CONTINUE_PREFIX);
    if (
      (discoveryCompleteAck || userForcedCoding || fastPrototypeTurnEarly) &&
      interactionModeRef.current === 'chat'
    ) {
      interactionModeRef.current = 'agent';
      setAssistantInteractionMode('agent');
      setAccessoryHint(
        discoveryCompleteAck
          ? 'Discovery done — switching to Agent and starting the first coding slice.'
          : fastPrototypeTurnEarly
            ? 'Fast Prototype — switching to Agent after the mockup so coding can start.'
            : 'Switching to Agent — starting the next coding slice in your workspace.',
      );
      window.setTimeout(() => setAccessoryHint(null), 4500);
    }
    if (discoveryCompleteAck) {
      markDiscoveryClosed(diskProjectKey);
      discoveryRequired = false;
      chatMode = 'coding';
      codingHint = 'discovery-complete-start-coding';
    } else if (userForcedCoding) {
      discoveryRequired = false;
      chatMode = 'coding';
      codingHint = codingHint || 'user-go-start-coding';
    }
    const lockedChat = interactionModeRef.current === 'chat';
    const onboardingBuildStart = discoveryCompleteAck;
    const fastPrototypeTurn =
      codingHint === 'fast-prototype' ||
      rawText.trim().startsWith(FAST_PROTOTYPE_BOOTSTRAP_PREFIX) ||
      rawText.trim().startsWith(FAST_PROTOTYPE_CONTINUE_PREFIX);
    const isFastPrototypeContinue = rawText.trim().startsWith(FAST_PROTOTYPE_CONTINUE_PREFIX);
    const buildMode =
      !lockedChat &&
      !hasAppStatusPayload &&
      (detectBuildModeIntent(rawText) ||
        userForcedCoding ||
        onboardingBuildStart ||
        fastPrototypeTurn);
    const showWorkActivity =
      buildMode || onboardingBuildStart || fastPrototypeTurn || userForcedCoding;
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
      beginPlanActivity('Saving Master Plan…', chatWorkSteps(), {
        subhead: 'Discovery complete — plan and research next. Coding waits.',
        initialLog: `Discovery complete — "${rawText.trim()}"`,
      });
      pushActivity('Saving Master Plan…', 'info');
    } else if (fastPrototypeTurn) {
      beginPlanActivity('Fast Prototype — drafting the plan', chatWorkSteps(), {
        subhead: 'Researching competitors… Coding waits until Gate R and mockup allow Go.',
        initialLog: 'Fast Prototype — plan and research (not coding yet)',
      });
      pushActivity('Researching competitors…', 'info');
    } else if (buildMode) {
      beginPlanActivity('Preparing plan and research…', chatWorkSteps(), {
        subhead: 'Master Plan → research → mockup. Coding starts only if Go is allowed.',
        initialLog: `Build mode — "${rawText.slice(0, 80)}${rawText.length > 80 ? '…' : ''}"`,
      });
      pushActivity(`Project: ${getBrowserProjectName().trim() || 'Untitled project'}`, 'info');
    }

    const projectName = getBrowserProjectName().trim() || 'Untitled project';
    if (buildMode && activePath) {
      pushActivity(`Open in editor: ${activePath}`, 'info');
    }
    let diskPaths = workspacePaths;
    if (userNoteRequestsNextSlice(rawText) || userForcedCoding) {
      try {
        const overview = await fetchJson<{ nebulaFiles?: { relativePath: string }[] }>(
          withProjectQuery('/api/source-control/overview'),
          { credentials: 'include', cache: 'no-store' },
        );
        const fresh = (overview.nebulaFiles ?? [])
          .map((f) => String(f.relativePath || '').replace(/\\/g, '/'))
          .filter((p) => isUserAppProductPath(p));
        if (fresh.length > 0) diskPaths = fresh;
        void refreshTree();
      } catch {
        /* keep explorer snapshot */
      }
    }
    if (buildMode && diskPaths.length > 0) {
      pushActivity(`Workspace index: ${diskPaths.length} file(s)`, 'info');
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
    let mpSaved = 0;
    const codingProblems: string[] = [];
    const noteProblem = (msg: string) => {
      const line = String(msg || '').replace(/\s+/g, ' ').trim();
      if (!line) return;
      codingProblems.push(line);
      pushActivity(line, 'warn');
    };
    const foundationLandedOnDisk = () =>
      workspaceFoundationLanded(diskPaths, {
        lastSlice: lastAutoSliceLabelRef.current,
        projectKey: resolveActiveProjectIds(diskProjectKey).projectKey,
      });
    let planSliceFromDisk: string | null = null;

    let skipGrokChat =
      interactionModeRef.current === 'agent' &&
      (userForcedCoding || isFastPrototypeContinue) &&
      !onboardingBuildStart &&
      !hasAppStatusPayload;
    const maySkipChatIfPlanExists =
      interactionModeRef.current === 'agent' &&
      !onboardingBuildStart &&
      !hasAppStatusPayload &&
      (userForcedCoding || isFastPrototypeContinue || fastPrototypeTurn || buildMode);
    if (maySkipChatIfPlanExists) {
      try {
        const mpRes = await fetch(withProjectQuery('/api/master-plan/read'), {
          credentials: 'include',
          cache: 'no-store',
        });
        const plan = mpRes.ok
          ? ((await readResponseJson(mpRes)) as Record<string, unknown>)
          : null;
        const hasPlan = planRecordHasUsableGoal(plan);
        if (hasPlan) {
          planSliceFromDisk = parsePersistedSliceLabel(
            String((plan as Record<string, unknown>)[PRE_CODING_SUMMARY_KEY] ?? ''),
          );
          if (planSliceFromDisk) {
            lastAutoSliceLabelRef.current = preferLaterSlice(
              lastAutoSliceLabelRef.current,
              planSliceFromDisk,
            );
          }
          skipGrokChat = true;
          const nextSliceSkip =
            userNoteRequestsNextSlice(text) && foundationLandedOnDisk();
          pushActivity(
            nextSliceSkip
              ? 'Master Plan already on disk — skipping Grok chat; next slice only (not recoding Foundation)'
              : 'Master Plan already on disk — skipping Grok chat, continuing research / mockup / Foundation',
            'info',
          );
        } else if (skipGrokChat) {
          skipGrokChat = false;
          pushActivity(
            'No usable Master Plan goal yet — drafting the plan first (not skipping Grok chat)',
            'warn',
          );
        }
      } catch {
        if (!fastPrototypeTurn && !buildMode) skipGrokChat = false;
      }
    }

    try {
      if (showWorkActivity && !skipGrokChat) {
        setGrokActivity((prev) =>
          advanceGrokActivity(prev, 1, {
            currentAction: onboardingBuildStart
              ? 'Grok is writing your Master Plan from discovery…'
              : 'Calling Grok API with Master Plan and workspace context…',
            log: { message: 'POST /api/grok/chat — waiting for Grok response', kind: 'info' },
          }),
        );
      }

      const stopGrokWait =
        showWorkActivity && !skipGrokChat
          ? startGrokActivityWaitTicker('Waiting for Grok', (msg, kind, options) =>
              pushActivity(msg, kind, options),
            )
          : () => {};
      let assistantContent: string;
      let planningPhase: string;
      let linkedContextStatus: string | undefined;
      try {
        let skippedGrokChat = false;
        if (skipGrokChat) {
          skippedGrokChat = true;
          const nextSliceOnly =
            userNoteRequestsNextSlice(text) && foundationLandedOnDisk();
          assistantContent = nextSliceOnly
            ? 'Master Plan already on disk — coding the next incomplete slice (not Foundation).'
            : 'Master Plan already on disk — continuing research before coding (not yet).';
          planningPhase = 'PLAN_READY';
          pushActivity(
            nextSliceOnly
              ? 'Master Plan on disk — skipping Grok chat; next slice only (not recoding Foundation)'
              : 'Master Plan on disk — skipping Grok chat; research next (not coding yet)',
            'info',
          );
        }
        if (!skippedGrokChat) {
          try {
            ({ assistantContent, planningPhase, linkedContextStatus } = await sendIdeAssistantGrokTurn({
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
              signal: sendAbort.signal,
            }));
          } catch (grokErr) {
            const grokMsg = grokErr instanceof Error ? grokErr.message : String(grokErr);
            if (
              (/timed out/i.test(grokMsg) || isAbortLikeError(grokErr)) &&
              (userForcedCoding || fastPrototypeTurn || buildMode)
            ) {
              pushActivity(
                isAbortLikeError(grokErr)
                  ? 'Grok chat interrupted — continuing from saved Master Plan'
                  : 'Grok chat timed out after 90s — Master Plan is saved; continuing research / mockup / Foundation (not waiting on chat).',
                'warn',
              );
              assistantContent =
                'Grok chat timed out; Master Plan is saved — continuing research before coding.';
              planningPhase = 'PLAN_READY';
            } else {
              throw grokErr;
            }
          }
        }
        if (linkedContextStatus) {
          pushActivity(
            linkedContextStatus,
            /could not load linked page/i.test(linkedContextStatus) ? 'warn' : 'info',
          );
        }
        // Phase 7.0: a successful chat turn clears sticky key/auth rejection.
        clearMainAiAuthRejected(diskProjectKey);
      } finally {
        stopGrokWait();
      }
      const raw = assistantContent.trim();
      const masterPlanSource = (
        isOrchestrationOnlyPlanSource(planningPhase) ? raw : planningPhase || raw
      ).trim();
      if (showWorkActivity) {
        pushActivity(`Grok replied (${raw.length.toLocaleString()} chars)`, 'success');
        setGrokActivity((prev) =>
          advanceGrokActivity(prev, 2, {
            currentAction: 'Parsing Master Plan tags and saving sections…',
            log: { message: 'Scanning response for <START_MASTERPLAN> and file blocks', kind: 'info' },
          }),
        );
      }

      mpSaved = await persistMasterPlanFromAssistantSource(
        masterPlanSource,
        showWorkActivity ? pushActivity : undefined,
        [
          extractGoalFromUserNote(text),
          peekPendingProjectIdea() || '',
          getBrowserProjectName(),
        ],
      );
      if (mpSaved > 0) {
        void rememberActiveCloudProject();
      }

      if (/<NEBULA_UI_STUDIO_PROMPT>/i.test(masterPlanSource)) {
        dispatchOpenUiStudio({ tab: 'mockups' });
      }

      const { displayText, hadCodingTag } = formatAssistantForIdeChatDisplay(raw);
      const agentAllowed = interactionModeRef.current === 'agent';

      // First Fast Prototype reply often comes back as short chat prose (~hundreds of chars)
      // with no Master Plan tags — one automatic hard continue (single API key queue).
      if (
        agentAllowed &&
        fastPrototypeTurn &&
        !isFastPrototypeContinue &&
        mpSaved === 0 &&
        !sourceHasMasterPlanBlock(masterPlanSource)
      ) {
        pushActivity(
          'Draft incomplete (no Master Plan tags) — one automatic architecture continue…',
          'warn',
        );
        setAccessoryHint('Continuing Fast Prototype — requesting full Master Plan + ui-brief…');
        window.setTimeout(() => setAccessoryHint(null), 6000);
        window.setTimeout(() => {
          void sendChatRef.current(buildFastPrototypeContinueBootstrap());
        }, 80);
        resetCodingActivity();
        setSending(false);
        sendingRef.current = false;
        return;
      }

      const shortCodingNudge = isShortCodingGoNudge(displayText || raw);
      const assistantCodingPromise = isAssistantCodingPromise(displayText || raw);
      let willCode =
        agentAllowed &&
        (hadCodingTag ||
          hasGrokFileBlocks(raw) ||
          isCodingIntent(masterPlanSource) ||
          onboardingBuildStart ||
          fastPrototypeTurn ||
          shortCodingNudge ||
          userForcedCoding ||
          assistantCodingPromise);
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
      } else if (willCode && (onboardingBuildStart || shortCodingNudge || userForcedCoding)) {
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
      const syncPlanViewsAfterResearch = async () => {
        if (mpSaved <= 0 && !fastPrototypeTurn && !willCode) return;
        if (showWorkActivity) {
          setGrokActivity((prev) =>
            advanceGrokActivity(prev, 3, {
              currentAction: willCode
                ? 'Mind map + ui-brief from researched Master Plan…'
                : 'Syncing mind map + ui-brief from Master Plan…',
              stepDetail: {
                index: 2,
                detail:
                  mpSaved > 0
                    ? `Saved ${mpSaved} Master Plan section(s). Building mind map + ui-brief after research…`
                    : 'Building mind map + ui-brief after research…',
              },
              log: {
                message: 'Syncing mind map + ui-brief (after Web Search, not before)',
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
      };
      if (mpSaved > 0) {
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

      // Auto-accept security baseline for inference-first so strict Go isn't stuck on Accept.
      // Includes auth/sign-in when kids/teachers/parents + private data are already implied.
      if (agentAllowed && (fastPrototypeTurn || mpSaved > 0)) {
        try {
          const sec = await fetchJson<{ ok?: boolean; applied?: boolean; reason?: string }>(
            withProjectQuery('/api/master-plan/accept-security-baseline'),
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify(withProjectBody({})),
            },
          );
          if (sec.applied) {
            pushActivity(
              'Security baseline + sign-in approach drafted into §2 (assumption — correct if wrong)',
              'info',
            );
            window.dispatchEvent(new CustomEvent('nebula-master-plan-updated'));
          } else if (sec.reason === 'already_present') {
            pushActivity('Security baseline already present in Master Plan §2', 'info');
          }
        } catch {
          /* non-fatal */
        }
      }

      // Unlock composer before mockup. This shell does not mount IdeUiStudioBeta;
      // generate can take minutes and must not freeze the input.
      setSending(false);
      sendingRef.current = false;

      // Stage B — UI mockup after plan + ui-brief, BEFORE coding (single API key queue).
      let uiMockupStarted = false;
      let mockupSkippedOrFailed = false;
      let lastResearchError: string | null = null;
      if (sendAbort.signal.aborted) {
        // A newer send replaced this controller — do not stack a second heavy job.
        if (sendingAbortRef.current !== sendAbort) {
          return;
        }
        if (mpSaved > 0 && (userForcedCoding || fastPrototypeTurn || willCode)) {
          pushActivity(
            'Chat send interrupted — Master Plan is saved; continuing to mockup / Foundation',
            'warn',
          );
        } else {
          return;
        }
      }
      const foundationAlreadyLanded = foundationLandedOnDisk();
      const wantsNextSlice = userNoteRequestsNextSlice(text);
      if (agentAllowed && (fastPrototypeTurn || willCode || mpSaved > 0)) {
        if (wantsNextSlice && foundationAlreadyLanded) {
          const st = await fetchResearchStatus(projectName);
          if (!st.ok) {
            lastResearchError = formatResearchStopMessage(st.reasons);
            codingProblems.push(lastResearchError);
            pushActivity(lastResearchError, 'error');
            setAccessoryHint('Retry research — Foundation will not start until Gate R is complete.');
            window.setTimeout(() => setAccessoryHint(null), 8000);
            willCode = false;
            codingActivityRef.current = false;
            setGrokCodingActive(false);
            setGrokActivity((prev) => finishGrokActivityWithProblems(prev, codingProblems));
          } else {
            mockupSkippedOrFailed = true;
            pushActivity(
              'Research + mockup already done — coding the next slice (not Foundation).',
              'info',
            );
          }
        } else {
        const research = await ensureResearchBeforeUiAndGo({
          projectName,
          goal: projectName,
          onProgress: pushActivity,
        });
        if (!research.ok && research.softAbort) {
          lastResearchError = RESEARCH_STOPPED;
        }
        if (!research.ok) {
          const stopMsg = formatResearchStopMessage(research.gate?.reasons);
          lastResearchError = lastResearchError || stopMsg;
          codingProblems.push(lastResearchError);
          pushActivity(lastResearchError, 'error');
          setAccessoryHint('Retry research — Foundation will not start until Gate R is complete.');
          window.setTimeout(() => setAccessoryHint(null), 8000);
          willCode = false;
          try {
            window.dispatchEvent(
              new CustomEvent('nebula-preview-wait-status', { detail: { status: stopMsg } }),
            );
          } catch {
            /* ignore */
          }
          codingActivityRef.current = false;
          setGrokCodingActive(false);
          setGrokActivity((prev) => finishGrokActivityWithProblems(prev, codingProblems));
        } else {
          pushActivity(RESEARCH_STAGE_BRIEF, 'info');
          lastResearchError = null;
        }
        if (!lastResearchError) {
        await syncPlanViewsAfterResearch();
        const readiness = await assessUiMockupReadiness({ projectKey: diskProjectKey });
        if (
          readinessBlocksAutoFoundation(readiness) &&
          readiness.reasons.length &&
          !lastResearchError
        ) {
          noteProblem(`Architecture incomplete: ${readiness.reasons.join('; ')}`);
        }
        const persistedMockup = await hasPersistedUiMockup();
        const alreadyHasProduct = workspaceHasProductAppRoutes(workspacePaths);
        if (
          persistedMockup &&
          (userForcedCoding || assistantCodingPromise || fastPrototypeTurn)
        ) {
          mockupSkippedOrFailed = true;
          pushActivity(
            'UI mockup already on disk — mockup deferred — coding Foundation',
            'info',
          );
        } else if (
          alreadyHasProduct &&
          (userForcedCoding || assistantCodingPromise) &&
          !fastPrototypeTurn
        ) {
          mockupSkippedOrFailed = true;
          pushActivity(
            'Product routes already on disk — mockup deferred — coding next slice',
            'info',
          );
        } else if (readiness.ok) {
          markUiMockupStageStarted(diskProjectKey);
          pushActivity(
            'Architecture draft ready — Pre-code mockup (placeholder; Figma optional if structure exists)',
            'info',
          );
          setAccessoryHint(
            'UI mockup next — grounded in Master Plan + ui-brief. Coding waits until the mockup lands.',
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
            uiMockupStarted = true;
            const figmaLine = figmaPickActivityLine({
              figma_status: String(mockup.figma_pick?.figma_status || mockup.context?.figma_status || ''),
              figma_used: String(mockup.figma_pick?.figma_used || mockup.context?.figma_used || ''),
              selection_mode: String(mockup.figma_pick?.selection_mode || mockup.context?.selection_mode || ''),
              file_key: (mockup.figma_pick?.file_key ?? mockup.context?.file_key) as string | null,
              sheet_category: (mockup.figma_pick?.sheet_category ?? mockup.context?.sheet_category) as
                | string
                | null,
              preferred_bucket: (mockup.figma_pick?.preferred_bucket ??
                mockup.context?.preferred_bucket) as string | null,
              pattern_mode: String(mockup.figma_pick?.pattern_mode || mockup.patternMode || ''),
              ui_pass: 'precode',
            });
            pushActivity(figmaLine, 'info');
            const applied = await applyUiStudioBetaToAppPreview(pushActivity);
            if (applied.ok) {
              markUiMockupSucceeded(diskProjectKey);
              pushActivity('UI mockup ready — App Preview updated from UI Studio Beta', 'success');
            } else {
              mockupSkippedOrFailed = true;
              pushActivity(
                'UI mockup ready in UI Studio Beta — open App Preview / Generate if shell still looks empty',
                'warn',
              );
            }
      setMessages((p) => {
        const next = [
          ...p,
          {
                  id: `a-mockup-${Date.now()}`,
            role: 'assistant' as const,
                  content:
                    'Architecture draft is ready. Pre-code mockup is a placeholder (offline catalog if present). Coding writes app/. Final UI restyles after files land.',
                  timestamp: new Date().toLocaleTimeString([], {
                    hour: 'numeric',
                    minute: '2-digit',
                  }),
          },
        ];
        messagesRef.current = next;
        return next;
      });
          } else {
            clearUiMockupStageFlags(diskProjectKey);
            noteProblem(
              `Stopped: UI mockup did not finish (${mockup.error || 'unknown'}) — Foundation will not start.`,
            );
          }
        } else if (fastPrototypeTurn || willCode) {
          noteProblem(
            `Stopped: architecture inputs incomplete (${readiness.reasons.join('; ') || 'plan/ui-brief'}) — Foundation will not start.`,
          );
        }
        }
        }
      } else if (mpSaved > 0) {
        await syncPlanViewsAfterResearch();
      }

      if (
        !willCode &&
        !lastResearchError &&
        agentAllowed &&
        fastPrototypeTurn &&
        (uiMockupStarted || mockupSkippedOrFailed)
      ) {
        willCode = true;
      }

      try {
        // Policy A: Foundation starts only after Gate R + mockup (or persisted mockup / Continue skip).
        let foundationGate = willCode
          ? await canStartFoundationCoding({ mockupSkippedOrFailed })
          : { ok: false as const, reason: 'blocked' as const };
        if (willCode && !foundationGate.ok) {
          const stopMsg =
            lastResearchError && !isAbortLikeMessage(lastResearchError)
              ? lastResearchError
              : RESEARCH_STOPPED;
          lastResearchError = null;
          noteProblem(stopMsg);
          pushActivity(stopMsg, 'error');
          setAccessoryHint('Retry research — Foundation will not start until Gate R is complete.');
          window.setTimeout(() => setAccessoryHint(null), 8000);
          willCode = false;
          try {
            window.dispatchEvent(
              new CustomEvent('nebula-preview-wait-status', { detail: { status: stopMsg } }),
            );
          } catch {
            /* ignore */
          }
          if (codingProblems.length > 0) {
            codingActivityRef.current = false;
            setGrokCodingActive(false);
            setGrokActivity((prev) => finishGrokActivityWithProblems(prev, codingProblems));
          } else {
            resetCodingActivity();
          }
        }

        const foundationAlreadyLanded = foundationLandedOnDisk();
        let wantsNextSlice = userNoteRequestsNextSlice(text);
        if (
          willCode &&
          foundationGate.ok &&
          foundationAlreadyLanded &&
          !wantsNextSlice &&
          !onboardingBuildStart
        ) {
          if (FAST_PROTOTYPE_SAME_SESSION_AUTOPILOT) {
            wantsNextSlice = true;
          } else {
            pushActivity('Foundation already on disk — send Continue for the next slice.', 'success');
            willCode = false;
            resetCodingActivity();
          }
        }

        if (willCode && foundationGate.ok) {
          const st = await fetchResearchStatus(projectName);
          if (!st.ok) {
            const stopMsg = formatResearchStopMessage(st.reasons);
            lastResearchError = stopMsg;
            noteProblem(stopMsg);
            pushActivity(stopMsg, 'error');
            setAccessoryHint('Retry research — Foundation will not start until Gate R is complete.');
            window.setTimeout(() => setAccessoryHint(null), 8000);
            willCode = false;
            foundationGate = { ok: false as const, reason: 'blocked' as const };
            codingActivityRef.current = false;
            setGrokCodingActive(false);
            setGrokActivity((prev) => finishGrokActivityWithProblems(prev, codingProblems));
          }
        }

        if (willCode && foundationGate.ok) {
          sendingRef.current = true;
          setSending(true);
        }

        // Fast Prototype plan turn must not apply app file blocks / START_CODING from the
        // same Grok reply — product launches Foundation Go after research + mockup.
        const planTurnNoChatCode = fastPrototypeTurn && !userForcedCoding;
        let launchedGoSlice: string | null = null;
        let coding =
          agentAllowed && willCode && foundationGate.ok && !planTurnNoChatCode && !skipGrokChat
          ? await handlePostGrokCodingTurn({
              assistantContent: masterPlanSource,
              planningPhase,
              userId,
              projectName,
              userNote: text,
              onProgress: codingActivityRef.current ? pushActivity : undefined,
              productRoutesOnDisk: foundationLandedOnDisk(),
            })
          : { ran: false };
        // No Go button: user "go" / Discovery / Fast Prototype / assistant coding promise starts coding.
        const forceGoPipeline =
          onboardingBuildStart ||
          fastPrototypeTurn ||
          shortCodingNudge ||
          userForcedCoding ||
          assistantCodingPromise;
        if (
          FAST_PROTOTYPE_SAME_SESSION_AUTOPILOT &&
          foundationAlreadyLanded &&
          !wantsNextSlice &&
          !onboardingBuildStart
        ) {
          wantsNextSlice = true;
        }
        if (
          !coding.ran &&
          agentAllowed &&
          foundationGate.ok &&
          forceGoPipeline &&
          foundationAlreadyLanded &&
          !wantsNextSlice &&
          !onboardingBuildStart
        ) {
          pushActivity('Foundation already on disk — send Continue for the next slice.', 'success');
          resetCodingActivity();
        } else if (!coding.ran && agentAllowed && foundationGate.ok && forceGoPipeline) {
          // After Foundation exists, "continue building" must request the NEXT slice — not Foundation again.
          // Empty explorer (no app/ routes) stays Foundation even if the user said continue/finish.
          const foundationLanded = foundationLandedOnDisk();
          const nextSliceGo = foundationLanded && wantsNextSlice;
          const { projectKey: continueProjectKey } = resolveActiveProjectIds(diskProjectKey);
          const nextContinueLabel = nextSliceGo
            ? resolveNextContinueSlice({
                lastSlice: lastAutoSliceLabelRef.current,
                projectKey: continueProjectKey,
                productRoutesOnDisk: foundationLanded,
                workspacePaths: diskPaths,
                planSlice: planSliceFromDisk,
              })
            : null;
          if (nextSliceGo && !nextContinueLabel) {
            pushActivity(policyAStopMessage('Polish'), 'success');
            resetCodingActivity();
            sendingRef.current = false;
            setSending(false);
          } else {
          if (wantsNextSlice && !foundationLanded) {
            pushActivity(FOUNDATION_RETRY_ACTIVITY, 'warn');
          }
          pushActivity(
            onboardingBuildStart
              ? 'Nothing more to add — launching Go Code pipeline'
              : nextContinueLabel
                ? `Continue — launching ${nextContinueLabel} slice (not Foundation)`
                : wantsNextSlice && !foundationLanded
                  ? 'Retry Foundation (Go) — not Continue for Primary'
                  : userForcedCoding
                    ? 'User asked to code — launching Go Code pipeline'
                    : fastPrototypeTurn
                      ? 'Fast Prototype — launching Go Code pipeline'
                      : 'START_CODING — launching Go Code pipeline',
            wantsNextSlice && !foundationLanded ? 'warn' : 'info',
          );
          launchedGoSlice = nextContinueLabel;
          const goSliceInstruction = nextContinueLabel
            ? buildAutopilotSliceInstruction(nextContinueLabel)
            : FOUNDATION_SLICE_INSTRUCTION;
          const goMessages = [
            {
              role: 'user' as const,
              content: goSliceInstruction,
            },
          ];
          beginCodingActivity('Grok Code — writing files to workspace', goWorkSteps(), {
            subhead: nextContinueLabel
              ? `Go — ${nextContinueLabel} slice`
              : wantsNextSlice && !foundationLanded
                ? FOUNDATION_RETRY_ACTIVITY
                : 'Foundation coding slice',
            initialLog: 'Running Grok Code — apply starts after Code pass 1 returns files',
          });
          setInferenceFirstStage('coding', diskProjectKey);
          setGrokActivity((prev) =>
            advanceGrokActivity(prev, showWorkActivity ? 5 : 2, {
              currentAction: 'Grok Code — Code pass 1 (waiting for generated files)…',
              log: { message: 'Running Grok Code — apply starts after Code pass 1 returns files', kind: 'info' },
            }),
          );
          let go = await runGoCodeAndApply({
            userId,
            projectName,
            userNote: goSliceInstruction,
            onProgress: pushActivity,
            messages: goMessages,
          });
          // Strict Go often blocks on security/sign-in — re-accept baseline once, then retry.
          if (
            !go.ok &&
            go.blockedReason?.code === 'MASTER_PLAN_INCOMPLETE'
          ) {
            try {
              const sec = await fetchJson<{ ok?: boolean; applied?: boolean }>(
                withProjectQuery('/api/master-plan/accept-security-baseline'),
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                  body: JSON.stringify(withProjectBody({})),
                },
              );
              if (sec.applied) {
                pushActivity(
                  'Filled missing security/sign-in baseline — retrying Foundation coding…',
                  'info',
                );
                window.dispatchEvent(new CustomEvent('nebula-master-plan-updated'));
              } else {
                pushActivity('Retrying Foundation coding after Master Plan gate…', 'info');
              }
              go = await runGoCodeAndApply({
                userId,
                projectName,
                userNote: goSliceInstruction,
                onProgress: pushActivity,
                messages: goMessages,
              });
            } catch {
              /* keep first go failure */
            }
          }
          coding = {
            ran: true,
            ok: go.ok,
            statusMessage: go.statusMessage,
            writtenCount: go.totalWritten,
            sliceLabel: go.sliceLabel ?? 'Foundation',
            blockedReason: go.blockedReason,
            productRouteCount: go.productRouteCount,
          };
          }
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
          const blockedLine =
            coding.ok === false
              ? coding.blockedReason
                ? `${coding.blockedReason.message} [${coding.blockedReason.code}]`
                : coding.statusMessage
              : coding.statusMessage;
          setGrokActivity((prev) =>
            advanceGrokActivity(prev, showWorkActivity ? 5 : 3, {
              currentAction:
                coding.ok === false
                  ? blockedLine || 'Foundation coding stopped'
                  : coding.statusMessage || 'Syncing mind map, explorer, and preview…',
              ...(blockedLine
                ? {
                    stepDetail: { index: showWorkActivity ? 4 : 2, detail: blockedLine },
                    log: {
                      message: blockedLine,
                      kind: coding.ok === false ? 'error' : 'success',
                    },
                  }
                : {}),
            }),
          );
          // Go/coding failures are NOT App Preview issues — do not call reportAppRuntimeIssue.
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
          if (coding.ok === false || coding.blockedReason) {
            noteProblem(
              coding.blockedReason
                ? `${coding.blockedReason.message} [${coding.blockedReason.code}]`
                : blockedLine || 'Foundation coding reported a problem',
            );
            if (coding.blockedReason?.code === 'RESEARCH_INCOMPLETE') {
              setAccessoryHint('Retry research — Foundation will not start until Gate R is complete.');
              window.setTimeout(() => setAccessoryHint(null), 8000);
            }
          }
          const wroteFiles = (coding.writtenCount ?? coding.writtenPaths?.length ?? 0) > 0;
          const foundationOnDisk = foundationLandedOnDisk();
          const landedRoutes =
            typeof coding.productRouteCount === 'number'
              ? coding.productRouteCount
              : wroteFiles
                ? undefined
                : foundationOnDisk
                  ? undefined
                  : 0;
          if (coding.ok !== false && wroteFiles) {
            // Artifact sync already ran inside Go/apply (single owner). Do not start a second
            // "Syncing project artifacts…" that can false-block the activity feed.
            if (mpSaved > 0) {
              window.dispatchEvent(new CustomEvent('nebula-open-master-plan'));
            }
            if (showWorkActivity) {
              setGrokActivity((prev) =>
                advanceGrokActivity(prev, showWorkActivity ? 6 : 4, {
                  currentAction: 'Coding slice applied — opening live App Preview',
                  log: {
                    message: 'App Preview is ready — opening the live practice app',
                    kind: 'info',
                  },
                }),
              );
            }
            try {
              dispatchStudioShowLiveApp();
              window.dispatchEvent(new CustomEvent('nebula-open-app-preview'));
            } catch {
              /* ignore */
            }
            pushActivity('Coding slice done — opening live App Preview (not the UI Studio mockup)', 'success');
          }

          const codingSliceLabel =
            launchedGoSlice ||
            (coding as { sliceLabel?: string | null }).sliceLabel ||
            'Foundation';
          const { projectKey } = resolveActiveProjectIds(diskProjectKey);
          if (coding.ok !== false && wroteFiles) {
            lastAutoSliceLabelRef.current = codingSliceLabel;
            lastAutoProductRouteCountRef.current = Math.max(
              lastAutoProductRouteCountRef.current ?? 0,
              (coding as { productRouteCount?: number }).productRouteCount ?? 0,
              landedRoutes ?? 0,
            );
            persistLastAppliedSlice(projectKey, codingSliceLabel);
          }
          const autoDecision = shouldAutopilotAdvance({
            codingOk: coding.ok !== false && wroteFiles,
            lastSlice: codingSliceLabel,
            autoCount: getAutopilotSliceCount(projectKey),
            autopilotKickoff: true,
            productRouteCount: lastAutoProductRouteCountRef.current ?? landedRoutes,
            productRoutesOnDisk: foundationOnDisk,
            wroteFiles,
            blockedCode: coding.blockedReason?.code,
          });
          pushActivity(
            autoDecision.message,
            autoDecision.advance
              ? 'info'
              : autoDecision.stopReason === 'failed'
                ? 'error'
                : 'success',
          );
          sendingRef.current = false;
          setSending(false);
          if (autoDecision.advance) {
            if (codingProblems.length > 0) {
              setGrokActivity((prev) => finishGrokActivityWithProblems(prev, codingProblems));
            }
            scheduleAutopilotHandoff();
          } else if (codingProblems.length > 0) {
            codingActivityRef.current = false;
            setGrokCodingActive(false);
            setGrokActivity((prev) => finishGrokActivityWithProblems(prev, codingProblems));
          } else {
            resetCodingActivity();
          }
        } else if (hasAppStatusPayload && agentAllowed && assistantSkippedNdmVerify(raw)) {
          setAccessoryHint(t('appStatus.ndmNudge'));
          window.setTimeout(() => setAccessoryHint(null), 4500);
        }
      } catch (codingErr) {
        console.warn('[AIChat] coding apply:', codingErr);
        if (isAbortLikeError(codingErr) && mpSaved > 0) {
          pushActivity(
            'Coding request interrupted — Master Plan is saved. Send go to retry Foundation.',
            'warn',
          );
        } else if (codingActivityRef.current) {
          const fail =
            codingErr instanceof Error ? codingErr.message : 'Could not write files to workspace';
          setSendError(fail);
          holdCodingFailure(fail);
        }
      }

      if (/<START_UIUX>/i.test(masterPlanSource) && !willCode) {
        // Legacy tag: open original studio without auto V0 (Beta generates after file apply).
        dispatchStartUiUxWorkflow({ tab: 'design', autoV0: false });
      }

    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (isAbortLikeError(e) && mpSaved > 0) {
        pushActivity(
          'Request interrupted — Master Plan is saved. Send go to start Foundation.',
          'warn',
        );
        resetCodingActivity();
        return;
      }
      const failureClass = classifyContinueFailure({ message: msg });
      // Phase 7.0: on key/auth reject — surface clearly, clear false mockup flags, stop stampede.
      if (failureClass === 'key/auth fail' || isKeyAuthFailureMessage(msg)) {
        markMainAiAuthRejected(diskProjectKey);
        clearUiMockupStageFlags(diskProjectKey);
      }
      const line = continueFailureActivityLine(
        failureClass === 'key/auth fail' || isKeyAuthFailureMessage(msg) ? 'key/auth fail' : failureClass,
        msg,
      );
      if (codingActivityRef.current) {
        holdCodingFailure(line);
      } else {
        pushActivity(line, 'error');
      }
      const pubCfg = await fetchNebulaPublicConfig();
      setSendError(
        userFacingContinueFailureMessage(failureClass, msg, {
          billingEnabled: pubCfg.billingEnabled,
          freeTierTokenLimitDisabled: pubCfg.freeTierTokenLimitDisabled,
          hasUserByok: pubCfg.hasUserByok,
        }),
      );
    } finally {
      sendingRef.current = false;
      setSending(false);
      if (openTalkDesiredRef.current && !scheduledTts) {
        resumeOpenTalkIfWanted();
    }
    }
  }, [sending, activePath, activeTab?.content, serverHasGrokKey, micInputBlocked, workspaceRootLabel, gitBranch, tabs, pauseHandsFreeListening, resumeOpenTalkIfWanted, beginCodingActivity, beginPlanActivity, holdCodingFailure, pushActivity, resetCodingActivity, workspacePaths.length, noteUserMessageForMirror, prefs.contentMode, resolvedIdeLocale, t, localeLabels]);

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

  // Missing key must stay visible on Build send — Settings still owns the save path.
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
        const r = await fetch(withProjectQuery('/api/config'), {
          credentials: 'include',
          headers: getGrokRequestHeaders(),
        });
        const cfg = (await readResponseJson(r)) as { hasMainAiApiKey?: boolean; hasGrokApiKey?: boolean };
        setServerHasGrokKey(hasUsableGrokKeyForChat(r.ok ? cfg : null));
      } catch {
        setServerHasGrokKey(hasUsableGrokKeyForChat(null));
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

    void cancelProjectBackgroundJobs();

    const session = await fetchSessionUser();
    const userId = session?.uid?.trim() || 'anonymous';
    const projectName = getBrowserProjectName().trim() || 'Untitled project';
    const researchSt = await fetchResearchStatus(projectName);
    if (!researchSt.ok) {
      const stopMsg = formatResearchStopMessage(researchSt.reasons);
      setSendError(stopMsg);
      setAccessoryHint('Retry research — Foundation will not start until Gate R is complete.');
      window.setTimeout(() => setAccessoryHint(null), 8000);
      sendingRef.current = false;
      setSending(false);
      return;
    }
    beginCodingActivity('Grok Code — writing files to workspace', goWorkSteps(), {
      subhead: 'One coherent slice (Build → Debug → Next). Validate before the next slice.',
      initialLog: 'Running Grok Code — apply starts after Code pass 1 returns files',
    });
    setGrokActivity((prev) =>
      advanceGrokActivity(prev, 2, {
        currentAction: 'Grok Code — Code pass 1 (waiting for generated files)…',
        log: { message: 'Running Grok Code — apply starts after Code pass 1 returns files', kind: 'info' },
      }),
    );

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
          currentAction: go.statusMessage,
          ...(go.statusMessage
            ? { stepDetail: { index: 2, detail: go.statusMessage }, log: { message: go.statusMessage, kind: go.ok ? 'success' : 'error' } }
            : {}),
        }),
      );
      if (!go.ok || go.blockedReason) {
        const problems = [
          go.blockedReason
            ? `${go.blockedReason.message} [${go.blockedReason.code}]`
            : go.statusMessage || 'Foundation coding reported a problem',
        ];
        if (go.ok) {
          try {
            window.dispatchEvent(new CustomEvent('nebula-master-plan-updated'));
            window.dispatchEvent(new CustomEvent('nebula-files-applied'));
          } catch {
            /* ignore */
          }
          dispatchStudioShowLiveApp();
          pushActivity('Coding slice done — issues noted on the status bar', 'warn');
        } else {
          setSendError(go.statusMessage);
        }
        codingActivityRef.current = false;
        setGrokCodingActive(false);
        setV0Live(false);
        setGrokActivity((prev) => finishGrokActivityWithProblems(prev, problems));
      } else {
      // Artifact sync + UI Studio Beta already ran inside runGoCodeAndApply (single owner).
      // Do not start a second "Syncing project artifacts…" — that was the forever spinner after Slice complete.
      try {
        window.dispatchEvent(new CustomEvent('nebula-master-plan-updated'));
        window.dispatchEvent(new CustomEvent('nebula-files-applied'));
      } catch {
        /* ignore */
      }
      dispatchStudioShowLiveApp();
      pushActivity('Coding complete — opening live App Preview', 'success');
      codingActivityRef.current = false;
      setGrokCodingActive(false);
      setGrokActivity((prev) =>
        finishGrokActivity(prev, 'Coding finished', goWorkSteps(), go.statusMessage),
      );
      setV0Live(false);
      }
    } catch (e) {
      const fail = e instanceof Error ? e.message : 'Coding failed';
      setSendError(fail);
      holdCodingFailure(fail);
    } finally {
      setSending(false);
      setAccessoryHint(null);
      if (openTalkDesiredRef.current) {
        resumeOpenTalkIfWanted();
      }
    }
  }, [micInputBlocked, sending, serverHasGrokKey, stopVoiceRecognition, refreshWorkspaceMeta, resumeOpenTalkIfWanted, pushActivity, beginCodingActivity, holdCodingFailure, resetCodingActivity, workspacePaths.length]);

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
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-transparent">
      <IdeAppStatusMenuButton
        onFixWithAgent={handleFixWithAgent}
        onVoiceNudge={onAppStatusVoiceNudge}
        rideStatus={rideStatusLine}
      />

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

      <ChatGrokStatusPane activity={grokActivity} v0Live={v0Live || v0WatchActive} />

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
              onClick={() => openSettingsAiKeys()}
            >
              Open Secrets
            </button>
          ) : null}
        </div>
      ) : null}

      <div
        ref={scrollContainerRef}
        onScroll={onChatScroll}
        className="min-h-0 flex-1 space-y-4 overflow-auto px-4 py-4"
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
                {(() => {
                  const isLatest = message.id === messages[messages.length - 1]?.id;
                  // Only wait rows spin. Terminal kinds (success/warn/error) never spin —
                  // prevents false "Syncing project artifacts…" hang after apply already succeeded.
                  const waitSpinning =
                    message.statusKind === 'wait' &&
                    isLatest &&
                    (sending || grokActivity.tone === 'work');
                  return waitSpinning ? (
                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/70" aria-hidden />
                  ) : (
                    <Bot className="h-3 w-3 text-muted-foreground/50" aria-hidden />
                  );
                })()}
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
                  'type-body-md inline-block rounded-lg px-3 py-2',
                  message.role === 'user' ? 'border border-border text-foreground' : 'bg-transparent text-foreground',
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
            aria-pressed={assistantInteractionMode === 'chat'}
            title={
              assistantInteractionMode === 'chat'
                ? t('chat.mode.chatHint')
                : t('chat.mode.agentHint')
            }
            onClick={() =>
              void applyInteractionMode(
                assistantInteractionMode === 'chat' ? 'agent' : 'chat',
              )
            }
            className={cn(
              'absolute right-1.5 top-1 z-10 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-normal transition',
              assistantInteractionMode === 'chat'
                ? 'bg-primary/20 text-primary ring-1 ring-primary/30'
                : 'bg-black/40 text-muted-foreground ring-1 ring-border hover:text-foreground',
            )}
          >
            <MessageSquare className="h-3 w-3" aria-hidden />
            {t('chat.mode.chat')}
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
                if (sendingRef.current) stopSending();
                void sendChat();
              }
            }}
            placeholder={
              assistantInteractionMode === 'agent'
                ? t('chat.placeholder.agent')
                : t('chat.placeholder.chat')
            }
            rows={2}
            disabled={uploadBusy}
            className="min-h-[2.75rem] w-full resize-none bg-transparent pt-0 pr-16 text-[12px] leading-snug text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-50"
          />

          <div className="mt-1 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <ChatRoundButton
                size="sm"
                label={uploadBusy ? t('chat.uploading') : t('chat.attach')}
                onClick={handleFileAttachClick}
                disabled={uploadBusy || micInputBlocked}
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
                disabled={uploadBusy}
              >
                <Mic
                  className={cn(
                    'h-3.5 w-3.5',
                    isRecordingVoice ? 'text-destructive' : '',
                  )}
                />
              </ChatRoundButton>
            </div>

              {sending ? (
                <ChatRoundButton
                  size="sm"
                  label="Stop"
                  onClick={() => {
                    stopVoiceRecognition();
                    setIsRecordingVoice(false);
                    stopSending();
                  }}
                >
                  <Square className="h-3.5 w-3.5" />
                </ChatRoundButton>
              ) : (
                <ChatRoundButton
                  size="sm"
                  label={t('chat.sendMessage')}
                  onClick={() => {
                    stopVoiceRecognition();
                    setIsRecordingVoice(false);
                    void sendChat();
                  }}
                  disabled={!input.trim() || uploadBusy}
                >
                  <Send className="h-3.5 w-3.5" />
                </ChatRoundButton>
              )}
          </div>
        </div>
      </div>
    </div>
  );
}
