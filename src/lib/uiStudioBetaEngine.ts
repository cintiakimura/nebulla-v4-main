/**
 * UI Studio Beta engine client — active generator after successful file apply.
 * Original UI Studio / V0 remains available manually but is not auto-started.
 *
 * Trigger flow: open Beta pane → dispatch run event → IdeUiStudioBeta owns the API call
 * (so stage UI stays in sync). Completes when nebula-ui-studio-beta-complete fires.
 */

import { fetchJson } from './apiFetch';
import type { GrokActivityProgressFn } from './ideGrokActivityStatus';
import { getGrokRequestHeaders } from './grokUserKey';
import { withProjectQuery } from './nebulaProjectApi';
import { dispatchOpenCenterPanel } from '@/components/ide/IdeCenterTabsContext';

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
          ? 'Files applied — starting UI Studio Beta generation…'
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

/** After successful apply-generated of UI-relevant files. */
export async function triggerUiStudioBetaAfterFilesApplied(options: {
  writtenPaths: string[];
  projectName?: string;
  onProgress?: GrokActivityProgressFn;
}): Promise<UiStudioBetaGenerateResult | null> {
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
