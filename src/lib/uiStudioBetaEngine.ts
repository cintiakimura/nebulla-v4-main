/**
 * UI Studio Beta engine client.
 * Default inference-first: pre-code mockup after Master Plan + ui-brief (before coding finishes).
 * After successful UI-relevant Foundation/Go apply: one automatic post-code UI refresh
 * grounded on plan + file facts (not a sticky clone of the pre-code draft).
 *
 * Trigger flow: open Beta pane → dispatch run event → IdeUiStudioBeta owns the API call
 * (so stage UI stays in sync). Completes when nebula-ui-studio-beta-complete fires.
 */

import { fetchJson } from './apiFetch';
import type { GrokActivityProgressFn } from './ideGrokActivityStatus';
import { getGrokRequestHeaders } from './grokUserKey';
import { withProjectBody, withProjectQuery } from './nebulaProjectApi';
import { dispatchOpenCenterPanel } from '@/components/ide/IdeCenterTabsContext';
import {
  looksLikeUiRelevantPaths,
  resolvePostCodeUiAction,
  type PostCodeUiAction,
} from './postCodeUiRefresh';

export { looksLikeUiRelevantPaths, resolvePostCodeUiAction };
export type { PostCodeUiAction };

export const NEBULA_UI_STUDIO_BETA_RUN = 'nebula-ui-studio-beta-run';
export const NEBULA_UI_STUDIO_BETA_COMPLETE = 'nebula-ui-studio-beta-complete';

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

/** One automatic post-code UI refresh per project session (unless force / user Generate). */
const postCodeAutoDoneKeys = new Set<string>();

export function hasPostCodeUiRefreshRun(projectKey: string): boolean {
  return postCodeAutoDoneKeys.has(projectKey || 'default');
}

export function markPostCodeUiRefreshDone(projectKey: string): void {
  postCodeAutoDoneKeys.add(projectKey || 'default');
}

/** Test helper — clears one-shot post-code session state. */
export function resetPostCodeUiRefreshForTests(): void {
  postCodeAutoDoneKeys.clear();
  lastAutoKey = '';
  inFlight = null;
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
    if (options.openPane !== false) {
      dispatchOpenUiStudioBeta();
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

    return await new Promise<UiStudioBetaGenerateResult>((resolve) => {
      let settled = false;
      const finish = (result: UiStudioBetaGenerateResult) => {
        if (settled) return;
        settled = true;
        window.clearInterval(pollTimer);
        window.clearTimeout(timeout);
        window.removeEventListener(NEBULA_UI_STUDIO_BETA_COMPLETE, onComplete as EventListener);
        resolve(result);
      };

      const onComplete = (ev: Event) => {
        const detail = (ev as CustomEvent<UiStudioBetaGenerateResult>).detail;
        if (detail?.preference_recovery) {
          onProgress?.(detail.preference_recovery_question || 'Preference recovery needed', 'warn');
          finish({ ...detail, ok: false, preference_recovery: true });
          return;
        }
        if (detail?.ok === false) {
          onProgress?.(detail.error || 'UI Studio Beta generation failed', 'error');
          finish(detail);
          return;
        }
        onProgress?.(detail?.user_visible_stage || 'Ready in preview', 'success');
        finish({ ok: true, ...detail });
      };

      window.addEventListener(NEBULA_UI_STUDIO_BETA_COMPLETE, onComplete as EventListener);

      const pollTimer = window.setInterval(() => {
        void fetchJson<{ user_visible_stage?: string }>(withProjectQuery('/api/ui-studio-beta/status'), {
          credentials: 'include',
          headers: getGrokRequestHeaders(),
        })
          .then((st) => {
            if (st.user_visible_stage) onProgress?.(st.user_visible_stage, 'info');
          })
          .catch(() => undefined);
      }, 1200);

      const timeout = window.setTimeout(() => {
        finish({ ok: false, error: 'UI Studio Beta generation timed out' });
      }, 360_000);

      // Delay so IdeUiStudioBeta can mount before handling the run event.
      window.setTimeout(() => {
        dispatchUiStudioBetaRun({
          projectName: options.projectName,
          pageName: options.pageName,
          autoTriggered: options.autoTriggered,
          regenerate: options.regenerate,
          preferenceFeedback: options.preferenceFeedback,
          guidedImprovement: options.guidedImprovement,
          writtenPaths: options.writtenPaths,
          uiPhase: options.uiPhase,
        });
      }, 400);
    });
  })().finally(() => {
    inFlight = null;
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
 * After successful apply of UI-relevant files: one post-code UI Gen cycle
 * (plan + file grounding). Max one automatic pass per project session.
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
    // Bootstrap authority decides pre-code mockup vs post-code bridge / live entry.
    options.onProgress?.(
      'Post-code UI refresh already ran — reloading Preview (mockup does not own live entry; open Generate UI for Studio only)',
      'info',
    );
    try {
      window.dispatchEvent(new CustomEvent('nebula-reload-app-preview'));
      window.dispatchEvent(new CustomEvent('nebula-open-app-preview'));
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
  markPostCodeUiRefreshDone(projectKey);

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
