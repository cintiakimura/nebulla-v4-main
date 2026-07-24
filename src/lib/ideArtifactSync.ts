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
    try {
      result = await fetchJson<MasterPlanUiPipelineResult>(
        withProjectQuery('/api/ide/master-plan-ui-pipeline'),
        {
          method: 'POST',
          headers: ideArtifactHeaders(),
          credentials: 'include',
          body: JSON.stringify(
            withProjectBody({
              projectName: options?.projectName?.trim() || undefined,
              // Never auto-run V0 from Master Plan sync.
              autoV0: false,
            }),
          ),
        },
      );
    } finally {
      stopWait();
    }
    if ((result.mindMapPageCount ?? 0) > 0) {
      onProgress?.(`Mind map synced — ${result.mindMapPageCount} page node(s)`, 'success');
    }
    return { ...result, v0Triggered: false };
  } catch (e) {
    console.warn('[ideArtifactSync] master-plan-ui-pipeline:', e);
    const msg = e instanceof Error ? e.message : 'Mind map sync failed';
    onProgress?.(
      msg.includes('fetch failed') || msg.includes('Failed to fetch')
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

/** After coding / file apply: Master Plan bootstrap + mind map (no V0 status noise). */
export async function syncIdeProjectArtifacts(options?: {
  userNote?: string;
  projectName?: string;
  seedBasicUi?: boolean;
  onProgress?: GrokActivityProgressFn;
}): Promise<IdeArtifactSyncResult> {
  const onProgress = options?.onProgress;
  try {
    onProgress?.('Syncing project artifacts (Master Plan, mind map)…', 'info');
    const sync = await fetchJson<IdeArtifactSyncResult>(
      withProjectQuery('/api/ide/sync-project-artifacts'),
      {
        method: 'POST',
        headers: ideArtifactHeaders(),
        credentials: 'include',
        body: JSON.stringify(
          withProjectBody({
            userNote: options?.userNote?.trim() || undefined,
            projectName: options?.projectName?.trim() || undefined,
            seedBasicUi: options?.seedBasicUi === true,
          }),
        ),
      },
    );
    if ((sync.masterPlanTabs ?? 0) > 0) {
      onProgress?.(`Bootstrapped ${sync.masterPlanTabs} empty Master Plan tab(s) from workspace`, 'success');
    }
    if ((sync.mindMapPageCount ?? 0) > 0) {
      onProgress?.(`Mind map: ${sync.mindMapPageCount} page(s)`, 'success');
    }
    return sync;
  } catch (e) {
    console.warn('[ideArtifactSync]', e);
    onProgress?.('Artifact sync failed', 'error');
    return {};
  }
}

export async function syncMindMapForProject(
  projectName?: string,
  onProgress?: GrokActivityProgressFn,
): Promise<{
  ok: boolean;
  pageCount: number;
}> {
  try {
    onProgress?.('Syncing mind map from Master Plan §4…', 'info');
    const data = await fetchJson<{ pages?: unknown[]; routeCount?: number }>(
      withProjectQuery('/api/workspace/mind-map/sync-from-master-plan'),
      {
        method: 'POST',
        headers: ideArtifactHeaders(),
        credentials: 'include',
        body: JSON.stringify(withProjectBody({ projectName: projectName?.trim() || undefined })),
      },
    );
    const pageCount = Array.isArray(data.pages) ? data.pages.length : 0;
    if (pageCount > 0) {
      onProgress?.(`Mind map rebuilt from Master Plan §4 — ${pageCount} page(s)`, 'success');
    }
    return { ok: pageCount > 0, pageCount };
  } catch (e) {
    console.warn('[ideArtifactSync] mind map sync:', e);
    return { ok: false, pageCount: 0 };
  }
}

/** Run after Grok writes files: artifacts, mind map, then Beta UI events (no auto-V0). */
export async function runPostCodingWorkspaceSync(options?: {
  userNote?: string;
  projectName?: string;
  seedBasicUi?: boolean;
  openMindMap?: boolean;
  onProgress?: GrokActivityProgressFn;
}): Promise<IdeArtifactSyncResult> {
  const onProgress = options?.onProgress;
  const sync = await syncIdeProjectArtifacts({
    userNote: options?.userNote,
    projectName: options?.projectName,
    seedBasicUi: options?.seedBasicUi,
    onProgress,
  });

  let pageCount = sync.mindMapPageCount ?? 0;
  if (pageCount === 0) {
    const mm = await syncMindMapForProject(options?.projectName, onProgress);
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
    // Always open Beta after coding — do not unlock/report old V0 studio.
    window.dispatchEvent(new CustomEvent('nebula-open-ui-studio-beta'));
    try {
      const { dispatchOpenUiStudioBeta } = await import('./uiStudioBetaEngine');
      dispatchOpenUiStudioBeta();
    } catch {
      /* ignore */
    }
    onProgress?.('Workspace sync complete — UI Studio Beta next', 'success');
  } catch {
    /* ignore */
  }

  return sync;
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
