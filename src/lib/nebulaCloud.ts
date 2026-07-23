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
import { clearIdeWorkspaceMetaCache } from './ideWorkspaceChatContext';

const ACTIVE_CLOUD_PROJECT_NAME_KEY = 'nebula_active_cloud_project_name_v1';
const ACTIVE_CLOUD_PROJECT_KEY_LS = 'nebula_active_cloud_project_key_v1';
/** Remember whether the user last used cloud login vs explicit guest (survives refresh). */
const WORKSPACE_MODE_KEY = 'nebula_workspace_mode_v1';

function sanitizeBrowserProjectKey(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  return cleaned || 'default';
}

export type WorkspaceMode = 'cloud' | 'guest';

export function getWorkspaceModePreference(): WorkspaceMode | null {
  try {
    const v = localStorage.getItem(WORKSPACE_MODE_KEY);
    if (v === 'cloud' || v === 'guest') return v;
  } catch {
    /* ignore */
  }
  return null;
}

export function setWorkspaceModePreference(mode: WorkspaceMode): void {
  try {
    localStorage.setItem(WORKSPACE_MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

export function clearWorkspaceModePreference(): void {
  try {
    localStorage.removeItem(WORKSPACE_MODE_KEY);
  } catch {
    /* ignore */
  }
}

function persistActiveCloudSelection(name: string, diskKey: string): void {
  try {
    localStorage.setItem(ACTIVE_CLOUD_PROJECT_NAME_KEY, name);
    localStorage.setItem(ACTIVE_CLOUD_PROJECT_KEY_LS, diskKey);
  } catch {
    /* ignore */
  }
}

/** Early restore of last cloud project name/key (before session sync finishes). */
export function restorePersistedCloudProjectHint(): void {
  try {
    const name = localStorage.getItem(ACTIVE_CLOUD_PROJECT_NAME_KEY)?.trim();
    const key = localStorage.getItem(ACTIVE_CLOUD_PROJECT_KEY_LS)?.trim();
    if (name) setBrowserProjectName(name);
    if (key) setBrowserProjectKey(sanitizeBrowserProjectKey(key));
  } catch {
    /* ignore */
  }
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
    const res = await fetch('/api/auth/session', {
      credentials: 'include',
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    });
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
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include', cache: 'no-store' });
  clearWorkspaceModePreference();
  try {
    localStorage.removeItem(ACTIVE_CLOUD_PROJECT_NAME_KEY);
    localStorage.removeItem(ACTIVE_CLOUD_PROJECT_KEY_LS);
  } catch {
    /* ignore */
  }
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
  d1_database_id?: string | null;
  d1_database_name?: string | null;
  updated_at: string;
};

export type ListCloudProjectsResult = {
  ok: boolean;
  projects: CloudProjectRow[];
  error?: 'unauthorized' | 'unavailable' | 'failed';
};

export async function listCloudProjectsDetailed(): Promise<ListCloudProjectsResult> {
  try {
    const res = await fetch('/api/projects', {
      credentials: 'include',
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (res.status === 401) {
      return { ok: false, projects: [], error: 'unauthorized' };
    }
    if (res.status === 503) {
      return { ok: false, projects: [], error: 'unavailable' };
    }
    if (!res.ok) {
      return { ok: false, projects: [], error: 'failed' };
    }
    const data = await readResponseJson<{ projects: CloudProjectRow[] }>(res);
    return { ok: true, projects: data.projects || [] };
  } catch {
    return { ok: false, projects: [], error: 'failed' };
  }
}

export async function listCloudProjects(): Promise<CloudProjectRow[]> {
  const result = await listCloudProjectsDetailed();
  return result.projects;
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
  clearIdeWorkspaceMetaCache();
  const guestActive = readActiveGuestProjectId();
  if (guestActive) clearActiveGuestProjectId();
  setWorkspaceModePreference('cloud');
  persistActiveCloudSelection(name, diskKey);
  dispatchWorkspaceSynced(name, diskKey);

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
  clearIdeWorkspaceMetaCache();
  clearActiveGuestProjectId();
  setWorkspaceModePreference('cloud');
  persistActiveCloudSelection(trimmed, diskKey);
  dispatchWorkspaceSynced(trimmed, diskKey);
  return true;
}

/** Create (or update) a cloud project and make it active in the browser. */
export async function createAndSelectCloudProject(name: string): Promise<boolean> {
  const trimmed = name.trim() || 'Untitled Project';
  const existing = await getCloudProject(trimmed);
  if (existing) return selectCloudProjectByName(trimmed);
  const ok = await upsertCloudProject({ name: trimmed, pages: [], edges: [] });
  if (!ok) return false;
  return selectCloudProjectByName(trimmed);
}

/**
 * Create a project for the current session: cloud (PostgreSQL) when signed in,
 * otherwise guest localStorage. Returns the active name/key.
 */
export async function createProjectForCurrentSession(name: string): Promise<{
  projectName: string;
  projectKey: string;
  mode: 'cloud' | 'guest';
}> {
  const trimmed = name.trim() || 'Untitled Project';
  const user = await fetchSessionUser();
  if (user?.uid) {
    const ok = await createAndSelectCloudProject(trimmed);
    if (ok) {
      return {
        projectName: getBrowserProjectName().trim() || trimmed,
        projectKey: getBrowserProjectKey(),
        mode: 'cloud',
      };
    }
  }
  const entry = createGuestProject({
    pages: [],
    edges: [],
    projectName: trimmed,
  });
  writeActiveGuestProjectId(entry.id);
  setBrowserProjectKey(entry.id);
  setBrowserProjectName(entry.name);
  setWorkspaceModePreference('guest');
  clearIdeWorkspaceMetaCache();
  dispatchWorkspaceSynced(entry.name, entry.id);
  return { projectName: entry.name, projectKey: entry.id, mode: 'guest' };
}

/** Local guest workspace (no GitHub) — for dev / try-before-login. */
export function bindGuestWorkspace(): { projectName: string; projectKey: string } {
  let key = getBrowserProjectKey();
  let name = getBrowserProjectName().trim();

  const guestId = readActiveGuestProjectId();
  const rows = readGuestIndex();

  // 1. Restore explicit active guest project if valid
  if (guestId && rows.some((r) => r.id === guestId)) {
    key = guestId;
    name = rows.find((r) => r.id === guestId)?.name?.trim() || name || 'Local project';
  }
  // 2. If no active id but we have projects, pick the most recently updated one
  else if (rows.length > 0) {
    const sorted = [...rows].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    const mostRecent = sorted[0];
    key = mostRecent.id;
    name = mostRecent.name;
    writeActiveGuestProjectId(key);
  }
  // 3. No projects at all → create a default one
  else if (!name || key === 'default') {
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
  setWorkspaceModePreference('guest');
  clearIdeWorkspaceMetaCache();
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
  // Postgres unavailable / not configured — local guest mode (no cloud login).
  if (!config.cloudStorageReady || config.databaseConnectionFailed) {
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
