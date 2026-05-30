import { fetchJson } from './apiFetch';
import { clearIdeWorkspaceMetaCache } from './ideWorkspaceChatContext';
import { withProjectBody, withProjectQuery } from './nebulaProjectApi';

export type ProjectResetResult = {
  ok?: boolean;
  cleared?: string[];
  removed?: string[];
  chatCleared?: boolean;
  error?: string;
};

/** Browser-only discovery flags — cleared on project reset. */
export const NEBULA_ONBOARDING_DONE_KEY = 'nebula_onboarding_autopilot_done';
/** Alias for AssistantSidebar and other callers. */
export const ONBOARDING_DONE_KEY = NEBULA_ONBOARDING_DONE_KEY;
/** @deprecated legacy typo — cleared on reset for migration */
const LEGACY_NEBULLA_ONBOARDING_DONE_KEY = 'nebulla_onboarding_autopilot_done';

export function readOnboardingAutopilotDone(): boolean {
  try {
    if (localStorage.getItem(NEBULA_ONBOARDING_DONE_KEY) === '1') return true;
    if (localStorage.getItem(LEGACY_NEBULLA_ONBOARDING_DONE_KEY) === '1') {
      localStorage.setItem(NEBULA_ONBOARDING_DONE_KEY, '1');
      localStorage.removeItem(LEGACY_NEBULLA_ONBOARDING_DONE_KEY);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function clearProjectDiscoveryClientState(): void {
  try {
    localStorage.removeItem(NEBULA_ONBOARDING_DONE_KEY);
    localStorage.removeItem(LEGACY_NEBULLA_ONBOARDING_DONE_KEY);
    localStorage.removeItem('nebula_master_plan_open_tab');
    localStorage.removeItem('nebula_auto_start_chat');
    localStorage.removeItem('nebula_initial_prompt');
  } catch {
    /* ignore */
  }
}

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
    clearProjectDiscoveryClientState();
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
