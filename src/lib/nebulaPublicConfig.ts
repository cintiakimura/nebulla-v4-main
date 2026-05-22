export type NebulaPublicConfig = {
  cloudStorageReady?: boolean;
  githubOAuthReady?: boolean;
  databaseConnectionFailed?: boolean;
  databaseUrlConfigured?: boolean;
  pencilMockupsReady?: boolean;
  nebulaUiStudioDemo?: boolean;
  hasV0ApiKey?: boolean;
  v0KeyHint?: string;
};

export async function fetchNebulaPublicConfig(): Promise<NebulaPublicConfig> {
  try {
    const r = await fetch('/api/config');
    const d = (await r.json()) as NebulaPublicConfig;
    return d && typeof d === 'object' ? d : {};
  } catch {
    return {};
  }
}
