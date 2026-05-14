import {
  loadProjectSecrets,
  newSecretId,
  saveProjectSecrets,
  type SecretCategory,
  type SecretEntry,
} from './nebulaDashboardStorage';

export function getProjectSecretValue(projectKey: string, name: string): string | undefined {
  const norm = name.trim().toUpperCase();
  const hit = loadProjectSecrets(projectKey).find((x) => x.name.trim().toUpperCase() === norm);
  const v = hit?.value?.trim();
  return v || undefined;
}

export function upsertProjectSecret(
  projectKey: string,
  name: string,
  value: string,
  category: SecretCategory = 'api_key',
): void {
  const trimmedName = name.trim();
  const entries: SecretEntry[] = loadProjectSecrets(projectKey).map((x) => ({ ...x }));
  const norm = trimmedName.toUpperCase();
  const idx = entries.findIndex((x) => x.name.trim().toUpperCase() === norm);
  if (idx >= 0) {
    entries[idx] = { ...entries[idx], name: trimmedName, value, category };
  } else {
    entries.push({ id: newSecretId(), name: trimmedName, value, category });
  }
  saveProjectSecrets(projectKey, entries);
}
