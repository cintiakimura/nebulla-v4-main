/**
 * UI Studio Beta engine client.
 * Default inference-first: pre-code mockup after Master Plan + ui-brief (before coding finishes).
 * After successful UI-relevant Foundation/Go apply: one automatic post-code UI refresh
 * grounded on plan + file facts (not a sticky clone of the pre-code draft).
 *
 * This shell does not mount IdeUiStudioBeta — the engine calls /generate itself.
 * Completes on HTTP result (or an already-ready status), not a pane complete event.
 */

import { isAbortLikeError } from './abortLikeError';
import { fetchJson, readResponseJson } from './apiFetch';
import type { GrokActivityProgressFn } from './ideGrokActivityStatus';
import { startGrokActivityWaitTicker } from './ideGrokActivityStatus';
import { getGrokRequestHeaders } from './grokUserKey';
import { withProjectBody, withProjectQuery } from './nebulaProjectApi';
import { dispatchOpenCenterPanel } from '@/components/ide/IdeCenterTabsContext';
import { statusLooksReadyForSkip } from './uiMockupGate';
import { isFoundationGoInFlight } from './foundationHeavyJob';
import { fetchResearchStatus } from './nebulaResearchClient';
import {
  extractUiRouteKeys,
  looksLikeUiRelevantPaths,
  resolvePostCodeUiAction,
  type PostCodeUiAction,
} from './postCodeUiRefresh';

export { looksLikeUiRelevantPaths, resolvePostCodeUiAction, extractUiRouteKeys };
export type { PostCodeUiAction };

/** Ask UI Studio to show the live coded App Preview surface (not mockup). */
export const NEBULA_STUDIO_SHOW_LIVE_APP = 'nebula-studio-show-live-app';

export const NEBULA_UI_STUDIO_BETA_RUN = 'nebula-ui-studio-beta-run';
export const NEBULA_UI_STUDIO_BETA_COMPLETE = 'nebula-ui-studio-beta-complete';
export const NEBULA_UI_STUDIO_BETA_BUSY = 'nebula-ui-studio-beta-busy';

export type UiStudioUiPhase = 'pre_code' | 'post_code' | 'manual';

export type UiStudioBetaGenerateOptions = {
  projectName?: string;
  pageName?: string;
  autoTriggered?: boolean;
  regenerate?: boolean;
  preferenceFeedback?: string;
  guidedImprovement?: boolean;
  writtenPaths?: string[];
  /** Distinguishes pre-code mockup vs post-code refresh vs user Generate. */
  uiPhase?: UiStudioUiPhase;
  onProgress?: GrokActivityProgressFn;
  openPane?: boolean;
};

export type UiStudioBetaGenerateResult = {
  ok: boolean;
  error?: string;
  editorModel?: unknown;
  generatedCode?: string;
  regeneration_count?: number;
  max_regenerations?: number;
  user_visible_stage?: string;
  preference_recovery?: boolean;
  preference_recovery_question?: string;
  context?: Record<string, unknown>;
};

let inFlight: Promise<UiStudioBetaGenerateResult> | null = null;
let lastAutoKey = '';

/** Post-code Studio refresh has run at least once this session (per project). */
const postCodeAutoDoneKeys = new Set<string>();
/** UI route keys already covered by a post-code Studio refresh this session. */
const postCodeCoveredRouteKeys = new Map<string, string[]>();

export function hasPostCodeUiRefreshRun(projectKey: string): boolean {
  return postCodeAutoDoneKeys.has(projectKey || 'default');
}

export function getPostCodeCoveredRouteKeys(projectKey: string): string[] {
  return postCodeCoveredRouteKeys.get(projectKey || 'default')?.slice() || [];
}

export function markPostCodeUiRefreshDone(projectKey: string, writtenPaths: string[] = []): void {
  const key = projectKey || 'default';
  postCodeAutoDoneKeys.add(key);
  const incoming = extractUiRouteKeys(writtenPaths);
  const prev = new Set(postCodeCoveredRouteKeys.get(key) || []);
  for (const k of incoming) prev.add(k);
  postCodeCoveredRouteKeys.set(key, [...prev].sort());
}

/** Test helper — clears one-shot post-code session state. */
export function resetPostCodeUiRefreshForTests(): void {
  postCodeAutoDoneKeys.clear();
  postCodeCoveredRouteKeys.clear();
  lastAutoKey = '';
  inFlight = null;
}

export function dispatchStudioShowLiveApp(): void {
  try {
    window.dispatchEvent(new CustomEvent(NEBULA_STUDIO_SHOW_LIVE_APP));
    window.dispatchEvent(new CustomEvent('nebula-reload-app-preview'));
  } catch {
    /* ignore */
  }
}

export function dispatchOpenUiStudioBeta(): void {
  dispatchOpenCenterPanel('ui-studio-beta');
}

export function dispatchUiStudioBetaRun(detail?: UiStudioBetaGenerateOptions): void {
  window.dispatchEvent(new CustomEvent(NEBULA_UI_STUDIO_BETA_RUN, { detail: detail ?? {} }));
}

export async function runUiStudioBetaGeneration(
  options: UiStudioBetaGenerateOptions = {},
): Promise<UiStudioBetaGenerateResult> {
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const onProgress = options.onProgress;
    // Phase 5: IF Foundation Go is running → do not start a second silent UI Gen brain.
    if (isFoundationGoInFlight(options.projectName)) {
      onProgress?.(
        'Foundation Go running — UI Gen waiting (one heavy job). Generate UI after the slice finishes.',
        'warn',
      );
      return {
        ok: false,
        error: 'Foundation Go in flight — UI Gen not started in parallel',
      };
    }
    const researchSt = await fetchResearchStatus();
    if (researchSt.pending) {
      onProgress?.('Research in flight — UI Gen waiting (one heavy job).', 'warn');
      return {
        ok: false,
        error: 'Research in flight — UI Gen not started in parallel (one heavy job).',
      };
    }
    if (options.openPane !== false) {
      dispatchOpenUiStudioBeta();
    }
    try {
      window.dispatchEvent(
        new CustomEvent(NEBULA_UI_STUDIO_BETA_BUSY, {
          detail: { busy: true, regenerate: options.regenerate === true },
        }),
      );
    } catch {
      /* ignore */
    }

    const phase = options.uiPhase;
    onProgress?.(
      options.regenerate
        ? 'Generate again — UI Studio Beta engine…'
        : phase === 'post_code'
          ? 'Post-code UI refresh — regenerating from plan + coded files…'
          : phase === 'pre_code' || (options.autoTriggered && !options.writtenPaths?.length)
            ? 'Pre-code mockup — generating UI Studio Beta (UI Gen v2)…'
            : options.autoTriggered
              ? options.writtenPaths?.length
                ? 'Files applied — post-code UI refresh…'
                : 'Architecture ready — generating UI mockup (UI Gen v2)…'
              : 'Running UI Generation Engine…',
      'info',
    );

    try {
      const existing = await fetchJson<{
        user_visible_stage?: string;
        final_status?: string;
        has_loadable_model?: boolean;
      }>(withProjectQuery('/api/ui-studio-beta/status'), {
        credentials: 'include',
        headers: getGrokRequestHeaders(),
      });
      if (statusLooksReadyForSkip(existing) && !options.regenerate) {
        onProgress?.(existing.user_visible_stage || 'Ready in preview', 'success');
        const applied = await applyUiStudioBetaToAppPreview(onProgress);
        try {
          window.dispatchEvent(new CustomEvent('nebula-preview-show-mockup'));
          window.dispatchEvent(new CustomEvent('nebula-reload-app-preview'));
        } catch {
          /* ignore */
        }
        return {
          ok: applied.ok,
          user_visible_stage: existing.user_visible_stage,
          error: applied.ok ? undefined : applied.error,
        };
      }
    } catch {
      /* generate below */
    }

    const GENERATE_TIMEOUT_MS = 180_000;
    const stopWait = startGrokActivityWaitTicker('Generating UI mockup', (msg, kind, opts) =>
      onProgress?.(msg, kind, opts),
    );
    try {
      const data = await Promise.race([
        (async () => {
          const response = await fetch(withProjectQuery('/api/ui-studio-beta/generate'), {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json', ...getGrokRequestHeaders() },
            body: JSON.stringify(
              withProjectBody({
                projectName: options.projectName,
                pageName: options.pageName,
                regenerate: options.regenerate === true,
                autoTriggered: options.autoTriggered === true,
                preferenceFeedback: options.preferenceFeedback,
                guidedImprovement: options.guidedImprovement === true,
                writtenPaths: options.writtenPaths,
                uiPhase: options.uiPhase,
              }),
            ),
          });
          return readResponseJson<UiStudioBetaGenerateResult & { error?: string }>(response);
        })(),
        new Promise<never>((_, reject) => {
          window.setTimeout(() => {
            reject(new Error('UI mockup still running after 3 minutes'));
          }, GENERATE_TIMEOUT_MS);
        }),
      ]);
      if (data.preference_recovery) {
        onProgress?.(data.preference_recovery_question || 'Preference recovery needed', 'warn');
        try {
          window.dispatchEvent(
            new CustomEvent(NEBULA_UI_STUDIO_BETA_COMPLETE, {
              detail: { ok: false, ...data, preference_recovery: true },
            }),
          );
        } catch {
          /* ignore */
        }
        return { ...data, ok: false, preference_recovery: true };
      }
      if (data.ok === false) {
        onProgress?.(data.error || 'UI Studio Beta generation failed', 'error');
        return data;
      }
      onProgress?.(data.user_visible_stage || 'Ready in preview', 'success');
      const applied = await applyUiStudioBetaToAppPreview(onProgress);
      try {
        window.dispatchEvent(new CustomEvent(NEBULA_UI_STUDIO_BETA_COMPLETE, { detail: { ok: true, ...data } }));
        window.dispatchEvent(new CustomEvent('nebula-preview-show-mockup'));
        window.dispatchEvent(new CustomEvent('nebula-reload-app-preview'));
      } catch {
        /* ignore */
      }
      return { ok: applied.ok !== false, ...data, error: applied.ok ? undefined : applied.error };
    } catch (e) {
      if (isAbortLikeError(e) || /still running|timed out/i.test(e instanceof Error ? e.message : '')) {
        try {
          const st = await fetchJson<{
            has_loadable_model?: boolean;
            user_visible_stage?: string;
          }>(withProjectQuery('/api/ui-studio-beta/status'), {
            credentials: 'include',
            headers: getGrokRequestHeaders(),
          });
          if (statusLooksReadyForSkip(st)) {
            onProgress?.(st.user_visible_stage || 'UI mockup ready after wait', 'success');
            const applied = await applyUiStudioBetaToAppPreview(onProgress);
            return { ok: applied.ok, error: applied.ok ? undefined : applied.error };
          }
        } catch {
          /* status miss */
        }
        const error =
          'UI mockup did not finish — Foundation will not start. Use Generate UI if Preview is still empty.';
        onProgress?.(error, 'warn');
        return { ok: false, error };
      }
      const error = e instanceof Error ? e.message : 'UI Studio Beta generation failed';
      onProgress?.(error, 'error');
      return { ok: false, error };
    } finally {
      stopWait();
    }
  })().finally(() => {
    inFlight = null;
    try {
      window.dispatchEvent(
        new CustomEvent(NEBULA_UI_STUDIO_BETA_BUSY, { detail: { busy: false } }),
      );
    } catch {
      /* ignore */
    }
  });

  return inFlight;
}

/** Push last successful UI Gen meta into App Preview (index.html shell). */
export async function applyUiStudioBetaToAppPreview(
  onProgress?: GrokActivityProgressFn,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const data = await fetchJson<{
      ok?: boolean;
      error?: string;
      mockupOnlyArtifact?: boolean;
      previewStatusLabel?: string;
    }>(
      withProjectQuery('/api/ui-studio-beta/apply-preview'),
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...getGrokRequestHeaders() },
        body: JSON.stringify(withProjectBody({})),
      },
    );
    if (!data.ok) {
      onProgress?.(data.error || 'Could not apply UI Gen to App Preview', 'warn');
      return { ok: false, error: data.error };
    }
    onProgress?.(
      data.mockupOnlyArtifact
        ? 'Post-code mockup refresh — dedicated mockup artifact only (live Preview not overwritten)'
        : data.previewStatusLabel?.includes('Pre-code')
          ? 'Pre-code mockup applied to App Preview'
          : 'UI Studio Beta applied to App Preview',
      'success',
    );
    try {
      window.dispatchEvent(new CustomEvent('nebula-files-applied'));
      window.dispatchEvent(new CustomEvent('nebula-preview-show-mockup'));
      window.dispatchEvent(new CustomEvent('nebula-reload-app-preview'));
      window.dispatchEvent(new CustomEvent('nebula-open-app-preview'));
    } catch {
      /* ignore */
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Apply to App Preview failed';
    onProgress?.(msg, 'warn');
    return { ok: false, error: msg };
  }
}

/**
 * After successful apply of UI-relevant files: post-code UI Gen cycle
 * (plan + file grounding). Re-runs when a later slice adds new UI routes;
 * otherwise reloads live App Preview only (mockup must not reclaim entry).
 */
export async function triggerUiStudioBetaAfterFilesApplied(options: {
  writtenPaths: string[];
  projectName?: string;
  onProgress?: GrokActivityProgressFn;
  /** Force another post-code regen even if one already ran this session. */
  force?: boolean;
}): Promise<UiStudioBetaGenerateResult | null> {
  const paths = options.writtenPaths || [];
  const projectKey = options.projectName || 'default';
  const action = resolvePostCodeUiAction({
    writtenPaths: paths,
    alreadyRanPostCode: hasPostCodeUiRefreshRun(projectKey),
    previouslyCoveredKeys: getPostCodeCoveredRouteKeys(projectKey),
    force: options.force,
  });

  if (action === 'skip_no_ui_paths') {
    options.onProgress?.(
      'Files applied — UI Beta not started (no app/UI shell files in this slice)',
      'info',
    );
    return null;
  }

  if (action === 'sync_preview_only') {
    // Do not reclaim live App Preview with mockup HTML after code exists.
    options.onProgress?.(
      'Coded app owns App Preview — reloading live Preview. UI Studio visual model is separate; switch Studio to “Live app” or Generate UI to refresh the model.',
      'info',
    );
    try {
      dispatchStudioShowLiveApp();
      window.dispatchEvent(new CustomEvent('nebula-open-app-preview'));
      dispatchOpenUiStudioBeta();
    } catch {
      /* ignore */
    }
    return null;
  }

  const key = `post_code:${projectKey}:${paths.slice().sort().join('|')}`;
  if (key === lastAutoKey && inFlight) {
    return inFlight;
  }
  lastAutoKey = key;
  markPostCodeUiRefreshDone(projectKey, paths);

  return runUiStudioBetaGeneration({
    projectName: options.projectName,
    writtenPaths: paths,
    autoTriggered: true,
    uiPhase: 'post_code',
    openPane: true,
    onProgress: options.onProgress,
  });
}

/**
 * Plan-first mockup: run UI Gen v2 once ui-brief + §§1–5 exist (before foundation coding).
 */
export async function triggerUiStudioBetaAfterPlanReady(options: {
  projectName?: string;
  onProgress?: GrokActivityProgressFn;
}): Promise<UiStudioBetaGenerateResult> {
  return runUiStudioBetaGeneration({
    projectName: options.projectName,
    writtenPaths: [],
    autoTriggered: true,
    uiPhase: 'pre_code',
    openPane: true,
    onProgress: options.onProgress,
  });
}
