export type NebulaPublicConfig = {
  cloudStorageReady?: boolean;
  githubOAuthReady?: boolean;
  databaseConnectionFailed?: boolean;
  databaseUrlConfigured?: boolean;
  pencilMockupsReady?: boolean;
  nebulaUiStudioDemo?: boolean;
  hasV0ApiKey?: boolean;
  v0KeyHint?: string;
  hasR2Storage?: boolean;
  hasMainAiApiKey?: boolean;
  /** When true, Nebula Free-tier monthly token cap is not enforced. */
  freeTierTokenLimitDisabled?: boolean;
  r2MissingEnv?: string[];
  r2StorageHint?: string;
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
