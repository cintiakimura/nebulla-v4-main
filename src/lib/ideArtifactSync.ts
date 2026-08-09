import { fetchJson } from './apiFetch';
import type { GrokActivityProgressFn } from './ideGrokActivityStatus';
import { startGrokActivityWaitTicker } from './ideGrokActivityStatus';
import { withProjectBody, withProjectQuery } from './nebulaProjectApi';
import { runV0GenerationWithPolling } from './v0GenerationClient';
import { getV0RequestHeaders, hasLocalV0ApiKey } from './v0Key';
import { computeV0Readiness } from './v0Readiness';

const ideArtifactHeaders = (): Record<string, string> => ({
  'Content-Type': 'application/json',
  ...getV0RequestHeaders(),
});

export type IdeArtifactSyncResult = {
  masterPlanTabs?: number;
  v0PromptWritten?: boolean;
  mindMapSynced?: boolean;
  mindMapPageCount?: number;
  mindMapRouteCount?: number;
  previewIndexWritten?: boolean;
  basicUiWritten?: string[];
  uiStudioUnlocked?: boolean;
  /** Soft-fail markers — never means coding apply failed. */
  timedOut?: boolean;
  softFailed?: boolean;
};

export type MasterPlanUiPipelineResult = {
  ok?: boolean;
  v0PromptWritten?: boolean;
  v0PromptPath?: string;
  mindMapSynced?: boolean;
  mindMapPageCount?: number;
  mindMapRouteCount?: number;
  v0Triggered?: boolean;
  v0Ok?: boolean;
  v0Error?: string;
  v0Written?: string[];
  hasRealV0?: boolean;
};

/**
 * After Master Plan save: mind map (§4); optional prompt file sync on server.
 * Auto-V0 is never started from this helper — Beta is the automatic UI path.
 * Legacy V0 status strings are intentionally never emitted here.
 */
export async function runMasterPlanUiPipeline(options?: {
  projectName?: string;
  autoV0?: boolean;
  /** @deprecated Ignored — pipeline is always quiet for V0 (Beta is auto path). */
  quietV0Status?: boolean;
  onProgress?: GrokActivityProgressFn;
}): Promise<MasterPlanUiPipelineResult> {
  const onProgress = options?.onProgress;
  try {
    onProgress?.('Syncing mind map from Master Plan…', 'info');
    const stopWait = startGrokActivityWaitTicker('Syncing mind map on server', (msg, kind, opts) =>
      onProgress?.(msg, kind, opts),
    );
    let result: MasterPlanUiPipelineResult;
    const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId =
      ac && typeof window !== 'undefined'
        ? window.setTimeout(() => ac.abort(), 90_000)
        : null;
    try {
      result = await Promise.race([
        fetchJson<MasterPlanUiPipelineResult>(withProjectQuery('/api/ide/master-plan-ui-pipeline'), {
          method: 'POST',
          headers: ideArtifactHeaders(),
          credentials: 'include',
          signal: ac?.signal,
          body: JSON.stringify(
            withProjectBody({
              projectName: options?.projectName?.trim() || undefined,
              autoV0: false,
            }),
          ),
        }),
        rejectAfterMs(90_000, 'Mind map sync timed out'),
      ]);
    } finally {
      if (timeoutId != null) window.clearTimeout(timeoutId);
      stopWait();
    }
    if ((result.mindMapPageCount ?? 0) > 0) {
      onProgress?.(`Mind map synced — ${result.mindMapPageCount} page node(s)`, 'success');
    } else {
      onProgress?.('Mind map sync finished', 'info');
    }
    return { ...result, v0Triggered: false };
  } catch (e) {
    console.warn('[ideArtifactSync] master-plan-ui-pipeline:', e);
    const msg = e instanceof Error ? e.message : 'Mind map sync failed';
    onProgress?.(
      msg.includes('fetch failed') || msg.includes('Failed to fetch') || /timed out|aborted/i.test(msg)
        ? 'Mind map sync timed out — retry from Master Plan'
        : 'Mind map sync request failed',
      'error',
    );
    return {};
  }
}

/** Manual v0 only — call explicitly from original UI Studio / Resume. */
export async function runV0UiGeneration(options?: {
  projectName?: string;
  onProgress?: GrokActivityProgressFn;
  resumeOnly?: boolean;
}): Promise<MasterPlanUiPipelineResult> {
  let studioStatus: Awaited<ReturnType<typeof fetchV0StudioStatus>> = null;
  try {
    studioStatus = await fetchV0StudioStatus();
  } catch {
    /* ignore */
  }
  const readiness = computeV0Readiness({
    hasV0ApiKey: studioStatus?.hasV0ApiKey,
    hasLocalV0ApiKey: hasLocalV0ApiKey(),
    v0PromptExists: studioStatus?.v0PromptExists,
    v0PromptLength: studioStatus?.v0PromptLength,
    v0Starting: studioStatus?.v0Starting,
    v0PendingChatId: studioStatus?.v0PendingChatId,
    v0StartError: studioStatus?.v0StartError,
    hasRealV0: studioStatus?.hasRealV0,
  });
  if (!readiness.ready && !readiness.resumeOnly) {
    const msg = readiness.blockReason ?? 'v0 is not ready — save Master Plan §4+§5 and add your API key.';
    options?.onProgress?.(msg, 'error');
    return {
      v0Triggered: true,
      v0Ok: false,
      v0Error: msg,
      hasRealV0: Boolean(studioStatus?.hasRealV0),
    };
  }

  const v0 = await runV0GenerationWithPolling({
    projectDisplayName: options?.projectName,
    onProgress: options?.onProgress,
    resumeOnly: options?.resumeOnly ?? readiness.resumeOnly,
  });
  if (v0.demoUrl?.trim()) {
    try {
      window.dispatchEvent(
        new CustomEvent('nebula-v0-demo-ready', { detail: { demoUrl: v0.demoUrl.trim() } }),
      );
    } catch {
      /* ignore */
    }
  }
  return {
    v0Triggered: true,
    v0Ok: Boolean(v0.ok && (v0.written?.length ?? 0) > 0),
    v0Written: v0.written,
    v0Error: v0.error,
    hasRealV0: Boolean(v0.written?.length),
  };
}

async function fetchV0StudioStatus(): Promise<{
  hasV0ApiKey?: boolean;
  v0PromptExists?: boolean;
  v0PromptLength?: number;
  v0Starting?: boolean;
  v0PendingChatId?: string;
  v0StartError?: string;
  hasRealV0?: boolean;
} | null> {
  return fetchJson(withProjectQuery('/api/nebula-ui-studio/status'), {
    credentials: 'include',
    headers: ideArtifactHeaders(),
  });
}

/** Master Plan + mind map; V0 only when autoV0 === true (manual/legacy). */
export async function runMasterPlanUiPipelineWithV0(options?: {
  projectName?: string;
  autoV0?: boolean;
  onProgress?: GrokActivityProgressFn;
}): Promise<MasterPlanUiPipelineResult> {
  const base = await runMasterPlanUiPipeline({
    ...options,
    autoV0: false,
  });
  if (options?.autoV0 !== true || base.hasRealV0) return base;
  const v0 = await runV0UiGeneration({
    projectName: options?.projectName,
    onProgress: options?.onProgress,
  });
  return { ...base, ...v0 };
}

/** Client hard timeout — AbortController alone is insufficient when fetch never settles. */
export const ARTIFACT_SYNC_TIMEOUT_MS = 60_000;

const ARTIFACT_SYNC_WAIT_LABEL = 'Syncing project artifacts (Master Plan, mind map)';

/** Single-flight owner so duplicate post-apply callers cannot stack forever-running rows. */
let artifactSyncInFlight: Promise<IdeArtifactSyncResult> | null = null;

/** Test helper — clears in-flight mutex. */
export function resetArtifactSyncInFlightForTests(): void {
  artifactSyncInFlight = null;
}

export function rejectAfterMs(ms: number, message: string): Promise<never> {
  return new Promise((_, reject) => {
    const id =
      typeof window !== 'undefined'
        ? window.setTimeout(() => reject(new Error(message)), ms)
        : setTimeout(() => reject(new Error(message)), ms);
    // Attach for GC clarity in environments that support unref
    void id;
  });
}

export function isArtifactSyncTimeoutError(e: unknown): boolean {
  if (typeof DOMException !== 'undefined' && e instanceof DOMException && e.name === 'AbortError') {
    return true;
  }
  const msg = e instanceof Error ? e.message : String(e);
  return /aborted|abort|timeout|timed out/i.test(msg);
}

/**
 * Race a promise against a hard wall-clock timeout. Always settles.
 * Pure helper — unit-tested without network.
 */
export async function withHardTimeout<T>(
  work: Promise<T>,
  ms: number,
  timeoutMessage: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMessage)), ms);
  });
  try {
    return await Promise.race([work, timeoutPromise]);
  } finally {
    if (timer != null) clearTimeout(timer);
  }
}

/** After coding / file apply: Master Plan bootstrap + mind map (no V0 status noise). */
export async function syncIdeProjectArtifacts(options?: {
  userNote?: string;
  projectName?: string;
  seedBasicUi?: boolean;
  onProgress?: GrokActivityProgressFn;
  /** Override timeout (tests). */
  timeoutMs?: number;
}): Promise<IdeArtifactSyncResult> {
  if (artifactSyncInFlight) {
    options?.onProgress?.(
      'Artifact sync already running — waiting on the same job…',
      'wait',
      { currentOnly: true },
    );
    return artifactSyncInFlight;
  }

  const run = runSyncIdeProjectArtifactsOnce(options).finally(() => {
    artifactSyncInFlight = null;
  });
  artifactSyncInFlight = run;
  return run;
}

async function runSyncIdeProjectArtifactsOnce(options?: {
  userNote?: string;
  projectName?: string;
  seedBasicUi?: boolean;
  onProgress?: GrokActivityProgressFn;
  timeoutMs?: number;
}): Promise<IdeArtifactSyncResult> {
  const onProgress = options?.onProgress;
  const timeoutMs = options?.timeoutMs ?? ARTIFACT_SYNC_TIMEOUT_MS;
  const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const abortTimer =
    ac && typeof window !== 'undefined'
      ? window.setTimeout(() => {
          try {
            ac.abort();
          } catch {
            /* ignore */
          }
        }, timeoutMs)
      : null;

  // Use wait kind so the chat spinner is owned by this phase and cleared on terminal kinds.
  const stopWait = startGrokActivityWaitTicker(ARTIFACT_SYNC_WAIT_LABEL, (msg, kind, opts) =>
    onProgress?.(msg, kind, opts),
  );

  try {
    const sync = await withHardTimeout(
      fetchJson<IdeArtifactSyncResult>(withProjectQuery('/api/ide/sync-project-artifacts'), {
        method: 'POST',
        headers: ideArtifactHeaders(),
        credentials: 'include',
        signal: ac?.signal,
        body: JSON.stringify(
          withProjectBody({
            userNote: options?.userNote?.trim() || undefined,
            projectName: options?.projectName?.trim() || undefined,
            seedBasicUi: options?.seedBasicUi === true,
          }),
        ),
      }),
      timeoutMs,
      'Artifact sync timed out',
    );
    if ((sync.masterPlanTabs ?? 0) > 0) {
      onProgress?.(
        `Bootstrapped ${sync.masterPlanTabs} empty Master Plan tab(s) from workspace`,
        'success',
      );
    }
    if ((sync.mindMapPageCount ?? 0) > 0) {
      onProgress?.(`Mind map: ${sync.mindMapPageCount} page(s)`, 'success');
    }
    onProgress?.('Artifact sync done', 'success');
    return sync;
  } catch (e) {
    console.warn('[ideArtifactSync]', e);
    const timedOut = isArtifactSyncTimeoutError(e);
    onProgress?.(
      timedOut
        ? 'Artifact sync timed out/skipped — files already applied; continuing'
        : 'Artifact sync failed/skipped — files already applied; continuing',
      'warn',
    );
    return { timedOut, softFailed: true };
  } finally {
    stopWait();
    if (abortTimer != null) window.clearTimeout(abortTimer);
  }
}

export async function syncMindMapForProject(
  projectName?: string,
  onProgress?: GrokActivityProgressFn,
  timeoutMs: number = ARTIFACT_SYNC_TIMEOUT_MS,
): Promise<{
  ok: boolean;
  pageCount: number;
}> {
  const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId =
    ac && typeof window !== 'undefined'
      ? window.setTimeout(() => ac.abort(), timeoutMs)
      : null;
  try {
    onProgress?.('Syncing mind map from Master Plan §4…', 'info');
    const data = await withHardTimeout(
      fetchJson<{ pages?: unknown[]; routeCount?: number }>(
        withProjectQuery('/api/workspace/mind-map/sync-from-master-plan'),
        {
          method: 'POST',
          headers: ideArtifactHeaders(),
          credentials: 'include',
          signal: ac?.signal,
          body: JSON.stringify(withProjectBody({ projectName: projectName?.trim() || undefined })),
        },
      ),
      timeoutMs,
      'Mind map sync timed out',
    );
    const pageCount = Array.isArray(data.pages) ? data.pages.length : 0;
    if (pageCount > 0) {
      onProgress?.(`Mind map rebuilt from Master Plan §4 — ${pageCount} page(s)`, 'success');
    }
    return { ok: pageCount > 0, pageCount };
  } catch (e) {
    console.warn('[ideArtifactSync] mind map sync:', e);
    onProgress?.('Mind map sync timed out or failed — continuing', 'warn');
    return { ok: false, pageCount: 0 };
  } finally {
    if (timeoutId != null) window.clearTimeout(timeoutId);
  }
}

/** Run after Grok writes files: artifacts, mind map, then Beta UI events (no auto-V0). */
export async function runPostCodingWorkspaceSync(options?: {
  userNote?: string;
  projectName?: string;
  seedBasicUi?: boolean;
  openMindMap?: boolean;
  onProgress?: GrokActivityProgressFn;
  timeoutMs?: number;
}): Promise<IdeArtifactSyncResult> {
  const onProgress = options?.onProgress;
  // Wall-clock cap for the whole post-apply sync chain (artifacts + optional mind-map retry).
  const budgetMs = options?.timeoutMs ?? ARTIFACT_SYNC_TIMEOUT_MS;
  const started = Date.now();

  try {
    const sync = await syncIdeProjectArtifacts({
      userNote: options?.userNote,
      projectName: options?.projectName,
      seedBasicUi: options?.seedBasicUi,
      onProgress,
      timeoutMs: budgetMs,
    });

    let pageCount = sync.mindMapPageCount ?? 0;
    const remaining = budgetMs - (Date.now() - started);
    if (pageCount === 0 && remaining > 2_000 && !sync.timedOut) {
      const mm = await syncMindMapForProject(options?.projectName, onProgress, Math.min(remaining, 30_000));
      pageCount = mm.pageCount;
      sync.mindMapSynced = mm.ok;
      sync.mindMapPageCount = pageCount;
    }

    try {
      onProgress?.('Refreshing explorer, preview, and mind map views', 'info');
      if ((sync.masterPlanTabs ?? 0) > 0) {
        window.dispatchEvent(new CustomEvent('nebula-master-plan-updated'));
      }
      window.dispatchEvent(new CustomEvent('nebula-mind-map-updated'));
      if (options?.openMindMap !== false && pageCount > 0) {
        window.dispatchEvent(new CustomEvent('nebula-open-mind-map'));
      }
      window.dispatchEvent(new CustomEvent('nebula-files-applied'));
      window.dispatchEvent(new CustomEvent('nebula-open-app-preview'));
      window.dispatchEvent(new CustomEvent('nebula-open-ui-studio-beta'));
      try {
        const { dispatchOpenUiStudioBeta } = await import('./uiStudioBetaEngine');
        dispatchOpenUiStudioBeta();
      } catch {
        /* ignore */
      }
      onProgress?.(
        sync.timedOut || sync.softFailed
          ? 'Workspace sync skipped/soft — UI Studio Beta next'
          : 'Workspace sync complete — UI Studio Beta next',
        sync.timedOut || sync.softFailed ? 'warn' : 'success',
      );
    } catch {
      /* ignore */
    }

    return sync;
  } catch (e) {
    // Must never throw out of post-apply sync — files already applied.
    console.warn('[ideArtifactSync] post-coding sync:', e);
    onProgress?.(
      'Artifact sync timed out/skipped — files already applied; continuing',
      'warn',
    );
    try {
      window.dispatchEvent(new CustomEvent('nebula-files-applied'));
      window.dispatchEvent(new CustomEvent('nebula-open-app-preview'));
    } catch {
      /* ignore */
    }
    return { timedOut: true, softFailed: true };
  }
}

export async function seedBasicUiFallback(projectName?: string): Promise<string[]> {
  try {
    const data = await fetchJson<{ written?: string[] }>(
      withProjectQuery('/api/nebula-ui-studio/basic-scaffold'),
      {
        method: 'POST',
        headers: ideArtifactHeaders(),
        credentials: 'include',
        body: JSON.stringify(withProjectBody({ projectDisplayName: projectName })),
      },
    );
    return Array.isArray(data.written) ? data.written : [];
  } catch {
    return [];
  }
}
