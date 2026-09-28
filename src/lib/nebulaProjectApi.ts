import {
  IDENTITY_FREEZE_STORAGE_KEY,
  mergeIdentityFreeze,
  parseIdentityFreezeRecord,
  resolveFrozenProjectKey,
  resolveFrozenWorkspaceTarget,
  type IdentityFreezeRecord,
} from '../../lib/identityFreeze';

/** Active browser project key for API calls (cloud workspace on server). */
const KEY_LS = 'nebula_browser_project_key_v1';
const NAME_LS = 'nebula_browser_project_name_v1';

let currentProjectKey = 'default';
/** DB project name (must match `nebula_projects.name` when logged in) for per-project disk / cfproj_ scope. */
let currentProjectName = '';
let identityFreeze: IdentityFreezeRecord | null = null;

function sanitizeProjectKey(raw: string): string {
  const cleaned = String(raw || 'default')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 64);
  return cleaned || 'default';
}

function persistIdentityFreeze(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (identityFreeze) {
      localStorage.setItem(IDENTITY_FREEZE_STORAGE_KEY, JSON.stringify(identityFreeze));
    } else {
      localStorage.removeItem(IDENTITY_FREEZE_STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}

function persistBrowserProject(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(KEY_LS, currentProjectKey);
    if (currentProjectName) {
      localStorage.setItem(NAME_LS, currentProjectName);
    } else {
      localStorage.removeItem(NAME_LS);
    }
    persistIdentityFreeze();
  } catch {
    /* ignore */
  }
}

/** Restore last projectKey/projectName before any API calls (survives refresh). */
function restoreBrowserProjectFromStorage(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const k = localStorage.getItem(KEY_LS)?.trim();
    const n = localStorage.getItem(NAME_LS)?.trim();
    if (k) currentProjectKey = sanitizeProjectKey(k);
    if (n) currentProjectName = n;
    try {
      const raw = localStorage.getItem(IDENTITY_FREEZE_STORAGE_KEY);
      identityFreeze = raw ? parseIdentityFreezeRecord(JSON.parse(raw)) : null;
    } catch {
      identityFreeze = null;
    }
  } catch {
    /* ignore */
  }
}

restoreBrowserProjectFromStorage();

export function setBrowserProjectKey(key: string): void {
  currentProjectKey = sanitizeProjectKey(key);
  persistBrowserProject();
}

export function getBrowserProjectKey(): string {
  return resolveFrozenProjectKey({
    freezeKey: identityFreeze?.projectKey,
    browserKey: currentProjectKey,
  });
}

export function getIdentityFreeze(): IdentityFreezeRecord | null {
  return identityFreeze;
}

/** First successful Master Plan save — later turns cannot change key or brand. */
export function freezeIdentityAfterMasterPlanSave(opts: {
  projectKey: string;
  projectName: string;
}): IdentityFreezeRecord {
  const next = mergeIdentityFreeze(identityFreeze, {
    projectKey: sanitizeProjectKey(opts.projectKey),
    projectName: String(opts.projectName || '').trim(),
  });
  identityFreeze = next;
  persistIdentityFreeze();
  return next;
}

/** Home / explicit new product mint — freeze belongs to the previous workspace. */
export function clearIdentityFreeze(): void {
  identityFreeze = null;
  persistIdentityFreeze();
}

/** Header ≠ frozen plan name: restore plan name on the same key. */
export function restoreFrozenIdentityIfDrifted(): IdentityFreezeRecord | null {
  if (!identityFreeze) return null;
  const target = resolveFrozenWorkspaceTarget({
    freeze: identityFreeze,
    headerName: currentProjectName,
    headerKey: currentProjectKey,
  });
  currentProjectKey = sanitizeProjectKey(target.projectKey);
  if (target.projectName) currentProjectName = target.projectName;
  persistBrowserProject();
  return identityFreeze;
}

export function setBrowserProjectName(name: string): void {
  currentProjectName = String(name || '').trim();
  persistBrowserProject();
}

export function getBrowserProjectName(): string {
  return currentProjectName;
}

/**
 * Workspace id vs display name.
 * Never use `projectName` as a fallback for `projectKey` (and vice versa except
 * when the display name is empty — APIs still need a non-empty projectName).
 */
export function resolveActiveProjectIds(diskProjectKey?: string | null): {
  projectKey: string;
  projectName: string;
} {
  const fromDisk = String(diskProjectKey || '').trim();
  const projectKey = resolveFrozenProjectKey({
    freezeKey: identityFreeze?.projectKey,
    browserKey: fromDisk || currentProjectKey,
  });
  const projectName = (identityFreeze?.projectName || currentProjectName).trim() || projectKey;
  return { projectKey, projectName };
}

function apiProjectKey(): string {
  return resolveFrozenProjectKey({
    freezeKey: identityFreeze?.projectKey,
    browserKey: currentProjectKey,
  });
}

function apiProjectName(): string {
  return (identityFreeze?.projectName || currentProjectName).trim();
}

function projectQueryParams(): string {
  const key = apiProjectKey();
  const name = apiProjectName();
  const parts = [`projectKey=${encodeURIComponent(key)}`];
  if (name) {
    parts.push(`projectName=${encodeURIComponent(name)}`);
  }
  return parts.join('&');
}

/** Append `projectKey` (and `projectName` when set) for GET requests. */
export function withProjectQuery(url: string): string {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}${projectQueryParams()}`;
}

export function withProjectBody<T extends Record<string, unknown>>(
  body: T,
): T & { projectKey: string } & { projectName?: string } {
  const key = apiProjectKey();
  const name = apiProjectName();
  const out = { ...body, projectKey: key } as T & { projectKey: string } & {
    projectName?: string;
  };
  if (name) {
    out.projectName = name;
  }
  return out;
}
