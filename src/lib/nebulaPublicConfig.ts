export type NebulaPublicConfig = {
  cloudStorageReady?: boolean;
  githubOAuthReady?: boolean;
  /** True when GITHUB_CLIENT_ID is set (secret may still be missing). */
  githubClientIdConfigured?: boolean;
  /** True when GITHUB_CLIENT_SECRET is set. */
  githubClientSecretConfigured?: boolean;
  databaseConnectionFailed?: boolean;
  databaseUrlConfigured?: boolean;
  pencilMockupsReady?: boolean;
  nebulaUiStudioDemo?: boolean;
  hasV0ApiKey?: boolean;
  v0KeyHint?: string;
  hasR2Storage?: boolean;
  hasMainAiApiKey?: boolean;
  /** Last 4 characters of MAIN_API_KEY_GROK (compare local vs Render /api/config). */
  mainAiKeyTail?: string;
  /** When true, Nebula Free-tier monthly token cap is not enforced. */
  freeTierTokenLimitDisabled?: boolean;
  r2MissingEnv?: string[];
  r2StorageHint?: string;
  /** True when CLOUDFLARE_API_TOKEN + account id are set for per-project D1 provisioning. */
  d1ProvisioningReady?: boolean;
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
