/**
 * Client for workspace Deploy / Build check (product app root).
 * Does not trigger Nebulla platform Render redeploy.
 */
import { fetchJson } from './apiFetch';
import { getBrowserProjectName, withProjectBody, withProjectQuery } from './nebulaProjectApi';
import { writeStoredWorkspaceLiveUrl } from './workspaceLiveUrl';

export type WorkspaceDeployResult = {
  ok: boolean;
  mode?: string;
  runnable?: boolean;
  appRootRel?: string;
  framework?: string;
  buildOk?: boolean;
  installOk?: boolean;
  logSnippet?: string;
  error?: string;
  url?: string | null;
  nextStep?: string;
  runnableStatusLine?: string;
};

export async function fetchRunnableStatus(): Promise<{
  ok: boolean;
  runnable?: boolean;
  deployable?: boolean;
  runnableStatusLine?: string;
  framework?: string;
  error?: string;
}> {
  return fetchJson(withProjectQuery('/api/workspace/runnable-status'), {
    credentials: 'include',
    cache: 'no-store',
  });
}

export async function runWorkspaceDeployOrBuildCheck(options?: {
  skipInstall?: boolean;
  projectName?: string;
}): Promise<WorkspaceDeployResult> {
  try {
    const result = await fetchJson<WorkspaceDeployResult>(withProjectQuery('/api/workspace/deploy'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        withProjectBody({
          projectName: options?.projectName?.trim() || getBrowserProjectName().trim() || undefined,
          skipInstall: options?.skipInstall === true,
        }),
      ),
    });
    if (result.url) writeStoredWorkspaceLiveUrl(result.url);
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Deploy / build check failed';
    return { ok: false, mode: 'build_check', error: msg, url: null };
  }
}

export function dispatchWorkspaceDeploy(): void {
  try {
    window.dispatchEvent(new CustomEvent('nebula-workspace-deploy'));
  } catch {
    /* ignore */
  }
}
