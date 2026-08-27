/**
 * UI Studio Beta — exact duplicate of IdeVisualEditor for a future Grok generation path.
 * Do not change IdeVisualEditor.tsx / original UI Studio wiring from here.
 * Temporary: same local tools + preview; does not listen for original auto-run v0 events
 * (so the original page remains the sole owner of product v0 orchestration).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  History,
  Loader2,
  Maximize2,
  Minimize2,
  Monitor,
  RotateCcw,
  Save,
  Smartphone,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import { getBrowserProjectName, withProjectBody, withProjectQuery } from '../../lib/nebulaProjectApi';
import { getGrokRequestHeaders } from '../../lib/grokUserKey';
import { getStoredV0ApiKey, getV0RequestHeaders, hasLocalV0ApiKey, NEBULLA_V0_KEY_STORAGE } from '../../lib/v0Key';
import { formatV0UiError } from '../../lib/v0ErrorMessage';
import { computeV0Readiness } from '../../lib/v0Readiness';
import { subscribeGrokCodingActive } from '../../lib/nebulaGrokCodingGate';
import { runV0GenerationWithPolling } from '../../lib/v0GenerationClient';
import { runMasterPlanUiPipeline } from '../../lib/ideArtifactSync';
import { emitChatV0Progress, emitChatV0Watch } from '../../lib/chatV0Status';
import {
  resolveProjectType,
  studioDeviceModeForType,
  type NebulaProjectType,
  type StudioDeviceMode,
} from '../../lib/nebulaProjectType';
import {
  figmaStatusIsSoftFallback,
  figmaStatusLabel,
  gateLabel,
  weakGateUserMessage,
} from '../../lib/uiGenStatusLabels';
import { clearUiMockupStageFlags } from '../../lib/uiMockupGate';
import { isLoadableStudioModel } from '../../../lib/uiMockupArtifactHonesty';
import { NEBULA_STUDIO_SHOW_LIVE_APP, NEBULA_UI_STUDIO_BETA_BUSY } from '../../lib/uiStudioBetaEngine';

const V0_FETCH_TIMEOUT_MS = 360_000;

async function fetchWithTimeout(url: string, init: RequestInit, ms = V0_FETCH_TIMEOUT_MS): Promise<Response> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

type StudioStatus = {
  v0PromptExists?: boolean;
  v0PromptPath?: string;
  v0PromptLength?: number;
  hasRealV0?: boolean;
  hasV0ApiKey?: boolean;
  v0Pending?: boolean;
  v0PendingChatId?: string;
  v0Starting?: boolean;
  v0StartError?: string;
  v0DemoUrl?: string;
  eligibilityReason?: string;
};

type StudioPreviewSurface = 'v0-live' | 'visual-model' | 'live-app';

function buildStudioLivePreviewUrl(rev: number): string {
  const base = withProjectQuery('/api/app-preview/bootstrap');
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}_rev=${rev}`;
}

export type VisualStyle = {
  backgroundColor: string;
  color: string;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
  width: string;
  height: string;
  borderRadius: number;
  borderWidth: number;
  borderColor: string;
  boxShadow: string;
  opacity: number;
};

export type VisualNode = {
  id: string;
  /** Used for "apply to similar" matching on the page / across pages. */
  role: string;
  type: 'container' | 'text' | 'button' | 'box';
  children?: string[];
  text?: string;
  style: VisualStyle;
};

export type PageModel = {
  rootId: string;
  nodes: Record<string, VisualNode>;
};

export type EditorModel = {
  pages: Record<string, PageModel>;
};

const defaultStyle = (): VisualStyle => ({
  backgroundColor: '#FAFAF9',
  color: '#171717',
  paddingTop: 16,
  paddingRight: 16,
  paddingBottom: 16,
  paddingLeft: 16,
  marginTop: 0,
  marginRight: 0,
  marginBottom: 0,
  marginLeft: 0,
  width: '100%',
  height: 'auto',
  borderRadius: 8,
  borderWidth: 0,
  borderColor: '#E5E5E5',
  boxShadow: 'none',
  opacity: 1,
});

/** Waiting shell — never Cosmic Night / Nebulla Workspace (that is IDE chrome, not app UI). */
function buildWaitingModel(stageHint?: string): EditorModel {
  const root = 'root-waiting';
  const title = 'waiting-title';
  const sub = 'waiting-sub';
  return {
    pages: {
      Home: {
        rootId: root,
        nodes: {
          [root]: {
            id: root,
            role: 'page-root',
            type: 'container',
            children: [title, sub],
            style: {
              ...defaultStyle(),
              backgroundColor: '#FAFAF9',
              paddingTop: 40,
              paddingLeft: 28,
              paddingRight: 28,
              paddingBottom: 40,
            },
          },
          [title]: {
            id: title,
            role: 'hero-title',
            type: 'text',
            text: 'Waiting for UI generation',
            style: {
              ...defaultStyle(),
              backgroundColor: '#FAFAF9',
              color: '#171717',
              paddingTop: 0,
              paddingBottom: 8,
              borderRadius: 0,
              boxShadow: 'none',
            },
          },
          [sub]: {
            id: sub,
            role: 'hero-sub',
            type: 'text',
            text:
              stageHint?.trim() ||
              'Press Generate UI when Master Plan + ui-brief are ready (inference-first runs this before coding). This canvas is a static UI Gen mockup — not the live coded Expo/React app. Regenerate if chrome looks generic; Figma is optional (local catalog by default).',
            style: {
              ...defaultStyle(),
              backgroundColor: '#FAFAF9',
              color: '#525252',
              paddingTop: 0,
              borderRadius: 0,
              boxShadow: 'none',
            },
          },
        },
      },
    },
  };
}

function isNebullaIdePlaceholderShell(model: EditorModel | null | undefined): boolean {
  if (!model?.pages) return false;
  const text = JSON.stringify(model);
  if (/Nebulla Workspace|Cosmic Night|0vgenerated-v2|inspired by 0vgenerated|Open Explorer/i.test(text)) {
    return true;
  }
  // Classic Cosmic Night chrome — hex pair alone can appear in real app palettes
  if (
    /#080A14/i.test(text) &&
    /#00D4D4/i.test(text) &&
    /Nebulla|Cosmic Night|Workspace|Open Explorer/i.test(text)
  ) {
    return true;
  }
  return false;
}

function applyEditorModel(
  next: EditorModel,
  setModel: React.Dispatch<React.SetStateAction<EditorModel>>,
  setActivePage: React.Dispatch<React.SetStateAction<string>>,
  baselineRef: React.MutableRefObject<EditorModel | null>,
  preferredPage?: string,
): void {
  if (!next?.pages || isNebullaIdePlaceholderShell(next)) return;
  const clean = sanitizeModelColors(next);
  setModel(clean);
  baselineRef.current = cloneModel(clean);
  const pages = Object.keys(clean.pages);
  if (preferredPage && pages.includes(preferredPage)) setActivePage(preferredPage);
  else if (pages[0]) setActivePage(pages[0]);
}
function cloneModel(m: EditorModel): EditorModel {
  return JSON.parse(JSON.stringify(m)) as EditorModel;
}

/** Normalize to `#rrggbb` for `<input type="color">` — never returns `transparent`. */
function toPickerHex(raw: string | undefined, fallback: string): string {
  const fb = /^#[0-9a-fA-F]{6}$/.test(fallback) ? fallback.toLowerCase() : '#ffffff';
  const s = (raw || '').trim();
  if (!s || /^transparent$/i.test(s) || /^none$/i.test(s)) return fb;
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{8}$/.test(s)) return `#${s.slice(1, 7)}`.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    const a = s[1];
    const b = s[2];
    const c = s[3];
    return `#${a}${a}${b}${b}${c}${c}`.toLowerCase();
  }
  const m = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) {
    const h = (n: string) => Number(n).toString(16).padStart(2, '0');
    return `#${h(m[1])}${h(m[2])}${h(m[3])}`;
  }
  return fb;
}

function normalizeHexOnCommit(raw: string, fallback: string): string {
  const s = raw.trim();
  if (/^transparent$/i.test(s) || /^none$/i.test(s)) return toPickerHex(undefined, fallback);
  if (/^#[0-9a-fA-F]{6}$/i.test(s) || /^#[0-9a-fA-F]{3}$/i.test(s)) return toPickerHex(s, fallback);
  if (/^[0-9a-fA-F]{6}$/i.test(s)) return `#${s.toLowerCase()}`;
  if (/^[0-9a-fA-F]{3}$/i.test(s)) return toPickerHex(`#${s}`, fallback);
  return toPickerHex(s, fallback);
}

/** Background: always persist `#rrggbb` (no `transparent` — breaks color inputs). */
function normalizeBgColorOnCommit(raw: string, fallback: string): string {
  return normalizeHexOnCommit(raw, fallback);
}

/** Strip invalid color tokens from a loaded/generated editor model. */
function sanitizeModelColors(m: EditorModel): EditorModel {
  const next = cloneModel(m);
  for (const page of Object.values(next.pages)) {
    for (const node of Object.values(page.nodes)) {
      if (!node?.style) continue;
      node.style.backgroundColor = toPickerHex(node.style.backgroundColor, '#ffffff');
      node.style.color = toPickerHex(node.style.color, '#171717');
      node.style.borderColor = toPickerHex(node.style.borderColor, '#e5e5e5');
    }
  }
  return next;
}

export function IdeUiStudioBeta({
  onLock: _onLock,
  projectDisplayName,
}: {
  onLock?: () => void;
  projectDisplayName?: string;
}) {
  const projectLabel = projectDisplayName?.trim() || getBrowserProjectName() || 'project';

  const { t } = useLanguage();
  const [eligible, setEligible] = useState<boolean | null>(null);
  const [eligibilityReason, setEligibilityReason] = useState<string | undefined>();
  const [activePage, setActivePage] = useState('Home');
  const [model, setModel] = useState<EditorModel>(() => buildWaitingModel());
  const [hasEnginePreview, setHasEnginePreview] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<EditorModel[]>([]);
  const [applyConfirmOpen, setApplyConfirmOpen] = useState(false);
  const [revertConfirmOpen, setRevertConfirmOpen] = useState(false);
  const [restoreOriginalConfirmOpen, setRestoreOriginalConfirmOpen] = useState(false);
  const [applyAllPagesConfirmOpen, setApplyAllPagesConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [engineStage, setEngineStage] = useState('');
  const [regenCount, setRegenCount] = useState(0);
  const [maxRegens, setMaxRegens] = useState(3);
  const [preferenceRecovery, setPreferenceRecovery] = useState(false);
  const [preferenceQuestion, setPreferenceQuestion] = useState(
    'I can see this still isn’t right. What bothers you most — layout, colors, spacing, missing sections, or overall style?',
  );
  const [preferenceDraft, setPreferenceDraft] = useState('');
  const [preferenceHints, setPreferenceHints] = useState<{
    denser?: boolean;
    looser?: boolean;
    moreSections?: boolean;
    strongerCta?: boolean;
    moreContrast?: boolean;
  }>({});
  const [lastGate, setLastGate] = useState<string>('');
  const [patternMode, setPatternMode] = useState<'seed' | 'figma' | 'catalog' | ''>('');
  const [figmaStatus, setFigmaStatus] = useState<string>('');
  const [figmaError, setFigmaError] = useState<string>('');
  const [figmaEnvGuidance, setFigmaEnvGuidance] = useState<string>('');
  const [resourceMatchLabel, setResourceMatchLabel] = useState<string>('');
  const [resourceMatchTitle, setResourceMatchTitle] = useState<string>('');
  const [previewSynced, setPreviewSynced] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const baselineRef = useRef<EditorModel | null>(null);
  const [previewSurface, setPreviewSurface] = useState<StudioPreviewSurface>('visual-model');
  const [codedAppLive, setCodedAppLive] = useState(false);
  const [livePreviewRev, setLivePreviewRev] = useState(0);
  const [previewStatusLabel, setPreviewStatusLabel] = useState<string | null>(null);
  const [v0DemoUrl, setV0DemoUrl] = useState<string | null>(null);
  const [projectType, setProjectType] = useState<NebulaProjectType | null>(null);
  const [deviceMode, setDeviceMode] = useState<StudioDeviceMode>('desktop');
  const [hasV0ApiKey, setHasV0ApiKey] = useState<boolean | null>(null);
  const [v0ServerReady, setV0ServerReady] = useState<boolean | null>(null);
  const [studioStatus, setStudioStatus] = useState<StudioStatus | null>(null);
  const [grokCodingActive, setGrokCodingActive] = useState(false);
  const v0RunningRef = useRef(false);
  const resumeV0StartedRef = useRef(false);
  const runV0GenerationRef = useRef<(opts?: { resumeOnly?: boolean }) => Promise<void>>(async () => {});
  const notifyV0 = useCallback((line: string, isError = false) => {
    emitChatV0Progress(line);
    if (isError) setError(line);
    else setError('');
  }, []);
  const v0StorageKey = `nebulla-v0-chat-${projectLabel.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48)}`;
  const [v0ChatId, setV0ChatId] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(v0StorageKey);
    } catch {
      return null;
    }
  });

  const pageIds = useMemo(() => Object.keys(model.pages), [model.pages]);
  const page = model.pages[activePage];
  const selected = selectedId && page ? page.nodes[selectedId] : null;

  const persistHeaders = (): Record<string, string> => {
    return { 'Content-Type': 'application/json', ...getV0RequestHeaders() };
  };

  const pushUndo = useCallback(() => {
    setUndoStack((s) => [...s.slice(-49), cloneModel(model)]);
  }, [model]);

  const loadStudioStatus = useCallback(async (): Promise<StudioStatus | null> => {
    try {
      const r = await fetch(withProjectQuery('/api/nebula-ui-studio/status'), {
        credentials: 'include',
        headers: getV0RequestHeaders(),
      });
      const d = (await r.json()) as StudioStatus & { error?: string };
      if (r.ok) {
        setStudioStatus(d);
        if (d.hasV0ApiKey) {
          setHasV0ApiKey(true);
          setV0ServerReady(true);
        }
        return d;
      }
    } catch {
      /* ignore */
    }
    return null;
  }, []);

  const loadEligibility = useCallback(async () => {
    try {
      const r = await fetch(withProjectQuery('/api/visual-ui-editor/eligibility'));
      const d = (await r.json()) as { eligible?: boolean; reason?: string };
      setEligible(Boolean(d.eligible));
      setEligibilityReason(typeof d.reason === 'string' ? d.reason : undefined);
    } catch {
      setEligible(false);
      setEligibilityReason('Failed to read eligibility.');
    }
    await loadStudioStatus();
  }, [loadStudioStatus]);

  useEffect(() => {
    void loadEligibility();
  }, [loadEligibility]);

  useEffect(() => {
    let cancelled = false;
    const refreshType = async () => {
      const type = await resolveProjectType();
      if (cancelled) return;
      setProjectType(type);
      setDeviceMode(studioDeviceModeForType(type));
    };
    void refreshType();
    const onPlan = () => void refreshType();
    window.addEventListener('nebula-master-plan-updated', onPlan);
    window.addEventListener('nebula-project-reset', onPlan);
    return () => {
      cancelled = true;
      window.removeEventListener('nebula-master-plan-updated', onPlan);
      window.removeEventListener('nebula-project-reset', onPlan);
    };
  }, []);

  useEffect(() => {
    if (!busy && !studioStatus?.v0Starting) return;
    const id = window.setInterval(() => void loadStudioStatus(), 8000);
    return () => window.clearInterval(id);
  }, [busy, studioStatus?.v0Starting, loadStudioStatus]);

  useEffect(() => {
    const onReset = () => {
      resumeV0StartedRef.current = false;
      v0RunningRef.current = false;
      void loadEligibility();
    };
    window.addEventListener('nebula-project-reset', onReset);
    return () => window.removeEventListener('nebula-project-reset', onReset);
  }, [loadEligibility]);

  useEffect(() => {
    const onArtifacts = () => void loadEligibility();
    const onV0Complete = () => void loadEligibility();
    window.addEventListener('nebula-files-applied', onArtifacts);
    window.addEventListener('nebula-mind-map-updated', onArtifacts);
    window.addEventListener('nebula-master-plan-updated', onArtifacts);
    window.addEventListener('nebula-ui-studio-v0-complete', onV0Complete);
    return () => {
      window.removeEventListener('nebula-files-applied', onArtifacts);
      window.removeEventListener('nebula-mind-map-updated', onArtifacts);
      window.removeEventListener('nebula-master-plan-updated', onArtifacts);
      window.removeEventListener('nebula-ui-studio-v0-complete', onV0Complete);
    };
  }, [loadEligibility]);

  // Beta does not subscribe to product auto-run / cancel / clear v0 events — original UI Studio owns those.

  // Beta preview is engine-driven — do not auto-switch to legacy v0-live iframe.
  useEffect(() => {
    const demo = studioStatus?.v0DemoUrl?.trim();
    if (demo) setV0DemoUrl(demo);
  }, [studioStatus?.v0DemoUrl]);

  const refreshCodedAppMeta = useCallback(async () => {
    try {
      const res = await fetch(withProjectQuery('/api/app-preview/meta'), {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        codedApp?: boolean;
        previewMode?: string;
        previewStatusLabel?: string;
      };
      const coded =
        data.codedApp === true ||
        data.previewMode === 'post_code_bridge' ||
        data.previewMode === 'interactive_product_preview' ||
        data.previewMode === 'live_app_static';
      setCodedAppLive(coded);
      if (typeof data.previewStatusLabel === 'string' && data.previewStatusLabel.trim()) {
        setPreviewStatusLabel(data.previewStatusLabel.trim());
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refreshCodedAppMeta();
    const onFiles = () => {
      void refreshCodedAppMeta();
      setLivePreviewRev((n) => n + 1);
    };
    const onReload = () => {
      void refreshCodedAppMeta();
      setLivePreviewRev((n) => n + 1);
    };
    const onShowLive = () => {
      void refreshCodedAppMeta();
      setLivePreviewRev((n) => n + 1);
      setPreviewSurface('live-app');
    };
    window.addEventListener('nebula-files-applied', onFiles);
    window.addEventListener('nebula-reload-app-preview', onReload);
    window.addEventListener(NEBULA_STUDIO_SHOW_LIVE_APP, onShowLive);
    return () => {
      window.removeEventListener('nebula-files-applied', onFiles);
      window.removeEventListener('nebula-reload-app-preview', onReload);
      window.removeEventListener(NEBULA_STUDIO_SHOW_LIVE_APP, onShowLive);
    };
  }, [refreshCodedAppMeta]);

  const livePreviewUrl = useMemo(
    () => buildStudioLivePreviewUrl(livePreviewRev),
    [livePreviewRev],
  );

  const refreshV0KeyState = useCallback(async () => {
    try {
      const r = await fetch('/api/config', { headers: getV0RequestHeaders() });
      const cfg = (await r.json()) as { hasV0ApiKey?: boolean };
      const localKey = hasLocalV0ApiKey();
      const serverOk = Boolean(cfg.hasV0ApiKey);
      setV0ServerReady(serverOk);
      setHasV0ApiKey(serverOk || localKey);
      await loadStudioStatus();
    } catch {
      setHasV0ApiKey(hasLocalV0ApiKey());
      setV0ServerReady(false);
    }
  }, [loadStudioStatus]);

  useEffect(() => {
    void refreshV0KeyState();
    const onStorage = (ev: StorageEvent) => {
      if (ev.key === NEBULLA_V0_KEY_STORAGE) void refreshV0KeyState();
    };
    const onKeyUpdated = () => void refreshV0KeyState();
    window.addEventListener('storage', onStorage);
    window.addEventListener('nebula-v0-key-updated', onKeyUpdated);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('nebula-v0-key-updated', onKeyUpdated);
    };
  }, [refreshV0KeyState]);

  const loadEnginePreview = useCallback(async () => {
    try {
      const r = await fetch(withProjectQuery('/api/ui-studio-beta/preview'), {
        credentials: 'include',
        headers: getGrokRequestHeaders(),
      });
      if (!r.ok) return;
      const d = (await r.json()) as {
        model?: EditorModel | null;
        source?: string;
        user_visible_stage?: string;
        regeneration_count?: number;
        max_regenerations?: number;
        final_status?: string;
        recovery_path?: string;
        patternMode?: 'seed' | 'figma' | 'catalog';
        quality_gate_result?: string;
        preview_applied?: boolean;
        figma_status?: string;
        figma_error?: string;
        figma_fallback_used?: boolean;
        env_guidance?: string;
        resource_match?: {
          id?: string;
          score?: number;
          max_score?: number;
          selection_mode?: string;
          template_id?: string;
        };
        design_brief_summary?: { density?: string; personality?: string[] };
      };
      if (typeof d.regeneration_count === 'number') setRegenCount(d.regeneration_count);
      if (typeof d.max_regenerations === 'number') setMaxRegens(d.max_regenerations);
      if (
        (d.regeneration_count || 0) >= (d.max_regenerations || 3) &&
        (d.regeneration_count || 0) > 0 &&
        d.recovery_path &&
        d.recovery_path !== 'none'
      ) {
        setPreferenceRecovery(true);
      }
      if (d.user_visible_stage) setEngineStage(d.user_visible_stage);
      if (d.patternMode) setPatternMode(d.patternMode);
      else if (d.figma_fallback_used) setPatternMode('seed');
      if (d.quality_gate_result) setLastGate(d.quality_gate_result);
      if (typeof d.figma_status === 'string') setFigmaStatus(d.figma_status);
      if (typeof d.figma_error === 'string') setFigmaError(d.figma_error);
      if (typeof d.env_guidance === 'string') setFigmaEnvGuidance(d.env_guidance);
      if (d.resource_match?.selection_mode) {
        const rm = d.resource_match;
        const score =
          typeof rm.score === 'number' && typeof rm.max_score === 'number'
            ? `${rm.score}/${rm.max_score}`
            : '';
        setResourceMatchLabel(
          rm.selection_mode === 'scored_match' && rm.id
            ? `Match ${rm.id}${score ? ` · ${score}` : ''}`
            : rm.selection_mode === 'below_threshold'
              ? 'Match low confidence'
              : rm.selection_mode === 'no_candidates'
                ? 'No catalog match'
                : '',
        );
        setResourceMatchTitle(
          [
            rm.id && `id=${rm.id}`,
            score && `score=${score}`,
            rm.selection_mode && `mode=${rm.selection_mode}`,
            rm.template_id && `template=${rm.template_id}`,
            d.design_brief_summary?.density && `density=${d.design_brief_summary.density}`,
            d.design_brief_summary?.personality?.length &&
              `personality=${d.design_brief_summary.personality.join(',')}`,
          ]
            .filter(Boolean)
            .join(' · '),
        );
      }
      if (d.preview_applied === true) setPreviewSynced(true);
      if (d.model?.pages && !isNebullaIdePlaceholderShell(d.model)) {
        applyEditorModel(
          d.model,
          setModel,
          setActivePage,
          baselineRef,
          Object.keys(d.model.pages)[0],
        );
        setHasEnginePreview(true);
        setPreviewSurface('visual-model');
        if (!d.user_visible_stage) setEngineStage('Ready in preview');
        return;
      }
      setHasEnginePreview(false);
      if (d.user_visible_stage && /Reading|Preparing|Selecting|Generating|Validating|Classifying|Choosing|Fetching|Applying|Mapping|Rendering/i.test(d.user_visible_stage)) {
        const waiting = buildWaitingModel(d.user_visible_stage);
        setModel(waiting);
        baselineRef.current = cloneModel(waiting);
        setEngineStage(d.user_visible_stage);
      } else {
        const waiting = buildWaitingModel();
        setModel(waiting);
        baselineRef.current = cloneModel(waiting);
      }
    } catch {
      /* keep current model */
    }
  }, []);

  // Load engine preview immediately — do not wait on visual-ui-editor eligibility (v0 gate).
  useEffect(() => {
    void loadEnginePreview();
  }, [loadEnginePreview]);

  // Phase 7.4: if meta claimed ready but Studio is still Waiting → clear false success + one Generate.
  const mockupRepairAttemptedRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (mockupRepairAttemptedRef.current) return;
      try {
        await loadEnginePreview();
        if (cancelled) return;
        const prevR = await fetch(withProjectQuery('/api/ui-studio-beta/preview'), {
          credentials: 'include',
          headers: getGrokRequestHeaders(),
          cache: 'no-store',
        });
        if (!prevR.ok || cancelled) return;
        const prev = (await prevR.json()) as {
          model?: { pages?: Record<string, unknown> } | null;
          has_loadable_model?: boolean;
          quality_gate_result?: string;
          preview_applied?: boolean;
        };
        const loadable =
          prev.has_loadable_model === true || isLoadableStudioModel(prev.model);
        if (loadable) {
          // Connect Studio → App Preview when model exists but index.html still scaffold.
          if (!prev.preview_applied) {
            const gate = String(prev.quality_gate_result || '').toLowerCase();
            if (gate === 'pass' || gate === 'repair') {
              const apply = await fetch(withProjectQuery('/api/ui-studio-beta/apply-preview'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getGrokRequestHeaders() },
                credentials: 'include',
                body: JSON.stringify(withProjectBody({})),
              });
              if (apply.ok && !cancelled) {
                setPreviewSynced(true);
                window.dispatchEvent(new CustomEvent('nebula-reload-app-preview'));
              }
            }
          }
          return;
        }
        // False success path: Waiting canvas + stale flags/meta.
        // regenerate:false — empty repair must not burn regen budget into preference recovery.
        mockupRepairAttemptedRef.current = true;
        clearUiMockupStageFlags();
        setPreferenceRecovery(false);
        setRegenCount(0);
        setError('');
        setEngineStage('Recovering empty mockup — seed generate');
        window.dispatchEvent(
          new CustomEvent('nebula-ui-studio-beta-run', {
            detail: {
              autoTriggered: true,
              regenerate: false,
              projectName: getBrowserProjectName(),
            },
          }),
        );
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadEnginePreview]);

  useEffect(() => {
    const onRefresh = () => void loadEnginePreview();
    window.addEventListener('nebula-files-applied', onRefresh);
    window.addEventListener('nebula-ui-studio-beta-complete', onRefresh);
    return () => {
      window.removeEventListener('nebula-files-applied', onRefresh);
      window.removeEventListener('nebula-ui-studio-beta-complete', onRefresh);
    };
  }, [loadEnginePreview]);

  const updateSelectedStyle = (patch: Partial<VisualStyle>) => {
    if (!selectedId || !page) return;
    pushUndo();
    setModel((m) => {
      const next = cloneModel(m);
      const n = next.pages[activePage].nodes[selectedId];
      if (!n) return m;
      n.style = { ...n.style, ...patch };
      return next;
    });
  };

  const updateSelectedText = (text: string) => {
    if (!selectedId || !page) return;
    pushUndo();
    setModel((m) => {
      const next = cloneModel(m);
      const n = next.pages[activePage].nodes[selectedId];
      if (!n) return m;
      n.text = text;
      return next;
    });
  };

  const applySimilarAllPages = () => {
    if (!selected) return;
    pushUndo();
    const r = selected.role;
    const sStyle = { ...selected.style };
    setModel((m) => {
      const next = cloneModel(m);
      for (const pid of Object.keys(next.pages)) {
        const pg = next.pages[pid];
        for (const node of Object.values(pg.nodes)) {
          if (node.id === selected.id) continue;
          if (node.role === r) node.style = { ...node.style, ...sStyle };
        }
      }
      return next;
    });
  };

  const sessionUndo = () => {
    setUndoStack((s) => {
      if (s.length === 0) return s;
      const prev = s[s.length - 1];
      setModel(prev);
      return s.slice(0, -1);
    });
  };

  const moveSelectedInParent = (dir: -1 | 1) => {
    if (!selectedId || !page) return;
    const parent = Object.values(page.nodes).find((n) => n.children?.includes(selectedId));
    if (!parent || !parent.children) return;
    const idx = parent.children.indexOf(selectedId);
    const j = idx + dir;
    if (j < 0 || j >= parent.children.length) return;
    pushUndo();
    setModel((m) => {
      const next = cloneModel(m);
      const p = next.pages[activePage].nodes[parent.id];
      if (!p?.children) return m;
      const ch = [...p.children];
      [ch[idx], ch[j]] = [ch[j], ch[idx]];
      p.children = ch;
      return next;
    });
  };

  const collectSubtreeIds = (pg: PageModel, rootId: string, acc: Set<string>) => {
    acc.add(rootId);
    const n = pg.nodes[rootId];
    if (!n?.children) return;
    for (const c of n.children) collectSubtreeIds(pg, c, acc);
  };

  const deleteSelectedNode = () => {
    if (!selectedId || !page || selectedId === page.rootId) return;
    pushUndo();
    setModel((m) => {
      const next = cloneModel(m);
      const pg = next.pages[activePage];
      const toRemove = new Set<string>();
      collectSubtreeIds(pg, selectedId, toRemove);
      const parent = Object.values(pg.nodes).find((n) => n.children?.includes(selectedId));
      if (parent?.children) {
        parent.children = parent.children.filter((id) => id !== selectedId);
      }
      for (const rid of toRemove) delete pg.nodes[rid];
      return next;
    });
    clearSelection();
  };

  const onPreviewClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedId(id);
  };

  const clearSelection = () => {
    setSelectedId(null);
  };

  const runEngineGenerate = async (opts?: {
    regenerate?: boolean;
    preferenceFeedback?: string;
    guidedImprovement?: boolean;
    autoTriggered?: boolean;
    writtenPaths?: string[];
    uiPhase?: 'pre_code' | 'post_code' | 'manual';
    preferenceHints?: {
      denser?: boolean;
      looser?: boolean;
      moreSections?: boolean;
      strongerCta?: boolean;
      moreContrast?: boolean;
    };
  }) => {
    setBusy(true);
    setError('');
    setPreferenceRecovery(false);
    setPreviewSynced(false);
    try {
      const st = await fetch(withProjectQuery('/api/master-plan/status'), {
        credentials: 'include',
        cache: 'no-store',
      });
      if (st.ok) {
        const body = (await st.json()) as { uiBriefLength?: number };
        if (typeof body.uiBriefLength === 'number' && body.uiBriefLength < 80) {
          setBusy(false);
          setError(
            'Finish Master Plan pages (§4) and UI/UX (§5), save so ui-brief.md exists, then Generate UI.',
          );
          setEngineStage('Needs Master Plan §4+§5');
          return;
        }
      }
    } catch {
      /* continue to generate — server will soft-fail if needed */
    }
    setEngineStage(
      opts?.regenerate
        ? 'Generate again…'
        : opts?.uiPhase === 'post_code'
          ? 'Post-code UI refresh…'
          : opts?.uiPhase === 'pre_code'
            ? 'Pre-code mockup…'
            : opts?.autoTriggered
              ? 'Reading Master Plan'
              : 'Reading Master Plan',
    );
    const poll = window.setInterval(() => {
      void fetch(withProjectQuery('/api/ui-studio-beta/status'), { credentials: 'include' })
        .then((r) => r.json())
        .then((st: { user_visible_stage?: string; regeneration_count?: number; max_regenerations?: number }) => {
          if (st.user_visible_stage) setEngineStage(st.user_visible_stage);
          if (typeof st.regeneration_count === 'number') setRegenCount(st.regeneration_count);
          if (typeof st.max_regenerations === 'number') setMaxRegens(st.max_regenerations);
        })
        .catch(() => undefined);
    }, 1000);
    try {
      const r = await fetch(withProjectQuery('/api/ui-studio-beta/generate'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getGrokRequestHeaders(),
        },
        credentials: 'include',
        body: JSON.stringify(
          withProjectBody({
            projectName: projectLabel,
            pageName: activePage !== 'Home' ? activePage : undefined,
            regenerate: opts?.regenerate === true,
            autoTriggered: opts?.autoTriggered === true,
            preferenceFeedback: opts?.preferenceFeedback,
            guidedImprovement: opts?.guidedImprovement === true,
            writtenPaths: opts?.writtenPaths,
            uiPhase: opts?.uiPhase,
            preferenceHints: opts?.preferenceHints || undefined,
          }),
        ),
      });
      const data = (await r.json()) as {
        ok?: boolean;
        error?: string;
        editorModel?: EditorModel;
        generatedCode?: string;
        preference_recovery?: boolean;
        preference_recovery_question?: string;
        regeneration_count?: number;
        max_regenerations?: number;
        user_visible_stage?: string;
        previewApplied?: boolean;
        patternMode?: 'seed' | 'figma' | 'catalog';
        quality_gate_result?: string;
        figma_fallback_used?: boolean;
        env_guidance?: string;
        resource_match?: {
          id?: string;
          score?: number;
          max_score?: number;
          selection_mode?: string;
          template_id?: string;
        };
        design_brief_summary?: { density?: string; personality?: string[] };
        context?: {
          page_name?: string;
          quality_gate_result?: string;
          figma_used?: string;
          figma_status?: string;
          figma_error?: string;
          fallback_used?: string;
          env_guidance?: string;
          resource_match?: {
            id?: string;
            score?: number;
            max_score?: number;
            selection_mode?: string;
            template_id?: string;
          };
          design_brief_summary?: { density?: string; personality?: string[] };
        };
      };
      if (typeof data.regeneration_count === 'number') setRegenCount(data.regeneration_count);
      if (typeof data.max_regenerations === 'number') setMaxRegens(data.max_regenerations);
      if (data.user_visible_stage) setEngineStage(data.user_visible_stage);
      if (data.patternMode) setPatternMode(data.patternMode);
      else if (data.figma_fallback_used) setPatternMode('seed');
      const gate = data.quality_gate_result || data.context?.quality_gate_result || '';
      if (gate) setLastGate(gate);
      if (typeof data.context?.figma_status === 'string') setFigmaStatus(data.context.figma_status);
      if (typeof data.context?.figma_error === 'string') setFigmaError(data.context.figma_error);
      const guidance = data.env_guidance || data.context?.env_guidance;
      if (typeof guidance === 'string') setFigmaEnvGuidance(guidance);
      if (data.context?.fallback_used === 'yes' && !data.patternMode) setPatternMode('seed');
      {
        const rm = data.resource_match || data.context?.resource_match;
        const brief = data.design_brief_summary || data.context?.design_brief_summary;
        if (rm?.selection_mode) {
          const score =
            typeof rm.score === 'number' && typeof rm.max_score === 'number'
              ? `${rm.score}/${rm.max_score}`
              : '';
          setResourceMatchLabel(
            rm.selection_mode === 'scored_match' && rm.id
              ? `Match ${rm.id}${score ? ` · ${score}` : ''}`
              : rm.selection_mode === 'below_threshold'
                ? 'Match low confidence'
                : rm.selection_mode === 'no_candidates'
                  ? 'No catalog match'
                  : '',
          );
          setResourceMatchTitle(
            [
              rm.id && `id=${rm.id}`,
              score && `score=${score}`,
              rm.selection_mode && `mode=${rm.selection_mode}`,
              rm.template_id && `template=${rm.template_id}`,
              brief?.density && `density=${brief.density}`,
              brief?.personality?.length && `personality=${brief.personality.join(',')}`,
            ]
              .filter(Boolean)
              .join(' · '),
          );
        }
      }
      if (data.preference_recovery) {
        setPreferenceRecovery(true);
        setPreferenceQuestion(
          data.preference_recovery_question ||
            t('uiStudio.generationsExhausted', { max: data.max_regenerations || maxRegens }),
        );
        setError('');
        setEngineStage(data.user_visible_stage || 'Preference recovery needed');
        // Keep last mockup — exhausted Generate again must not wipe the canvas.
        window.dispatchEvent(
          new CustomEvent('nebula-ui-studio-beta-complete', {
            detail: {
              ok: false,
              preference_recovery: true,
              preference_recovery_question: data.preference_recovery_question,
              error: data.error,
              regeneration_count: data.regeneration_count,
              max_regenerations: data.max_regenerations,
            },
          }),
        );
        return;
      }
      if (!r.ok || !data.ok) {
        const errMsg =
          gate === 'weak'
            ? weakGateUserMessage()
            : data.error || 'UI Generation Engine failed';
        setError(errMsg);
        setEngineStage(
          data.user_visible_stage ||
            (gate === 'weak' ? weakGateUserMessage() : 'Finish Master Plan §4+§5, then Generate UI'),
        );
        setHasEnginePreview(false);
        setPreviewSynced(false);
        setPreviewSurface('visual-model');
        if (data.editorModel?.pages && !isNebullaIdePlaceholderShell(data.editorModel)) {
          applyEditorModel(data.editorModel, setModel, setActivePage, baselineRef);
        } else {
          const waiting = buildWaitingModel(errMsg);
          setModel(waiting);
          baselineRef.current = cloneModel(waiting);
          await loadEnginePreview();
        }
        window.dispatchEvent(
          new CustomEvent('nebula-ui-studio-beta-complete', {
            detail: {
              ok: false,
              error: errMsg,
              user_visible_stage: data.user_visible_stage,
              quality_gate_result: gate || undefined,
              patternMode: data.patternMode,
            },
          }),
        );
        return;
      }
      const deliveredStage =
        data.user_visible_stage ||
        (gate === 'weak'
          ? 'Weak quality — try Generate again'
          : gate === 'repair'
            ? 'Preview ready — quality repair applied'
            : 'Ready in preview');
      const qualityOk = gate === 'pass' || gate === 'repair' || (!gate && data.ok);
      if (data.editorModel?.pages && !isNebullaIdePlaceholderShell(data.editorModel)) {
        applyEditorModel(
          data.editorModel,
          setModel,
          setActivePage,
          baselineRef,
          data.context?.page_name,
        );
        clearSelection();
        setPreviewSurface('visual-model');
        setHasEnginePreview(qualityOk);
        setEngineStage(deliveredStage);
        if (gate === 'weak') {
          setError(
            'Quality gate: weak skeleton — labels/structure/§5 did not meet the bar. Try Generate again.',
          );
        }
        await persistModelRemote(data.editorModel);
      } else {
        setEngineStage(deliveredStage);
        await loadEnginePreview();
        setHasEnginePreview(qualityOk);
      }
      if (data.previewApplied && qualityOk) {
        setPreviewSynced(true);
        try {
          window.dispatchEvent(new CustomEvent('nebula-files-applied'));
          window.dispatchEvent(new CustomEvent('nebula-reload-app-preview'));
        } catch {
          /* ignore */
        }
      }
      setPreferenceHints({});
      window.dispatchEvent(
        new CustomEvent('nebula-ui-studio-beta-complete', {
          detail: {
            ok: qualityOk,
            error: qualityOk
              ? undefined
              : 'Quality gate: weak — not marked as successful generation',
            editorModel: data.editorModel,
            generatedCode: data.generatedCode,
            context: data.context,
            regeneration_count: data.regeneration_count,
            max_regenerations: data.max_regenerations,
            user_visible_stage: deliveredStage,
            previewApplied: data.previewApplied,
            patternMode: data.patternMode,
            quality_gate_result: gate || undefined,
          },
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'UI Generation Engine request failed');
      window.dispatchEvent(
        new CustomEvent('nebula-ui-studio-beta-complete', {
          detail: {
            ok: false,
            error: e instanceof Error ? e.message : 'UI Generation Engine request failed',
          },
        }),
      );
    } finally {
      window.clearInterval(poll);
      setBusy(false);
    }
  };

  const applyLastGenerationToPreview = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await fetch(withProjectQuery('/api/ui-studio-beta/apply-preview'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getGrokRequestHeaders() },
        credentials: 'include',
        body: JSON.stringify(withProjectBody({})),
      });
      const data = (await r.json()) as {
        ok?: boolean;
        error?: string;
        written?: string[];
        quality_gate_result?: string;
      };
      if (!r.ok || !data.ok) {
        setError(data.error || t('uiStudio.applyPreviewFailed'));
        return;
      }
      setPreviewSynced(true);
      setLastGate(data.quality_gate_result || lastGate || 'pass');
      try {
        window.dispatchEvent(new CustomEvent('nebula-files-applied'));
        window.dispatchEvent(new CustomEvent('nebula-reload-app-preview'));
      } catch {
        /* ignore */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('uiStudio.applyPreviewFailed'));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const onRun = (ev: Event) => {
      const detail = (ev as CustomEvent<{
        autoTriggered?: boolean;
        regenerate?: boolean;
        preferenceFeedback?: string;
        guidedImprovement?: boolean;
        writtenPaths?: string[];
        uiPhase?: 'pre_code' | 'post_code' | 'manual';
      }>).detail;
      void runEngineGenerate({
        autoTriggered: detail?.autoTriggered,
        regenerate: detail?.regenerate,
        preferenceFeedback: detail?.preferenceFeedback,
        guidedImprovement: detail?.guidedImprovement,
        writtenPaths: detail?.writtenPaths,
        uiPhase: detail?.uiPhase,
      });
    };
    const onComplete = (ev: Event) => {
      const detail = (ev as CustomEvent<{
        editorModel?: EditorModel;
        context?: { page_name?: string; regeneration_count?: number; max_regenerations?: number };
        regeneration_count?: number;
        max_regenerations?: number;
        preference_recovery?: boolean;
      }>).detail;
      if (typeof detail?.regeneration_count === 'number') setRegenCount(detail.regeneration_count);
      else if (typeof detail?.context?.regeneration_count === 'number') {
        setRegenCount(detail.context.regeneration_count);
      }
      if (typeof detail?.max_regenerations === 'number') setMaxRegens(detail.max_regenerations);
      else if (typeof detail?.context?.max_regenerations === 'number') {
        setMaxRegens(detail.context.max_regenerations);
      }
      if (detail?.preference_recovery) setPreferenceRecovery(true);
      if (detail?.editorModel?.pages && !isNebullaIdePlaceholderShell(detail.editorModel)) {
        applyEditorModel(
          detail.editorModel,
          setModel,
          setActivePage,
          baselineRef,
          detail.context?.page_name,
        );
        clearSelection();
        setPreviewSurface('visual-model');
        setHasEnginePreview(true);
        setEngineStage('Ready in preview');
      }
    };
    const onBusy = (ev: Event) => {
      const detail = (ev as CustomEvent<{ busy?: boolean; regeneration_count?: number; max_regenerations?: number }>).detail;
      if (typeof detail?.busy === 'boolean') setBusy(detail.busy);
      if (typeof detail?.regeneration_count === 'number') setRegenCount(detail.regeneration_count);
      if (typeof detail?.max_regenerations === 'number') setMaxRegens(detail.max_regenerations);
    };
    window.addEventListener('nebula-ui-studio-beta-run', onRun);
    window.addEventListener('nebula-ui-studio-beta-complete', onComplete);
    window.addEventListener(NEBULA_UI_STUDIO_BETA_BUSY, onBusy);
    return () => {
      window.removeEventListener('nebula-ui-studio-beta-run', onRun);
      window.removeEventListener('nebula-ui-studio-beta-complete', onComplete);
      window.removeEventListener(NEBULA_UI_STUDIO_BETA_BUSY, onBusy);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount listener once; runEngineGenerate closes over latest state via refs if needed
  }, [projectLabel, activePage]);


  const revertVisualToBaseline = () => {
    if (!baselineRef.current) return;
    pushUndo();
    setModel(cloneModel(baselineRef.current));
    clearSelection();
  };

  const toggleFullscreen = async () => {
    const el = shellRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }
  };

  const persistModelRemote = async (modelToSave?: EditorModel) => {
    const payload = modelToSave ?? model;
    if (isNebullaIdePlaceholderShell(payload)) return;
    const clean = sanitizeModelColors(payload);
    // Beta authority path — no v0 eligibility / no visual-ui-editor 403.
    await fetch(withProjectQuery('/api/ui-studio-beta/preview'), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getGrokRequestHeaders(),
      },
      credentials: 'include',
      body: JSON.stringify(withProjectBody({ model: clean })),
    });
  };

  const ensureEligibleForApply = async (): Promise<boolean> => {
    try {
      const check = await fetch(withProjectQuery('/api/visual-ui-editor/eligibility'));
      const gate = (await check.json()) as { eligible?: boolean };
      if (check.ok && gate.eligible) {
        setEligible(true);
        setEligibilityReason(undefined);
        return true;
      }
    } catch {
      /* fall through */
    }
    try {
      const r = await fetch(withProjectQuery('/api/visual-ui-editor/unlock-from-workspace'), {
        method: 'POST',
        headers: persistHeaders(),
        body: JSON.stringify(withProjectBody({ projectName: projectLabel })),
      });
      const d = (await r.json()) as { eligible?: boolean };
      if (r.ok && d.eligible) {
        setEligible(true);
        setEligibilityReason(undefined);
        return true;
      }
    } catch {
      /* fall through */
    }
    await loadEligibility();
    return false;
  };

  const runApplyToCode = async () => {
    setBusy(true);
    setError('');
    // Engine v2 preview unlocks Save (server: hasUiGenerationV2Ready). Still try eligibility for v0 projects.
    const canApply = hasEnginePreview ? true : await ensureEligibleForApply();
    if (!canApply) {
      notifyV0(
        hasEnginePreview
          ? t('uiStudio.saveNeedsGenerate')
          : lastGate === 'weak'
            ? t('uiStudio.gateWeakPreview')
            : hasV0ApiKey
              ? 'Save needs a first v0 UI generation — wait for auto v0, or Resume in chat.'
              : 'Generate UI first (built-in patterns or Figma), or add V0_API_KEY for the legacy v0 path.',
        true,
      );
      setApplyConfirmOpen(false);
      setBusy(false);
      return;
    }
    try {
      await persistModelRemote();
      const res = await fetch(withProjectQuery('/api/visual-ui-editor/apply-visual-changes'), {
        method: 'POST',
        headers: persistHeaders(),
        body: JSON.stringify(
          withProjectBody({
            pageId: activePage,
            previewModel: model,
          }),
        ),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Apply failed');
      setError('');
      setEligible(true);
      await loadEligibility();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Apply failed');
    } finally {
      setBusy(false);
      setApplyConfirmOpen(false);
    }
  };

  const runRevert = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(withProjectQuery('/api/visual-ui-editor/revert-last-coded'), {
        method: 'POST',
        headers: persistHeaders(),
        body: JSON.stringify(withProjectBody({})),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Revert failed');
      setRevertConfirmOpen(false);
      setError('');
      try {
        await loadEnginePreview();
      } catch {
        /* keep local model */
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Revert failed');
    } finally {
      setBusy(false);
    }
  };

  const runRestoreOriginal = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(withProjectQuery('/api/visual-ui-editor/restore-original-v0'), {
        method: 'POST',
        headers: persistHeaders(),
        body: JSON.stringify(withProjectBody({})),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Restore failed');
      setRestoreOriginalConfirmOpen(false);
      setError('');
      try {
        await loadEnginePreview();
      } catch {
        /* keep local model */
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Restore failed');
    } finally {
      setBusy(false);
    }
  };

  const runV0Generation = async (opts?: { resumeOnly?: boolean }) => {
    const explicitResume = opts?.resumeOnly === true;
    if (busy && !explicitResume) {
      notifyV0('v0 already running — use Cancel in chat to stop, or Resume to poll the same chat.');
      return;
    }
    v0RunningRef.current = true;
    setBusy(true);
    setError('');
    try {
      // If there was a previous start error, clear it automatically so the user can retry
      if (studioStatus?.v0StartError) {
        try {
          const clearRes = await fetch(withProjectQuery('/api/nebula-ui-studio/v0-clear'), {
            method: 'POST',
            headers: persistHeaders(),
            body: JSON.stringify(withProjectBody({})),
          });
          if (!clearRes.ok) {
            const clearBody = (await clearRes.json().catch(() => ({}))) as { error?: string };
            throw new Error(clearBody.error || `v0 clear failed (${clearRes.status})`);
          }
          await loadStudioStatus();
        } catch (clearErr) {
          setError(clearErr instanceof Error ? clearErr.message : 'Failed to clear previous v0 error');
          return;
        }
      }

      try {
        await runMasterPlanUiPipeline({ projectName: projectLabel, autoV0: false });
      } catch {
        /* status endpoint also syncs v0-prompt */
      }
      const freshStatus = (await loadStudioStatus()) ?? studioStatus;
      const preflight = computeV0Readiness({
        hasV0ApiKey,
        hasLocalV0ApiKey: hasLocalV0ApiKey(),
        v0ServerReady,
        v0PromptExists: freshStatus?.v0PromptExists,
        v0PromptLength: freshStatus?.v0PromptLength,
        v0Starting: freshStatus?.v0Starting,
        v0PendingChatId: freshStatus?.v0PendingChatId,
        v0StartError: freshStatus?.v0StartError,
        hasRealV0: freshStatus?.hasRealV0,
      });
      // Allow retry if the only blocker is a previous start error (we cleared it above)
      const hasStartErrorBlock = !preflight.ready && freshStatus?.v0StartError;
      if (!explicitResume && !preflight.ready && !hasStartErrorBlock) {
        notifyV0(preflight.blockReason ?? 'v0 is not ready yet.', true);
        return;
      }
      if (explicitResume && !preflight.ready && !preflight.resumeOnly && !freshStatus?.v0PendingChatId?.trim()) {
        notifyV0('No v0 session to resume — Clear in chat, then wait for auto v0.', true);
        return;
      }

      const hasAnyV0Key = hasV0ApiKey === true || hasLocalV0ApiKey() || v0ServerReady === true;
      if (!hasAnyV0Key) {
        try {
          const fb = await fetch(withProjectQuery('/api/nebula-ui-studio/basic-scaffold'), {
            method: 'POST',
            headers: persistHeaders(),
            body: JSON.stringify(withProjectBody({ projectDisplayName: projectLabel })),
          });
          const fbData = (await fb.json()) as { written?: string[]; hint?: string };
          if (fb.ok && (fbData.written?.length ?? 0) > 0) {
            window.dispatchEvent(new CustomEvent('nebula-files-applied'));
            window.dispatchEvent(new CustomEvent('nebula-open-app-preview'));
            notifyV0(
              fbData.hint ||
                `No V0_API_KEY — Nebula wrote a basic HTML preview (${fbData.written!.join(', ')}).`,
            );
            await loadEligibility();
            return;
          }
        } catch {
          /* fall through */
        }
        notifyV0(formatV0UiError('not set on the server and no client key was sent', false), true);
        return;
      }

      const data = await runV0GenerationWithPolling({
        projectDisplayName: projectLabel,
        resumeOnly: explicitResume && preflight.resumeOnly,
        onProgress: (msg, kind) => {
          notifyV0(msg, kind === 'error');
        },
      });
      if (data.error && !data.written?.length) {
        if (/cancelled/i.test(data.error)) {
          notifyV0(data.hint || data.error);
          return;
        }
        throw new Error(data.hint || data.error);
      }
      if (data.source === 'basic-scaffold') {
        window.dispatchEvent(new CustomEvent('nebula-files-applied'));
        window.dispatchEvent(new CustomEvent('nebula-open-app-preview'));
        notifyV0(data.hint || 'Basic UI preview shell written (V0 credits unavailable).');
        await loadEligibility();
        return;
      }
      if (typeof data.chatId === 'string') {
        setV0ChatId(data.chatId);
        try {
          sessionStorage.setItem(v0StorageKey, data.chatId);
        } catch {
          /* ignore */
        }
      }
      if (typeof data.demoUrl === 'string' && data.demoUrl.trim()) {
        setV0DemoUrl(data.demoUrl.trim());
        setPreviewSurface('v0-live');
        window.dispatchEvent(
          new CustomEvent('nebula-v0-demo-ready', { detail: { demoUrl: data.demoUrl.trim() } }),
        );
      }
      try {
        window.dispatchEvent(new CustomEvent('nebula-files-applied'));
      } catch {
        /* ignore */
      }
      const n = data.written?.length ?? 0;
      notifyV0(
        n > 0
          ? `v0 wrote ${n} file(s). Live v0 preview is shown in UI Studio when available.`
          : 'v0 generation finished.',
      );
      emitChatV0Watch(false);
      await loadEligibility();
      window.dispatchEvent(new CustomEvent('nebula-ui-studio-v0-complete'));
      window.dispatchEvent(new CustomEvent('nebula-open-app-preview'));
    } catch (e: unknown) {
      const msg =
        e instanceof Error && e.name === 'AbortError'
          ? 'v0 request timed out (6 min). v0-pro can be slow — try Resume in chat or use a shorter prompt.'
          : e instanceof Error
            ? e.message
            : 'v0 generation failed';
      const creditsLike = /credit|quota|billing/i.test(msg);
      if (creditsLike || msg.includes('V0 unavailable')) {
        try {
          const fb = await fetch(withProjectQuery('/api/nebula-ui-studio/basic-scaffold'), {
            method: 'POST',
            headers: persistHeaders(),
            body: JSON.stringify(withProjectBody({ projectDisplayName: projectLabel })),
          });
          const fbData = (await fb.json()) as { written?: string[] };
          if (fb.ok && (fbData.written?.length ?? 0) > 0) {
            window.dispatchEvent(new CustomEvent('nebula-files-applied'));
            window.dispatchEvent(new CustomEvent('nebula-open-app-preview'));
            notifyV0(
              `V0 unavailable — Nebula applied a basic HTML preview (${fbData.written!.join(', ')}). Open Preview in the explorer.`,
            );
            await loadEligibility();
            return;
          }
        } catch {
          /* fall through */
        }
      }
      notifyV0(formatV0UiError(msg, hasLocalV0ApiKey()), true);
      resumeV0StartedRef.current = false;
    } finally {
      v0RunningRef.current = false;
      setBusy(false);
      await loadStudioStatus();
    }
  };

  runV0GenerationRef.current = runV0Generation;

  const runV0Refine = async () => {
    if (!v0ChatId) {
      setError('Run “Generate UI with v0” first so a v0 chat session exists.');
      return;
    }
    const message = window.prompt('Describe how to refine the v0 UI (e.g. darker theme, add sidebar):');
    if (!message?.trim()) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(withProjectQuery('/api/nebula-ui-studio/v0-update'), {
        method: 'POST',
        headers: persistHeaders(),
        body: JSON.stringify(
          withProjectBody({
            chatId: v0ChatId,
            message: message.trim(),
            projectDisplayName: projectLabel,
          }),
        ),
      });
      const data = (await res.json()) as {
        error?: string;
        hint?: string;
        chatId?: string;
        written?: string[];
      };
      if (!res.ok) throw new Error(data.hint || data.error || 'v0 update failed');
      if (typeof data.chatId === 'string') {
        setV0ChatId(data.chatId);
        try {
          sessionStorage.setItem(v0StorageKey, data.chatId);
        } catch {
          /* ignore */
        }
      }
      const n = data.written?.length ?? 0;
      notifyV0(n > 0 ? `v0 refined ${n} file(s) in the workspace.` : 'v0 refine finished.');
      await loadEligibility();
      try {
        window.dispatchEvent(new CustomEvent('nebula-files-applied'));
      } catch {
        /* ignore */
      }
    } catch (e: unknown) {
      notifyV0(e instanceof Error ? e.message : 'v0 refine failed', true);
    } finally {
      setBusy(false);
    }
  };

  const simulateV0CompleteDev = async () => {
    if (!import.meta.env.DEV) return;
    setBusy(true);
    try {
      await fetch(withProjectQuery('/api/visual-ui-editor/v0-first-generation-complete'), {
        method: 'POST',
        headers: persistHeaders(),
        body: JSON.stringify(
          withProjectBody({
            projectDisplayName: projectLabel,
            files: { 'README.txt': 'v0 base placeholder from dev unlock\n' },
            source: 'ide-dev-simulate',
          }),
        ),
      });
      await loadEligibility();
    } finally {
      setBusy(false);
    }
  };

  const renderNode = (id: string): React.ReactNode => {
    if (!page) return null;
    const node = page.nodes[id];
    if (!node) return null;
    const st = { ...defaultStyle(), ...node.style };
    const isSelected = selectedId === id;
    const borderW = st.borderWidth ?? 0;
    const css: React.CSSProperties = {
      backgroundColor: st.backgroundColor,
      color: st.color,
      padding: `${st.paddingTop}px ${st.paddingRight}px ${st.paddingBottom}px ${st.paddingLeft}px`,
      margin: `${st.marginTop}px ${st.marginRight}px ${st.marginBottom}px ${st.marginLeft}px`,
      width: st.width as React.CSSProperties['width'],
      height: st.height as React.CSSProperties['height'],
      borderRadius: st.borderRadius,
      opacity: st.opacity,
      cursor: 'pointer',
      position: 'relative',
      borderWidth: borderW,
      borderStyle: borderW > 0 ? 'solid' : 'none',
      borderColor: st.borderColor && !/^transparent$/i.test(st.borderColor) ? st.borderColor : '#e5e5e5',
      boxShadow: st.boxShadow || undefined,
      outline: isSelected ? '2px solid #3b82f6' : 'none',
      outlineOffset: isSelected ? 2 : undefined,
      zIndex: isSelected ? 2 : undefined,
    };

    const inner =
      node.type === 'text' ? (
        <span className="inline-block min-h-[1.25em]">{node.text || 'Text'}</span>
      ) : node.type === 'button' ? (
        <button
          type="button"
          className="pointer-events-none font-medium"
          tabIndex={-1}
          style={{ backgroundColor: 'transparent', color: 'inherit', border: 'none' }}
        >
          {node.text || 'Button'}
        </button>
      ) : node.type === 'box' ? (
        <div
          className="h-full min-h-[48px] w-full rounded-md bg-[#111111]"
          aria-hidden
        />
      ) : null;

    const isRoot = node.id === page.rootId;
    const firstChildId = node.children?.[0];
    const firstChild = firstChildId ? page.nodes[firstChildId] : undefined;
    // Only use horizontal shell when root truly has a sidebar + main column.
    const isSidebarShell =
      isRoot &&
      Boolean(
        firstChild &&
          (firstChild.role === 'nav-sidebar' ||
            firstChild.id === 'sidebar' ||
            /sidebar/i.test(firstChild.role)),
      );
    const isHorizontalRow =
      node.role === 'metrics-row' ||
      node.role === 'bottom_tabs' ||
      node.role === 'cta-row' ||
      node.role === 'cta-row-actions';
    const rowClass = isHorizontalRow
      ? 'flex w-full flex-row flex-wrap items-stretch justify-between gap-2'
      : isSidebarShell
        ? 'flex min-h-[200px] w-full flex-1 flex-row items-stretch gap-0'
        : 'flex w-full flex-col gap-3';
    const kids = node.children?.length ? (
      <div className={rowClass}>
        {node.children.map((cid, i) => (
          <div
            key={cid}
            className={
              isSidebarShell
                ? i === 0
                  ? 'w-[200px] shrink-0 self-stretch'
                  : 'min-w-0 flex-1 self-stretch'
                : isHorizontalRow
                  ? 'min-w-0 flex-1'
                  : 'w-full min-w-0'
            }
          >
            {renderNode(cid)}
          </div>
        ))}
      </div>
    ) : null;

    return (
      <div
        key={id}
        role="button"
        tabIndex={0}
        data-node-id={id}
        style={css}
        onClick={(e) => onPreviewClick(e, id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            setSelectedId(id);
          }
        }}
        className={
          isRoot && node.type === 'container'
            ? 'flex min-h-[420px] w-full flex-col'
            : node.type === 'container'
              ? 'flex w-full flex-col'
              : ''
        }
      >
        {inner}
        {kids}
      </div>
    );
  };

  if (eligible === null) {
    return (
      <div className="flex h-full items-center justify-center bg-black text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const layerCount = page ? Object.keys(page.nodes).length : 0;
  const atMaxRegens = regenCount >= maxRegens && regenCount > 0;
  const generateDisabled = busy || preferenceRecovery || atMaxRegens;
  const generateTitle = atMaxRegens
    ? t('uiStudio.generationsExhausted', { max: maxRegens })
    : t('uiStudio.generateTitle');

  return (
    <div
      ref={shellRef}
      className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background text-foreground"
    >
      <header className="surface-active shrink-0 border-b border-border">
        {error ? (
          <p className="border-b border-rose-500/25 bg-rose-500/10 px-3 py-1.5 text-[11px] text-rose-100" role="alert">
            {error}
          </p>
        ) : null}
        {atMaxRegens && !preferenceRecovery ? (
          <p className="border-b border-border bg-card px-3 py-1.5 text-[11px] text-muted-foreground">
            {t('uiStudio.generationsExhausted', { max: maxRegens })}
          </p>
        ) : null}
        {preferenceRecovery ? (
          <div className="border-b border-border bg-card px-3 py-2">
            <p className="text-[11px] text-foreground whitespace-pre-wrap">
              {atMaxRegens
                ? t('uiStudio.generationsExhausted', { max: maxRegens })
                : preferenceQuestion}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(
                [
                  { key: 'denser' as const, label: t('uiStudio.hint.denser') },
                  { key: 'looser' as const, label: t('uiStudio.hint.looser') },
                  { key: 'moreSections' as const, label: t('uiStudio.hint.moreSections') },
                  { key: 'strongerCta' as const, label: t('uiStudio.hint.strongerCta') },
                  { key: 'moreContrast' as const, label: t('uiStudio.hint.moreContrast') },
                ] as const
              ).map((chip) => {
                const on = Boolean(preferenceHints[chip.key]);
                return (
                  <button
                    key={chip.key}
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      setPreferenceHints((prev) => ({
                        ...prev,
                        [chip.key]: !prev[chip.key],
                      }))
                    }
                    className={cn(
                      'rounded-md border px-2 py-0.5 text-[10px]',
                      on
                        ? 'border-primary/50 bg-primary/15 text-primary'
                        : 'border-border text-muted-foreground hover:bg-secondary/50',
                    )}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={preferenceDraft}
                onChange={(e) => setPreferenceDraft(e.target.value)}
                placeholder={t('uiStudio.preferencePlaceholder')}
                className="min-w-[180px] flex-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] text-foreground"
              />
              <button
                type="button"
                disabled={
                  busy ||
                  (!preferenceDraft.trim() && !Object.values(preferenceHints).some(Boolean))
                }
                onClick={() => {
                  const feedback = preferenceDraft.trim();
                  setPreferenceDraft('');
                  void runEngineGenerate({
                    preferenceFeedback: feedback || 'Structured preference chips',
                    guidedImprovement: true,
                    preferenceHints,
                  });
                }}
                className="btn-cyan rounded-md px-2 py-1 text-[10px] disabled:opacity-40"
              >
                {t('uiStudio.guidedImprovement')}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setPreferenceRecovery(false);
                  setError(t('uiStudio.manualRefineHint'));
                  setEngineStage('Manual refinement');
                }}
                className="rounded-md border border-border px-2 py-1 text-[10px] text-foreground"
              >
                {t('uiStudio.manualProperties')}
              </button>
            </div>
          </div>
        ) : null}
        <div className="flex h-9 items-center justify-between gap-2 px-2 sm:px-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-xs font-medium tracking-wide text-foreground">
              {t('ide.pane.ui-studio-beta')}
            </span>
            <span
              className={cn(
                'hidden rounded-full px-2 py-0.5 text-[10px] font-medium sm:inline',
                eligible
                  ? 'bg-[#111111] text-foreground/70'
                  : 'bg-secondary text-muted-foreground',
              )}
            >
              {hasEnginePreview
                ? t('uiStudio.enginePreview')
                : busy
                  ? t('uiStudio.generating')
                  : t('uiStudio.waiting')}
            </span>
            {patternMode === 'seed' || (!patternMode && hasEnginePreview) ? (
              <span
                className="hidden max-w-[140px] truncate rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground md:inline"
                title={t('uiStudio.usingBuiltInPatterns')}
              >
                {t('uiStudio.usingBuiltInPatterns')}
              </span>
            ) : patternMode === 'figma' ? (
              <span className="hidden rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground md:inline">
                {t('uiStudio.usingFigmaRefs')}
              </span>
            ) : patternMode === 'catalog' ? (
              <span className="hidden rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground md:inline">
                Sheet catalog
              </span>
            ) : null}
            {figmaStatus ? (
              <span
                className={cn(
                  'hidden max-w-[220px] truncate rounded-full px-2 py-0.5 text-[10px] font-medium sm:inline',
                  figmaStatus === 'success' || figmaStatus === 'offline'
                    ? 'bg-emerald-500/15 text-emerald-200'
                    : figmaStatusIsSoftFallback(figmaStatus)
                      ? 'bg-amber-500/15 text-amber-100'
                      : 'bg-muted/40 text-muted-foreground',
                )}
                title={
                  [figmaError, figmaEnvGuidance].filter(Boolean).join(' — ') ||
                  figmaStatusLabel(figmaStatus)
                }
              >
                {figmaStatusLabel(figmaStatus)}
              </span>
            ) : null}
            {lastGate ? (
              <span
                className={cn(
                  'hidden rounded-full px-2 py-0.5 text-[10px] font-medium sm:inline',
                  lastGate === 'pass'
                    ? 'bg-emerald-500/15 text-emerald-200'
                    : lastGate === 'repair'
                      ? 'bg-amber-500/15 text-amber-100'
                      : 'bg-rose-500/15 text-rose-100',
                )}
                title={
                  lastGate === 'weak'
                    ? t('uiStudio.gateWeakPreview')
                    : gateLabel(lastGate)
                }
              >
                {gateLabel(lastGate)}
              </span>
            ) : null}
            {resourceMatchLabel ? (
              <span
                className="hidden max-w-[200px] truncate rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground lg:inline"
                title={resourceMatchTitle || resourceMatchLabel}
              >
                {resourceMatchLabel}
              </span>
            ) : null}
            {codedAppLive ? (
              <span
                className="hidden max-w-[200px] truncate rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-medium text-sky-100 sm:inline"
                title={
                  previewStatusLabel ||
                  'Coded product UI owns App Preview. Studio visual model is editable mockup — use Live app toggle to see Spark.'
                }
              >
                Live → App Preview
              </span>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {engineStage ? (
              <span
                className="hidden max-w-[160px] truncate text-[10px] md:max-w-[220px] sm:inline"
                style={{ color: 'var(--subtitle)' }}
                title={engineStage}
              >
                {busy ? <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> : null}
                {engineStage}
              </span>
            ) : null}
            <span
              className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground"
              title={generateTitle}
            >
              {regenCount}/{maxRegens}
            </span>
            <button
              type="button"
              disabled={generateDisabled}
              onClick={() =>
                void runEngineGenerate({
                  regenerate: hasEnginePreview,
                  preferenceHints,
                })
              }
              className="btn-cyan rounded-md px-2.5 py-1 text-[11px] disabled:opacity-40 sm:px-3"
              title={generateTitle}
            >
              {busy ? <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> : null}
              {t('uiStudio.generate')}
            </button>
            {(lastGate === 'pass' || lastGate === 'repair') && hasEnginePreview ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void applyLastGenerationToPreview()}
                className="rounded-md border border-border px-2 py-1 text-[10px] text-foreground hover:bg-secondary disabled:opacity-40"
                title={t('uiStudio.applyToPreviewTitle')}
              >
                {previewSynced ? t('uiStudio.previewSynced') : t('uiStudio.applyToPreview')}
              </button>
            ) : null}
            {hasV0ApiKey && eligible && v0ChatId ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void runV0Refine()}
                className="btn-secondary-surface hidden rounded-md px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-40 md:inline"
                title="Send current visual edits to v0 for an optimized regeneration (cheaper than new full prompt)"
              >
                Apply Changes &amp; Regenerate with v0
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void sessionUndo()}
              className="btn-secondary-surface rounded-md px-2 py-1 text-[10px] text-muted-foreground"
              title="Undo last visual edit"
            >
              <RotateCcw className="mr-1 inline h-3 w-3" />
              Undo
            </button>
            <button
              type="button"
              onClick={() => void toggleFullscreen()}
              className="btn-secondary-surface rounded p-1 text-muted-foreground"
              title="Fullscreen"
            >
              {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setApplyConfirmOpen(true)}
              className="btn-cyan rounded-md px-2.5 py-1 text-[11px] disabled:opacity-40 sm:px-3"
            >
              <Save className="mr-1 inline h-3 w-3" />
              Save
            </button>
          </div>
        </div>

        {lastGate === 'weak' ? (
          <div className="border-t border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[10px] leading-snug text-rose-100 sm:px-3">
            {t('uiStudio.gateWeakPreview')}
          </div>
        ) : null}
        {codedAppLive ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-sky-500/25 bg-sky-500/10 px-2 py-1.5 text-[10px] leading-snug text-sky-50 sm:px-3">
            <span className="min-w-0 flex-1">
              Coded app owns <strong className="font-medium">App Preview</strong>. This canvas is the
              editable visual model (not a second live product). Use{' '}
              <strong className="font-medium">Live app</strong> here to see the same Preview, or{' '}
              <strong className="font-medium">Generate UI</strong> to refresh the model.
            </span>
            <button
              type="button"
              className="shrink-0 rounded-md border border-sky-400/40 bg-sky-500/20 px-2 py-0.5 text-[10px] text-sky-50 hover:bg-sky-500/30"
              onClick={() => {
                setLivePreviewRev((n) => n + 1);
                setPreviewSurface('live-app');
                try {
                  window.dispatchEvent(new CustomEvent('nebula-open-app-preview'));
                } catch {
                  /* ignore */
                }
              }}
            >
              Show Live app
            </button>
          </div>
        ) : null}
        {figmaStatus &&
        figmaStatus !== 'success' &&
        figmaStatus !== 'offline' &&
        (figmaEnvGuidance || figmaError) ? (
          <div
            className="border-t border-border/60 px-2 py-1 text-[10px] leading-snug text-muted-foreground sm:px-3"
            title={[figmaError, figmaEnvGuidance].filter(Boolean).join('\n')}
          >
            <span
              className={cn(
                'font-medium',
                figmaStatusIsSoftFallback(figmaStatus) ? 'text-amber-100/90' : 'text-muted-foreground',
              )}
            >
              {figmaStatusLabel(figmaStatus)}
            </span>
            {' — '}
            <span className="line-clamp-2">
              {figmaStatusIsSoftFallback(figmaStatus)
                ? figmaError ||
                  'Using catalog + Stitch Design Brief or seed patterns (live Figma not required on Generate).'
                : [figmaError, figmaEnvGuidance].filter(Boolean).join(' — ')}
            </span>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-1 border-t border-border px-2 py-1.5 sm:px-3">
          <span className="px-1 text-[10px] text-muted-foreground">
            Click preview to select · edit in Properties
          </span>
          <button
            type="button"
            disabled={!selected}
            onClick={() => setApplyAllPagesConfirmOpen(true)}
            className="rounded-md px-2 py-1 text-[10px] text-muted-foreground hover:bg-secondary/50 hover:text-foreground disabled:opacity-40"
          >
            Apply to all pages
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (!eligible) {
                revertVisualToBaseline();
                return;
              }
              setRestoreOriginalConfirmOpen(true);
            }}
            className="ml-auto rounded-md px-2 py-1 text-[10px] text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
          >
            Revert original
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <main
          ref={previewRef}
          className="relative min-w-0 flex-1 overflow-auto bg-black p-3 sm:p-5"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.06) 1px, transparent 0)',
            backgroundSize: '20px 20px',
          }}
          onClick={() => clearSelection()}
        >
          <div
            className={cn(
              'mx-auto flex w-full flex-col gap-2',
              deviceMode === 'mobile' ? 'max-w-[420px]' : 'max-w-4xl',
            )}
          >
            <div className="flex items-center justify-between gap-2 px-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Preview
                </span>
                {projectType ? (
                  <span className="rounded-full border border-border bg-white/5 px-2 py-0.5 text-[10px] text-muted-foreground">
                    {projectType}
                  </span>
                ) : null}
                <div className="flex rounded-md border border-border p-0.5">
                  <button
                    type="button"
                    title="Desktop frame"
                    onClick={() => setDeviceMode('desktop')}
                    className={cn(
                      'inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] transition-colors',
                      deviceMode === 'desktop'
                        ? 'bg-secondary text-foreground'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <Monitor className="h-3 w-3" />
                    <span className="hidden sm:inline">Desktop</span>
                  </button>
                  <button
                    type="button"
                    title="Mobile frame"
                    onClick={() => setDeviceMode('mobile')}
                    className={cn(
                      'inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] transition-colors',
                      deviceMode === 'mobile'
                        ? 'bg-secondary text-foreground'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <Smartphone className="h-3 w-3" />
                    <span className="hidden sm:inline">Mobile</span>
                  </button>
                </div>
                {codedAppLive || v0DemoUrl ? (
                  <div className="flex rounded-md border border-border p-0.5">
                    <button
                      type="button"
                      onClick={() => setPreviewSurface('visual-model')}
                      className={cn(
                        'rounded px-2 py-0.5 text-[10px] transition-colors',
                        previewSurface === 'visual-model'
                          ? 'bg-secondary text-foreground'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      Visual model
                    </button>
                    {codedAppLive ? (
                      <button
                        type="button"
                        onClick={() => {
                          setLivePreviewRev((n) => n + 1);
                          setPreviewSurface('live-app');
                        }}
                        className={cn(
                          'rounded px-2 py-0.5 text-[10px] transition-colors',
                          previewSurface === 'live-app'
                            ? 'bg-sky-500/25 text-sky-100'
                            : 'text-muted-foreground hover:text-foreground',
                        )}
                        title={previewStatusLabel || 'Same bootstrap as App Preview tab'}
                      >
                        Live app
                      </button>
                    ) : null}
                    {v0DemoUrl ? (
                      <button
                        type="button"
                        onClick={() => setPreviewSurface('v0-live')}
                        className={cn(
                          'rounded px-2 py-0.5 text-[10px] transition-colors',
                          previewSurface === 'v0-live'
                            ? 'bg-primary/20 text-primary'
                            : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        v0 live
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {pageIds.length > 1 && previewSurface === 'visual-model' ? (
                  <select
                    value={activePage}
                    onChange={(e) => {
                      setActivePage(e.target.value);
                      clearSelection();
                    }}
                    className="max-w-[140px] truncate rounded border border-border bg-secondary/40 px-2 py-0.5 text-[10px] text-foreground"
                  >
                    {pageIds.map((pid) => (
                      <option key={pid} value={pid}>
                        {pid}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-[10px] text-muted-foreground">{activePage}</span>
                )}
              </div>
              {previewSurface === 'visual-model' && selected ? (
                <span className="truncate text-[10px] text-primary">
                  {selected.role} · {selected.type}
                </span>
              ) : previewSurface === 'live-app' ? (
                <button
                  type="button"
                  className="truncate text-[10px] text-sky-200 hover:underline"
                  onClick={() => {
                    try {
                      window.dispatchEvent(new CustomEvent('nebula-open-app-preview'));
                    } catch {
                      /* ignore */
                    }
                  }}
                >
                  Same as App Preview tab ↗
                </button>
              ) : previewSurface === 'v0-live' && v0DemoUrl ? (
                <a
                  href={v0DemoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate text-[10px] text-primary hover:underline"
                >
                  Open on v0.dev ↗
                </a>
              ) : (
                <span className="text-[10px] text-muted-foreground/70">Click an element to edit</span>
              )}
            </div>

            {deviceMode === 'mobile' ? (
              <div className="mx-auto w-full max-w-[390px]">
                <div className="overflow-hidden rounded-[2rem] border-[6px] border-[#222222] bg-black">
                  <div className="relative flex h-7 items-center justify-center border-b border-border bg-black/40">
                    <span className="absolute left-1/2 top-1.5 h-3.5 w-20 -translate-x-1/2 rounded-full bg-black/80" />
                    <span className="sr-only">Mobile device frame</span>
                  </div>
                  {previewSurface === 'live-app' ? (
                    <iframe
                      title="Live coded app preview (mobile)"
                      src={livePreviewUrl}
                      className="min-h-[640px] w-full border-0 bg-white"
                      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                    />
                  ) : previewSurface === 'v0-live' && v0DemoUrl ? (
                    <iframe
                      title="v0 live preview (mobile)"
                      src={v0DemoUrl}
                      className="min-h-[640px] w-full border-0 bg-white"
                      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                    />
                  ) : (
                    <div className="min-h-[640px] overflow-auto p-3 sm:p-4">
                      {page ? renderNode(page.rootId) : null}
                    </div>
                  )}
                  <div className="flex h-5 items-center justify-center border-t border-border bg-black/30">
                    <span className="h-1 w-16 rounded-full bg-white/25" />
                  </div>
                </div>
                <p className="mt-2 text-center text-[10px] text-muted-foreground/70">
                  {projectType === 'Mobile App'
                    ? 'Mobile App — phone canvas (390px)'
                    : 'Mobile preview — 390px'}
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border bg-black">
                <div className="border-b border-border bg-black/20 px-3 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-red-500/80" />
                    <span className="h-2 w-2 rounded-full bg-amber-500/80" />
                    <span className="h-2 w-2 rounded-full bg-foreground/50" />
                    <span className="ml-2 truncate text-[10px] text-muted-foreground">
                      {previewSurface === 'live-app'
                        ? 'Live coded app — App Preview'
                        : previewSurface === 'v0-live' && v0DemoUrl
                          ? `${activePage} — v0 live preview`
                          : `${activePage} — visual model`}
                      {projectType ? ` · ${projectType}` : ''}
                    </span>
                  </div>
                </div>
                {previewSurface === 'live-app' ? (
                  <iframe
                    title="Live coded app preview"
                    src={livePreviewUrl}
                    className="min-h-[420px] w-full flex-1 border-0 bg-white"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                  />
                ) : previewSurface === 'v0-live' && v0DemoUrl ? (
                  <iframe
                    title="v0 live preview"
                    src={v0DemoUrl}
                    className="min-h-[420px] w-full flex-1 border-0 bg-white"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                  />
                ) : (
                  <div className="p-4 sm:p-6">{page ? renderNode(page.rootId) : null}</div>
                )}
              </div>
            )}
          </div>
        </main>

        {/* Right Properties Panel — single source of truth for edits */}
        {previewSurface === 'visual-model' ? (
          <aside className="flex w-72 shrink-0 flex-col overflow-hidden border-l border-border bg-black">
            <div className="shrink-0 border-b border-border px-3 py-2">
              <div className="text-[11px] font-medium text-foreground">Properties</div>
              {selected ? (
                <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                  {selected.role || selected.id}
                </div>
              ) : null}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {!selected ? (
                <p className="p-3 text-[11px] leading-relaxed text-muted-foreground">
                  Click an element in the preview to edit text, color, size, spacing, border, and order.
                </p>
              ) : (
                <div className="space-y-4 p-3 text-[11px]">
                  {(() => {
                    const st = { ...defaultStyle(), ...selected.style };
                    const hasText = selected.type === 'text' || selected.type === 'button';
                    const opacityPct = Math.round((st.opacity ?? 1) * 100);
                    const canDelete = Boolean(page && selectedId !== page.rootId);
                    return (
                      <>
                        {/* B. TEXT */}
                        {hasText ? (
                          <div>
                            <div className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                              Text
                            </div>
                            <label className="flex flex-col gap-0.5">
                              <span className="text-[10px] text-muted-foreground">Text</span>
                              <textarea
                                rows={3}
                                value={selected.text || ''}
                                onChange={(e) => updateSelectedText(e.target.value)}
                                className="w-full resize-y rounded border border-border bg-black/40 px-2 py-1 text-foreground"
                                placeholder="Label"
                              />
                            </label>
                            <label className="mt-2 flex flex-col gap-0.5">
                              <span className="text-[10px] text-muted-foreground">Color</span>
                              <div className="flex items-center gap-2">
                                <input
                                  type="color"
                                  value={toPickerHex(st.color, '#e2e8f0')}
                                  onChange={(e) => updateSelectedStyle({ color: e.target.value })}
                                  className="h-8 w-12 rounded border border-border bg-black/40"
                                />
                                <input
                                  type="text"
                                  value={st.color || ''}
                                  onChange={(e) => updateSelectedStyle({ color: e.target.value })}
                                  onBlur={(e) =>
                                    updateSelectedStyle({
                                      color: normalizeHexOnCommit(e.target.value, '#e2e8f0'),
                                    })
                                  }
                                  className="flex-1 rounded border border-border bg-black/40 px-2 py-1 font-mono text-[10px] text-foreground"
                                  placeholder="#RRGGBB"
                                />
                              </div>
                            </label>
                            <label className="mt-2 flex flex-col gap-0.5">
                              <span className="text-[10px] text-muted-foreground">Opacity</span>
                              <input
                                type="range"
                                min={0}
                                max={100}
                                step={1}
                                value={opacityPct}
                                onChange={(e) =>
                                  updateSelectedStyle({
                                    opacity: (parseInt(e.target.value, 10) || 0) / 100,
                                  })
                                }
                                className="w-full accent-[color:var(--primary)]"
                              />
                              <span className="font-mono text-[10px] text-muted-foreground">{opacityPct}%</span>
                            </label>
                          </div>
                        ) : null}

                        {/* C. BACKGROUND */}
                        <div>
                          <div className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                            Background
                          </div>
                          <label className="flex flex-col gap-0.5">
                            <span className="text-[10px] text-muted-foreground">Background</span>
                            <div className="flex items-center gap-2">
                              <input
                                type="color"
                                value={toPickerHex(st.backgroundColor, '#ffffff')}
                                onChange={(e) =>
                                  updateSelectedStyle({ backgroundColor: e.target.value })
                                }
                                className="h-8 w-12 rounded border border-border bg-black/40"
                              />
                              <input
                                type="text"
                                value={toPickerHex(st.backgroundColor, '#ffffff')}
                                onChange={(e) =>
                                  updateSelectedStyle({ backgroundColor: e.target.value })
                                }
                                onBlur={(e) =>
                                  updateSelectedStyle({
                                    backgroundColor: normalizeBgColorOnCommit(
                                      e.target.value,
                                      '#ffffff',
                                    ),
                                  })
                                }
                                className="flex-1 rounded border border-border bg-black/40 px-2 py-1 font-mono text-[10px] text-foreground"
                                placeholder="#RRGGBB"
                              />
                            </div>
                          </label>
                        </div>

                        {/* D. SIZE */}
                        <div>
                          <div className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                            Size
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <label className="flex flex-col gap-0.5">
                              <span className="text-[10px] text-muted-foreground">Width</span>
                              <input
                                type="text"
                                value={st.width || 'auto'}
                                onChange={(e) => updateSelectedStyle({ width: e.target.value })}
                                className="rounded border border-border bg-black/40 px-2 py-1 font-mono text-[10px]"
                                placeholder="auto / 100% / 240px"
                              />
                            </label>
                            <label className="flex flex-col gap-0.5">
                              <span className="text-[10px] text-muted-foreground">Height</span>
                              <input
                                type="text"
                                value={st.height || 'auto'}
                                onChange={(e) => updateSelectedStyle({ height: e.target.value })}
                                className="rounded border border-border bg-black/40 px-2 py-1 font-mono text-[10px]"
                                placeholder="auto / 200px"
                              />
                            </label>
                          </div>
                          <label className="mt-2 flex flex-col gap-0.5">
                            <span className="text-[10px] text-muted-foreground">Border Radius</span>
                            <input
                              type="range"
                              min={0}
                              max={64}
                              step={1}
                              value={st.borderRadius ?? 8}
                              onChange={(e) =>
                                updateSelectedStyle({
                                  borderRadius: parseInt(e.target.value, 10) || 0,
                                })
                              }
                              className="accent-[color:var(--primary)]"
                            />
                            <span className="font-mono text-[10px] text-muted-foreground">
                              {st.borderRadius ?? 8}px
                            </span>
                          </label>
                        </div>

                        {/* E. SPACING */}
                        <div>
                          <div className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
                            <span>Padding</span>
                            <button
                              type="button"
                              onClick={() => {
                                const p = st.paddingTop ?? 16;
                                updateSelectedStyle({
                                  paddingTop: p,
                                  paddingRight: p,
                                  paddingBottom: p,
                                  paddingLeft: p,
                                });
                              }}
                              className="text-[9px] text-primary hover:underline"
                            >
                              Equal
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            {(
                              [
                                { k: 'paddingTop' as const, l: 'Top' },
                                { k: 'paddingRight' as const, l: 'Right' },
                                { k: 'paddingBottom' as const, l: 'Bottom' },
                                { k: 'paddingLeft' as const, l: 'Left' },
                              ] as const
                            ).map(({ k, l }) => (
                              <label key={k} className="flex flex-col gap-0.5">
                                <span className="text-[10px] text-muted-foreground">{l} (px)</span>
                                <input
                                  type="number"
                                  min={0}
                                  max={128}
                                  value={st[k] ?? 0}
                                  onChange={(e) =>
                                    updateSelectedStyle({
                                      [k]: parseInt(e.target.value, 10) || 0,
                                    })
                                  }
                                  className="rounded border border-border bg-black/40 px-2 py-1 font-mono text-[10px]"
                                />
                              </label>
                            ))}
                          </div>
                          <div className="mb-1.5 mt-3 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
                            <span>Margin</span>
                            <button
                              type="button"
                              onClick={() => {
                                const m = st.marginTop ?? 0;
                                updateSelectedStyle({
                                  marginTop: m,
                                  marginRight: m,
                                  marginBottom: m,
                                  marginLeft: m,
                                });
                              }}
                              className="text-[9px] text-primary hover:underline"
                            >
                              Equal
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            {(
                              [
                                { k: 'marginTop' as const, l: 'Top' },
                                { k: 'marginRight' as const, l: 'Right' },
                                { k: 'marginBottom' as const, l: 'Bottom' },
                                { k: 'marginLeft' as const, l: 'Left' },
                              ] as const
                            ).map(({ k, l }) => (
                              <label key={k} className="flex flex-col gap-0.5">
                                <span className="text-[10px] text-muted-foreground">{l} (px)</span>
                                <input
                                  type="number"
                                  min={-64}
                                  max={128}
                                  value={st[k] ?? 0}
                                  onChange={(e) =>
                                    updateSelectedStyle({
                                      [k]: parseInt(e.target.value, 10) || 0,
                                    })
                                  }
                                  className="rounded border border-border bg-black/40 px-2 py-1 font-mono text-[10px]"
                                />
                              </label>
                            ))}
                          </div>
                        </div>

                        {/* F. BORDER */}
                        <div>
                          <div className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                            Border
                          </div>
                          <label className="mb-2 flex flex-col gap-0.5">
                            <span className="text-[10px] text-muted-foreground">Border width (px)</span>
                            <input
                              type="number"
                              min={0}
                              max={24}
                              value={st.borderWidth ?? 0}
                              onChange={(e) =>
                                updateSelectedStyle({
                                  borderWidth: parseInt(e.target.value, 10) || 0,
                                })
                              }
                              className="rounded border border-border bg-black/40 px-2 py-1 font-mono text-[10px]"
                            />
                          </label>
                          <label className="flex flex-col gap-0.5">
                            <span className="text-[10px] text-muted-foreground">Border color</span>
                            <div className="flex items-center gap-2">
                              <input
                                type="color"
                                value={toPickerHex(st.borderColor, '#334155')}
                                onChange={(e) =>
                                  updateSelectedStyle({ borderColor: e.target.value })
                                }
                                className="h-8 w-12 rounded border border-border bg-black/40"
                              />
                              <input
                                type="text"
                                value={st.borderColor || ''}
                                onChange={(e) =>
                                  updateSelectedStyle({ borderColor: e.target.value })
                                }
                                onBlur={(e) =>
                                  updateSelectedStyle({
                                    borderColor: normalizeHexOnCommit(e.target.value, '#334155'),
                                  })
                                }
                                className="flex-1 rounded border border-border bg-black/40 px-2 py-1 font-mono text-[10px]"
                                placeholder="#RRGGBB"
                              />
                            </div>
                          </label>
                        </div>

                        {/* G. SHADOW */}
                        <div>
                          <div className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                            Shadow
                          </div>
                          <label className="flex flex-col gap-0.5">
                            <span className="text-[10px] text-muted-foreground">Box shadow</span>
                            <input
                              type="text"
                              value={st.boxShadow || ''}
                              onChange={(e) => updateSelectedStyle({ boxShadow: e.target.value })}
                              className="rounded border border-border bg-black/40 px-2 py-1 font-mono text-[10px]"
                              placeholder="0 1px 3px rgba(0,0,0,0.35)"
                            />
                          </label>
                        </div>

                        {/* H. ORDER / ACTIONS */}
                        <div className="space-y-2 border-t border-border pt-3">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => moveSelectedInParent(-1)}
                              className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-border py-2 text-[11px] text-foreground/80 hover:bg-[#111111]"
                            >
                              <ArrowUp className="h-3 w-3" /> Move up
                            </button>
                            <button
                              type="button"
                              onClick={() => moveSelectedInParent(1)}
                              className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-border py-2 text-[11px] text-foreground/80 hover:bg-[#111111]"
                            >
                              <ArrowDown className="h-3 w-3" /> Move down
                            </button>
                          </div>
                          <button
                            type="button"
                            disabled={!canDelete}
                            onClick={() => deleteSelectedNode()}
                            className="flex w-full items-center justify-center gap-1 rounded-lg border border-rose-500/30 py-2 text-[11px] text-rose-200 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Trash2 className="h-3 w-3" /> Delete
                          </button>
                          <button
                            type="button"
                            onClick={() => setApplyAllPagesConfirmOpen(true)}
                            className="w-full rounded-lg border border-border py-2 text-[11px] text-foreground/80 hover:bg-[#111111]"
                          >
                            Apply to all pages
                          </button>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          </aside>
        ) : null}
      </div>

      <footer className="surface-active flex shrink-0 items-center justify-between gap-2 border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">
        <span>
          {activePage} · {layerCount} layer{layerCount === 1 ? '' : 's'}
          {selected ? ` · ${selected.role}` : ' · select an element'}
        </span>
        <div className="flex items-center gap-3">
          {eligible ? (
            <button
              type="button"
              onClick={() => setRevertConfirmOpen(true)}
              className="hover:text-foreground"
            >
              Undo last code apply
            </button>
          ) : null}
          <span className="hidden sm:inline">Save writes to <code className="text-primary/90">src/</code></span>
        </div>
      </footer>

      {applyConfirmOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-border bg-[#0a0a0a] p-6 shadow-2xl">
            <div className="mb-3 flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
              <div>
                <h3 className="font-headline text-sm text-foreground">Apply changes to code?</h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Are you sure you want to apply/code these changes? The server will copy the current contents of every file Grok is
                  about to change into <code className="text-foreground/80/90">generated-ui/versions/&lt;timestamp&gt;/</code>, then write
                  updates under <code className="text-foreground/80/90">src/</code> (and other allowed paths). Your immutable v0 folder is
                  never modified. Grok produces the file contents.
                </p>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-border px-4 py-2 text-xs text-muted-foreground"
                onClick={() => setApplyConfirmOpen(false)}
              >
                Continue editing
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void runApplyToCode()}
                className="btn-cyan rounded-lg px-4 py-2 text-xs disabled:opacity-40"
              >
                {busy ? <Loader2 className="inline h-4 w-4 animate-spin" /> : <Check className="inline h-4 w-4" />} Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {revertConfirmOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-rose-500/30 bg-[#0a0a0a] p-6 shadow-2xl">
            <h3 className="font-headline text-sm text-rose-100">Undo last code apply?</h3>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Restores only the files that were backed up in <code className="text-foreground/80/90">generated-ui/versions/&lt;timestamp&gt;/</code>{' '}
              during your last confirmed apply. This does not reset the whole project.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-border px-4 py-2 text-xs text-muted-foreground"
                onClick={() => setRevertConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void runRevert()}
                className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-headline text-white disabled:opacity-40"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {restoreOriginalConfirmOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-border bg-[#0a0a0a] p-6 shadow-2xl">
            <div className="mb-3 flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
              <div>
                <h3 className="font-headline text-sm text-foreground">Restore original v0 generation?</h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  This replaces current UI files under <code className="text-foreground/80/90">src/</code>, <code className="text-foreground/80/90">app/</code>,{' '}
                  <code className="text-foreground/80/90">pages/</code>, <code className="text-foreground/80/90">components/</code>, and{' '}
                  <code className="text-foreground/80/90">public/</code> with the immutable copy from{' '}
                  <code className="text-foreground/80/90">generated-ui/v0-original-…</code>. Your visual editor session model is unchanged until
                  you reload preview from disk.
                </p>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-border px-4 py-2 text-xs text-muted-foreground"
                onClick={() => setRestoreOriginalConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void runRestoreOriginal()}
                className="btn-cyan rounded-lg px-4 py-2 text-xs disabled:opacity-40"
              >
                {busy ? <Loader2 className="inline h-4 w-4 animate-spin" /> : <History className="inline h-4 w-4" />} Confirm restore
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Apply to All Pages Confirmation */}
      {applyAllPagesConfirmOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-amber-500/30 bg-[#0a0a0a] p-6 shadow-2xl">
            <div className="mb-3 flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
              <div>
                <h3 className="font-headline text-sm text-amber-100">Apply style to all pages?</h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  This will overwrite the style of every element with the same role (<code className="text-amber-300/90">{selected?.role}</code>) across <strong>all pages</strong> in this visual model.
                  This cannot be undone automatically. Consider using "Match style (page)" first to preview.
                </p>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-border px-4 py-2 text-xs text-muted-foreground"
                onClick={() => setApplyAllPagesConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setApplyAllPagesConfirmOpen(false);
                  applySimilarAllPages();
                }}
                className="rounded-lg bg-amber-600 px-4 py-2 text-xs font-headline text-white"
              >
                Apply to all pages
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
