/** Active browser project key for API calls (cloud workspace on server). */
const KEY_LS = 'nebula_browser_project_key_v1';
const NAME_LS = 'nebula_browser_project_name_v1';

let currentProjectKey = 'default';
/** DB project name (must match `nebula_projects.name` when logged in) for per-project disk / Render workspace. */
let currentProjectName = '';

function sanitizeProjectKey(raw: string): string {
  const cleaned = String(raw || 'default')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 64);
  return cleaned || 'default';
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
  return currentProjectKey;
}

export function setBrowserProjectName(name: string): void {
  currentProjectName = String(name || '').trim();
  persistBrowserProject();
}

export function getBrowserProjectName(): string {
  return currentProjectName;
}

function projectQueryParams(): string {
  const parts = [`projectKey=${encodeURIComponent(currentProjectKey)}`];
  if (currentProjectName) {
    parts.push(`projectName=${encodeURIComponent(currentProjectName)}`);
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
  const out = { ...body, projectKey: currentProjectKey } as T & { projectKey: string } & {
    projectName?: string;
  };
  if (currentProjectName) {
    out.projectName = currentProjectName;
  }
  return out;
}
