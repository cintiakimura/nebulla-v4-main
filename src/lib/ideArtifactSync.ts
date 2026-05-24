import { fetchJson } from './apiFetch';
import { withProjectBody, withProjectQuery } from './nebulaProjectApi';

export type IdeArtifactSyncResult = {
  masterPlanTabs?: number;
  mindMapSynced?: boolean;
  previewIndexWritten?: boolean;
  basicUiWritten?: string[];
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
            seedBasicUi: Boolean(options?.seedBasicUi),
          }),
        ),
      },
    );
  } catch (e) {
    console.warn('[ideArtifactSync]', e);
    return {};
  }
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
