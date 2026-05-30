import { fetchJson } from './apiFetch';
import { clearIdeWorkspaceMetaCache } from './ideWorkspaceChatContext';
import { withProjectBody, withProjectQuery } from './nebulaProjectApi';

export type ProjectResetResult = {
  ok?: boolean;
  cleared?: string[];
  removed?: string[];
  error?: string;
};

/** Cancel stale v0 / Go poll state on the server. */
export async function cancelProjectBackgroundJobs(): Promise<ProjectResetResult> {
  try {
    return await fetchJson<ProjectResetResult>(withProjectQuery('/api/ide/cancel-background-jobs'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(withProjectBody({})),
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Cancel failed' };
  }
}

/** Wipe workspace artifacts and cancel all background jobs — fresh discovery start. */
export async function resetProjectFromScratch(projectName?: string): Promise<ProjectResetResult> {
  try {
    const result = await fetchJson<ProjectResetResult>(
      withProjectQuery('/api/ide/reset-project-scratch'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(withProjectBody({ projectName: projectName?.trim() || undefined })),
      },
    );
    clearIdeWorkspaceMetaCache();
    try {
      window.dispatchEvent(new CustomEvent('nebula-project-reset'));
      window.dispatchEvent(new CustomEvent('nebula-master-plan-updated'));
      window.dispatchEvent(new CustomEvent('nebula-files-applied'));
    } catch {
      /* ignore */
    }
    return result;
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Reset failed' };
  }
}

export async function registerDesignReference(entry: {
  filename: string;
  url?: string;
  storageKey?: string;
  note?: string;
}): Promise<{ ok?: boolean; error?: string }> {
  try {
    return await fetchJson(withProjectQuery('/api/ide/design-references'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(withProjectBody(entry)),
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Save reference failed' };
  }
}
