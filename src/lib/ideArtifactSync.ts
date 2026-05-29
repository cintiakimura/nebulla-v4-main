import { fetchJson } from './apiFetch';
import type { GrokActivityProgressFn } from './ideGrokActivityStatus';
import { startGrokActivityWaitTicker } from './ideGrokActivityStatus';
import { withProjectBody, withProjectQuery } from './nebulaProjectApi';
import { runV0GenerationWithPolling } from './v0GenerationClient';
import { getV0RequestHeaders } from './v0Key';

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

/** After Master Plan save: v0-prompt.md, mind map (§4), optional auto v0. */
export async function runMasterPlanUiPipeline(options?: {
  projectName?: string;
  autoV0?: boolean;
  onProgress?: GrokActivityProgressFn;
}): Promise<MasterPlanUiPipelineResult> {
  const onProgress = options?.onProgress;
  try {
    onProgress?.('POST /api/ide/master-plan-ui-pipeline (v0 prompt, mind map, optional v0)', 'info');
    const stopWait = startGrokActivityWaitTicker('UI Studio pipeline on server', (msg, kind, options) =>
      onProgress?.(msg, kind, options),
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
              autoV0: options?.autoV0 !== false,
            }),
          ),
        },
      );
    } finally {
      stopWait();
    }
    if (result.v0PromptWritten) {
      onProgress?.('Wrote nebula-ui-studio/v0-prompt.md from Master Plan §4+§5', 'success');
    }
    if ((result.mindMapPageCount ?? 0) > 0) {
      onProgress?.(`Mind map synced — ${result.mindMapPageCount} page node(s)`, 'success');
    }
    if (result.v0Triggered && result.v0Ok) {
      onProgress?.(`v0 UI generated — ${result.v0Written?.length ?? 0} file(s)`, 'success');
    } else if (result.v0Triggered && result.v0Error) {
      onProgress?.(`v0 skipped: ${String(result.v0Error).slice(0, 140)}`, 'warn');
    } else if (result.v0Triggered) {
      onProgress?.('v0 generation attempted', 'info');
    }
    return result;
  } catch (e) {
    console.warn('[ideArtifactSync] master-plan-ui-pipeline:', e);
    const msg = e instanceof Error ? e.message : 'UI Studio pipeline failed';
    onProgress?.(
      msg.includes('fetch failed') || msg.includes('Failed to fetch')
        ? 'UI Studio pipeline timed out on Render — retry Generate UI with v0'
        : 'UI Studio pipeline request failed',
      'error',
    );
    return {};
  }
}

/** v0 via short poll requests (Render-safe). Call after master-plan-ui-pipeline. */
export async function runV0UiGeneration(options?: {
  projectName?: string;
  onProgress?: GrokActivityProgressFn;
  resumeOnly?: boolean;
}): Promise<MasterPlanUiPipelineResult> {
  const v0 = await runV0GenerationWithPolling({
    projectDisplayName: options?.projectName,
    onProgress: options?.onProgress,
    resumeOnly: options?.resumeOnly,
  });
  return {
    v0Triggered: true,
    v0Ok: Boolean(v0.ok && (v0.written?.length ?? 0) > 0),
    v0Written: v0.written,
    v0Error: v0.error,
    hasRealV0: Boolean(v0.written?.length),
  };
}

/** Master Plan save + mind map, then optional v0 (polled). */
export async function runMasterPlanUiPipelineWithV0(options?: {
  projectName?: string;
  autoV0?: boolean;
  onProgress?: GrokActivityProgressFn;
}): Promise<MasterPlanUiPipelineResult> {
  const base = await runMasterPlanUiPipeline({ ...options, autoV0: false });
  if (options?.autoV0 === false || base.hasRealV0) return base;
  const v0 = await runV0UiGeneration({
    projectName: options?.projectName,
    onProgress: options?.onProgress,
  });
  return { ...base, ...v0 };
}

/** After coding / file apply: fill empty Master Plan, mind map, and preview shell. */
export async function syncIdeProjectArtifacts(options?: {
  userNote?: string;
  projectName?: string;
  seedBasicUi?: boolean;
  onProgress?: GrokActivityProgressFn;
}): Promise<IdeArtifactSyncResult> {
  const onProgress = options?.onProgress;
  try {
    onProgress?.('POST /api/ide/sync-project-artifacts', 'info');
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
    if (sync.v0PromptWritten) {
      onProgress?.('Updated v0 prompt from Master Plan', 'success');
    }
    if ((sync.mindMapPageCount ?? 0) > 0) {
      onProgress?.(`Mind map: ${sync.mindMapPageCount} page(s)`, 'success');
    }
    if (sync.uiStudioUnlocked) {
      onProgress?.('UI Studio unlocked for visual editing', 'success');
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
    onProgress?.('POST /api/workspace/mind-map/sync-from-master-plan', 'info');
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

/** Run after Grok writes files: artifacts, mind map, then UI events (correct order). */
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
    if ((sync.masterPlanTabs ?? 0) > 0 || sync.v0PromptWritten) {
      window.dispatchEvent(new CustomEvent('nebula-master-plan-updated'));
    }
    window.dispatchEvent(new CustomEvent('nebula-mind-map-updated'));
    if (options?.openMindMap !== false && pageCount > 0) {
      window.dispatchEvent(new CustomEvent('nebula-open-mind-map'));
    }
    window.dispatchEvent(new CustomEvent('nebula-files-applied'));
    window.dispatchEvent(new CustomEvent('nebula-open-app-preview'));
    if (sync.uiStudioUnlocked) {
      window.dispatchEvent(
        new CustomEvent('nebula-open-ui-studio', { detail: { tab: 'design' as const } }),
      );
    }
    onProgress?.('Workspace sync complete', 'success');
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
