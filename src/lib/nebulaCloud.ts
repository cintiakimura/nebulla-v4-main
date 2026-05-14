/**
 * Nebulla cloud layer: Render PostgreSQL via same-origin Express API (cookie session).
 */

import { readResponseJson } from './apiFetch';
import { fireSilentProjectManager } from './projectManagerClient';

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
