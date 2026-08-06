/**
 * UI Studio Beta engine client.
 * Default inference-first: mockup after Master Plan + ui-brief (before coding finishes).
 * Post-file-apply refresh remains optional and is skipped when early mockup already ran.
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
  clearUiMockupStageFlags,
  hasPersistedUiMockup,
  wasUiMockupStageStarted,
} from './uiMockupGate';

export const NEBULA_UI_STUDIO_BETA_RUN = 'nebula-ui-studio-beta-run';
export const NEBULA_UI_STUDIO_BETA_COMPLETE = 'nebula-ui-studio-beta-complete';

const UI_RELEVANT =
  /\.(tsx|jsx|vue|html|css)$|^(app|src|pages|components|public)\//i;

export function looksLikeUiRelevantPaths(writtenPaths: string[]): boolean {
  return writtenPaths.some((p) => UI_RELEVANT.test(p.replace(/\\/g, '/')));
}

export type UiStudioBetaGenerateOptions = {
  projectName?: string;
  pageName?: string;
  autoTriggered?: boolean;
  regenerate?: boolean;
  preferenceFeedback?: string;
  guidedImprovement?: boolean;
  writtenPaths?: string[];
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

    onProgress?.(
      options.regenerate
        ? 'Generate again — UI Studio Beta engine…'
        : options.autoTriggered
          ? options.writtenPaths?.length
            ? 'Files applied — refreshing UI Studio Beta…'
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
    const data = await fetchJson<{ ok?: boolean; error?: string }>(
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
    onProgress?.('UI Studio Beta applied to App Preview', 'success');
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

/** After successful apply-generated of UI-relevant files (optional refine). */
export async function triggerUiStudioBetaAfterFilesApplied(options: {
  writtenPaths: string[];
  projectName?: string;
  onProgress?: GrokActivityProgressFn;
  /** Force refine even if plan-first mockup already ran. */
  force?: boolean;
}): Promise<UiStudioBetaGenerateResult | null> {
  // Skip only when a real mockup exists on disk — session flag alone is not enough
  // (false "already generated" left Studio on Waiting + cyan App Preview).
  if (!options.force && wasUiMockupStageStarted()) {
    const persisted = await hasPersistedUiMockup();
    if (persisted) {
      const applied = await applyUiStudioBetaToAppPreview(options.onProgress);
      if (applied.ok) {
        options.onProgress?.(
          'UI mockup already on disk — synced to App Preview (skipped re-generation)',
          'info',
        );
        return null;
      }
      options.onProgress?.(
        'UI mockup meta exists — skipping re-generation (open UI Studio Beta → Generate if preview is empty)',
        'info',
      );
      return null;
    }
    clearUiMockupStageFlags();
    options.onProgress?.(
      'Prior mockup flag was empty — regenerating UI Gen so Studio and App Preview connect',
      'warn',
    );
  }

  const paths = options.writtenPaths || [];
  if (!looksLikeUiRelevantPaths(paths)) {
    options.onProgress?.(
      'Files applied — UI Beta not started (no app/UI shell files in this slice)',
      'info',
    );
    return null;
  }

  const key = `${options.projectName || ''}:${paths.slice().sort().join('|')}`;
  if (key === lastAutoKey && inFlight) {
    return inFlight;
  }
  lastAutoKey = key;

  return runUiStudioBetaGeneration({
    projectName: options.projectName,
    writtenPaths: paths,
    autoTriggered: true,
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
    openPane: true,
    onProgress: options.onProgress,
  });
}
