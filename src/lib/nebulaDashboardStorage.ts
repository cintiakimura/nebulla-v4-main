/** Browser-only per-project dashboard data (localStorage). */

export type SecretCategory = 'api_key' | 'oauth_token' | 'variable' | 'generic';

export type SecretEntry = {
  id: string;
  /** Variable / key name (e.g. STRIPE_SECRET_KEY). */
  name: string;
  value: string;
  category: SecretCategory;
  note?: string;
};

export type ProjectSettingsStored = {
  localFolderPath: string;
  githubRepository: string;
  /** Render workspace ID (internal client / workspace boundary). */
  renderWorkspaceId: string;
  /** Render service / Nebula project ID as you use it in dashboards. */
  renderProjectId: string;
};

function secretsKey(projectKey: string) {
  return `nebulla_integrations_secrets_v1_${projectKey}`;
}

function settingsKey(projectKey: string) {
  return `nebulla_project_settings_v1_${projectKey}`;
}

const defaultSettings = (): ProjectSettingsStored => ({
  localFolderPath: '',
  githubRepository: '',
  renderWorkspaceId: '',
  renderProjectId: '',
});

export function loadProjectSecrets(projectKey: string): SecretEntry[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(secretsKey(projectKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is SecretEntry => {
        return (
          x &&
          typeof x === 'object' &&
          typeof (x as SecretEntry).id === 'string' &&
          typeof (x as SecretEntry).name === 'string' &&
          typeof (x as SecretEntry).value === 'string'
        );
      })
      .map((x) => ({
        id: x.id,
        name: String(x.name).trim(),
        value: String(x.value),
        category: (['api_key', 'oauth_token', 'variable', 'generic'] as const).includes(x.category as SecretCategory)
          ? (x.category as SecretCategory)
          : 'generic',
        note: typeof x.note === 'string' ? x.note : undefined,
      }));
  } catch {
    return [];
  }
}

export function saveProjectSecrets(projectKey: string, entries: SecretEntry[]): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(secretsKey(projectKey), JSON.stringify(entries));
}

export function newSecretId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function loadProjectSettings(projectKey: string): ProjectSettingsStored {
  if (typeof localStorage === 'undefined') return defaultSettings();
  try {
    const raw = localStorage.getItem(settingsKey(projectKey));
    if (!raw) return defaultSettings();
    const o = JSON.parse(raw) as Record<string, unknown>;
    return {
      localFolderPath: typeof o.localFolderPath === 'string' ? o.localFolderPath : '',
      githubRepository: typeof o.githubRepository === 'string' ? o.githubRepository : '',
      renderWorkspaceId: typeof o.renderWorkspaceId === 'string' ? o.renderWorkspaceId : '',
      renderProjectId: typeof o.renderProjectId === 'string' ? o.renderProjectId : '',
    };
  } catch {
    return defaultSettings();
  }
}

export function saveProjectSettings(projectKey: string, s: ProjectSettingsStored): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(settingsKey(projectKey), JSON.stringify(s));
}
