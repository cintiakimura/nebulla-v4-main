/**
 * Nebulla cloud layer: Render PostgreSQL via same-origin Express API (cookie session).
 */

import { readResponseJson } from './apiFetch';
import { fetchNebulaPublicConfig, type NebulaPublicConfig } from './nebulaPublicConfig';
import { fireSilentProjectManager } from './projectManagerClient';
import {
  clearActiveGuestProjectId,
  createGuestProject,
  readActiveGuestProjectId,
  readGuestIndex,
  writeActiveGuestProjectId,
} from './nebulaProjectStore';
import {
  getBrowserProjectKey,
  getBrowserProjectName,
  setBrowserProjectKey,
  setBrowserProjectName,
} from './nebulaProjectApi';

const ACTIVE_CLOUD_PROJECT_NAME_KEY = 'nebula_active_cloud_project_name_v1';

function sanitizeBrowserProjectKey(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  return cleaned || 'default';
}

export type NebulaSessionUser = {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  role?: 'user' | 'admin';
  provider?: string;
  providerUserId?: string | null;
  accountEmail?: string | null;
  signedUpAt?: string | null;
  hasPassword?: boolean;
  /** From `nebula_users.billing_tier` — `free` | `pro` | `power`. */
  billingTier?: 'free' | 'pro' | 'power';
};

export async function fetchSessionUser(): Promise<NebulaSessionUser | null> {
  try {
    const res = await fetch('/api/auth/session', { credentials: 'include' });
    const data = await readResponseJson<{ user?: NebulaSessionUser | null }>(res);
    if (!res.ok || !data.user) return null;
    const u = data.user;
    return {
      ...u,
      role: u.role === 'admin' ? 'admin' : 'user',
      billingTier: u.billingTier === 'pro' || u.billingTier === 'power' ? u.billingTier : 'free',
    };
  } catch {
    return null;
  }
}

export async function logoutNebula(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
}

/** Permanently deletes the signed-in user; `confirmation` must be exactly `DELETE MY ACCOUNT`. */
export async function deleteNebullaAccount(confirmation: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('/api/auth/delete-account', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmation }),
  });
  const data = await readResponseJson<{ ok?: boolean; error?: string }>(res);
  if (!res.ok) {
    return { ok: false, error: typeof data.error === 'string' ? data.error : 'Request failed' };
  }
  return { ok: Boolean(data.ok) };
}

export type CloudProjectRow = {
  name: string;
  pages: unknown;
  edges: unknown;
  workspace_id?: string | null;
  updated_at: string;
};

export async function listCloudProjects(): Promise<CloudProjectRow[]> {
  const res = await fetch('/api/projects', { credentials: 'include' });
  if (res.status === 401) return [];
  if (!res.ok) return [];
  const data = await readResponseJson<{ projects: CloudProjectRow[] }>(res);
  return data.projects || [];
}

export async function getCloudProject(name: string): Promise<CloudProjectRow | null> {
  const res = await fetch(`/api/projects?name=${encodeURIComponent(name)}`, { credentials: 'include' });
  if (!res.ok) return null;
  const data = await readResponseJson<{ project: CloudProjectRow | null }>(res);
  return data.project ?? null;
}

export async function upsertCloudProject(payload: {
  name: string;
  pages: unknown;
  edges: unknown;
}): Promise<boolean> {
  const res = await fetch('/api/projects', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return false;
  void fireSilentProjectManager({ projectName: payload.name });
  return true;
}

export async function deleteCloudProject(name: string): Promise<boolean> {
  const res = await fetch(`/api/projects/${encodeURIComponent(name)}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  return res.ok;
}

/**
 * Align browser `projectKey` / `projectName` with the signed-in user's cloud project so
 * `/api/files/*`, Grok coding, and the explorer target the same workspace as the server DB.
 */
export async function syncActiveCloudProjectFromSession(): Promise<{
  synced: boolean;
  projectName?: string;
  projectKey?: string;
}> {
  const user = await fetchSessionUser();
  if (!user?.uid) return { synced: false };

  const projects = await listCloudProjects();
  if (projects.length === 0) return { synced: false };

  let preferredName = '';
  try {
    preferredName = localStorage.getItem(ACTIVE_CLOUD_PROJECT_NAME_KEY)?.trim() || '';
  } catch {
    /* ignore */
  }

  let row = preferredName ? projects.find((p) => p.name === preferredName) : undefined;
  if (!row) row = projects[0];

  const name = row.name.trim() || 'Untitled project';
  const diskKey = sanitizeBrowserProjectKey(
    (row.workspace_id && String(row.workspace_id).trim()) || name,
  );

  setBrowserProjectName(name);
  setBrowserProjectKey(diskKey);
  const guestActive = readActiveGuestProjectId();
  if (guestActive) clearActiveGuestProjectId();

  try {
    localStorage.setItem(ACTIVE_CLOUD_PROJECT_NAME_KEY, name);
  } catch {
    /* ignore */
  }

  try {
    window.dispatchEvent(
      new CustomEvent('nebula-workspace-context-synced', {
        detail: { projectName: name, projectKey: diskKey },
      }),
    );
  } catch {
    /* ignore */
  }

  return { synced: true, projectName: name, projectKey: diskKey };
}

function dispatchWorkspaceSynced(projectName: string, projectKey: string): void {
  try {
    window.dispatchEvent(
      new CustomEvent('nebula-workspace-context-synced', {
        detail: { projectName, projectKey },
      }),
    );
  } catch {
    /* ignore */
  }
}

/** Select a cloud project by display name (must exist for the signed-in user). */
export async function selectCloudProjectByName(name: string): Promise<boolean> {
  const trimmed = name.trim();
  if (!trimmed) return false;
  const projects = await listCloudProjects();
  const row = projects.find((p) => p.name === trimmed);
  if (!row) return false;

  const diskKey = sanitizeBrowserProjectKey(
    (row.workspace_id && String(row.workspace_id).trim()) || trimmed,
  );
  setBrowserProjectName(trimmed);
  setBrowserProjectKey(diskKey);
  clearActiveGuestProjectId();
  try {
    localStorage.setItem(ACTIVE_CLOUD_PROJECT_NAME_KEY, trimmed);
  } catch {
    /* ignore */
  }
  dispatchWorkspaceSynced(trimmed, diskKey);
  return true;
}

/** Create (or update) a cloud project and make it active in the browser. */
export async function createAndSelectCloudProject(name: string): Promise<boolean> {
  const trimmed = name.trim() || 'Untitled Project';
  const ok = await upsertCloudProject({ name: trimmed, pages: [], edges: [] });
  if (!ok) return false;
  return selectCloudProjectByName(trimmed);
}

/** Local guest workspace (no GitHub) — for dev / try-before-login. */
export function bindGuestWorkspace(): { projectName: string; projectKey: string } {
  let key = getBrowserProjectKey();
  let name = getBrowserProjectName().trim();

  const guestId = readActiveGuestProjectId();
  const rows = readGuestIndex();
  if (guestId && rows.some((r) => r.id === guestId)) {
    key = guestId;
    name = rows.find((r) => r.id === guestId)?.name?.trim() || name || 'Local project';
  } else if (!name || key === 'default') {
    const entry = createGuestProject({
      pages: [],
      edges: [],
      projectName: 'Local project',
    });
    key = entry.id;
    name = entry.name;
    writeActiveGuestProjectId(key);
  }

  setBrowserProjectKey(key);
  setBrowserProjectName(name);
  dispatchWorkspaceSynced(name, key);
  return { projectName: name, projectKey: key };
}

export type WorkspaceReadyResult =
  | { status: 'loading' }
  | { status: 'no_database'; config: NebulaPublicConfig }
  | { status: 'needs_login'; config: NebulaPublicConfig }
  | { status: 'needs_project'; config: NebulaPublicConfig; user: NebulaSessionUser; projects: CloudProjectRow[] }
  | {
      status: 'ready';
      user: NebulaSessionUser | null;
      projectName: string;
      projectKey: string;
      mode: 'cloud' | 'guest';
    }
  | { status: 'error'; message: string };

/**
 * Ensure the signed-in user has a cloud project and browser projectKey/projectName match the DB workspace.
 * Call on IDE load and after GitHub OAuth.
 */
export async function ensureCloudWorkspaceReady(): Promise<WorkspaceReadyResult> {
  const config = await fetchNebulaPublicConfig();
  if (!config.cloudStorageReady) {
    return { status: 'no_database', config };
  }

  const user = await fetchSessionUser();
  if (!user?.uid) {
    return { status: 'needs_login', config };
  }

  let projects = await listCloudProjects();
  if (projects.length === 0) {
    const created = await createAndSelectCloudProject('Untitled Project');
    if (!created) {
      return {
        status: 'error',
        message: 'Signed in, but could not create your first cloud project. Check server logs and DATABASE_URL.',
      };
    }
    projects = await listCloudProjects();
  }

  if (projects.length === 1) {
    const sync = await syncActiveCloudProjectFromSession();
    if (!sync.synced || !sync.projectName || !sync.projectKey) {
      return { status: 'error', message: 'Could not bind workspace context for this project.' };
    }
    return {
      status: 'ready',
      user,
      projectName: sync.projectName,
      projectKey: sync.projectKey,
      mode: 'cloud',
    };
  }

  let preferredName = '';
  try {
    preferredName = localStorage.getItem(ACTIVE_CLOUD_PROJECT_NAME_KEY)?.trim() || '';
  } catch {
    /* ignore */
  }
  if (preferredName && projects.some((p) => p.name === preferredName)) {
    const sync = await syncActiveCloudProjectFromSession();
    if (sync.synced && sync.projectName && sync.projectKey) {
      return {
        status: 'ready',
        user,
        projectName: sync.projectName,
        projectKey: sync.projectKey,
        mode: 'cloud',
      };
    }
  }

  return { status: 'needs_project', config, user, projects };
}
