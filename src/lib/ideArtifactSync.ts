import { fetchJson } from './apiFetch';
import { withProjectBody, withProjectQuery } from './nebulaProjectApi';

export type IdeArtifactSyncResult = {
  masterPlanTabs?: number;
  mindMapSynced?: boolean;
  mindMapPageCount?: number;
  mindMapRouteCount?: number;
  previewIndexWritten?: boolean;
  basicUiWritten?: string[];
  uiStudioUnlocked?: boolean;
};

/** After coding / file apply: fill empty Master Plan, mind map, and preview shell. */
export async function syncIdeProjectArtifacts(options?: {
  userNote?: string;
  projectName?: string;
  seedBasicUi?: boolean;
}): Promise<IdeArtifactSyncResult> {
  try {
    return await fetchJson<IdeArtifactSyncResult>(
      withProjectQuery('/api/ide/sync-project-artifacts'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
  } catch (e) {
    console.warn('[ideArtifactSync]', e);
    return {};
  }
}

export async function syncMindMapForProject(projectName?: string): Promise<{
  ok: boolean;
  pageCount: number;
}> {
  try {
    const data = await fetchJson<{ pages?: unknown[]; routeCount?: number }>(
      withProjectQuery('/api/workspace/mind-map/sync-from-master-plan'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(withProjectBody({ projectName: projectName?.trim() || undefined })),
      },
    );
    const pageCount = Array.isArray(data.pages) ? data.pages.length : 0;
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
}): Promise<IdeArtifactSyncResult> {
  const sync = await syncIdeProjectArtifacts({
    userNote: options?.userNote,
    projectName: options?.projectName,
    seedBasicUi: options?.seedBasicUi,
  });

  let pageCount = sync.mindMapPageCount ?? 0;
  if (pageCount === 0) {
    const mm = await syncMindMapForProject(options?.projectName);
    pageCount = mm.pageCount;
    sync.mindMapSynced = mm.ok;
    sync.mindMapPageCount = pageCount;
  }

  try {
    if ((sync.masterPlanTabs ?? 0) > 0) {
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
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(withProjectBody({ projectDisplayName: projectName })),
      },
    );
    return Array.isArray(data.written) ? data.written : [];
  } catch {
    return [];
  }
}
