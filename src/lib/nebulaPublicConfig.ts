import { getGrokRequestHeaders } from './grokUserKey';

export type NebulaPublicConfig = {
  cloudStorageReady?: boolean;
  githubOAuthReady?: boolean;
  /** True when GITHUB_CLIENT_ID is set (secret may still be missing). */
  githubClientIdConfigured?: boolean;
  /** True when GITHUB_CLIENT_SECRET is set. */
  githubClientSecretConfigured?: boolean;
  googleOAuthReady?: boolean;
  googleClientIdConfigured?: boolean;
  googleClientSecretConfigured?: boolean;
  databaseConnectionFailed?: boolean;
  databaseUrlConfigured?: boolean;
  databaseUrlLooksTruncated?: boolean;
  databaseFailureHint?: string;
  databaseHostHint?: string;
  pencilMockupsReady?: boolean;
  nebulaUiStudioDemo?: boolean;
  hasV0ApiKey?: boolean;
  v0KeyHint?: string;
  hasR2Storage?: boolean;
  /** True when platform env OR user BYOK can power main chat. */
  hasMainAiApiKey?: boolean;
  hasGrokApiKey?: boolean;
  /** Platform MAIN_API_KEY_GROK only (ops fallback). */
  hasPlatformMainAiApiKey?: boolean;
  /** Signed-in user has at least one encrypted BYOK key. */
  hasUserByok?: boolean;
  byok?: {
    xai: { configured: boolean; tail?: string };
    anthropic: { configured: boolean; tail?: string };
    openai: { configured: boolean; tail?: string };
  };
  /** Last 4 characters of user xAI key or platform key (never full secret). */
  mainAiKeyTail?: string;
  mainAiKeyHint?: string;
  /** When true, Nebula Free-tier monthly token cap is not enforced. */
  freeTierTokenLimitDisabled?: boolean;
  /** When true, Stripe checkout is live. Beta defaults false (BILLING_ENABLED). */
  billingEnabled?: boolean;
  r2MissingEnv?: string[];
  r2StorageHint?: string;
  /** True when CLOUDFLARE_API_TOKEN + account id are set for per-project D1 provisioning. */
  d1ProvisioningReady?: boolean;
  /** True when CLOUDFLARE_API_TOKEN is set for Zone DNS management. */
  cloudflareDnsReady?: boolean;
  cloudflareDnsHint?: string;
};

export async function fetchNebulaPublicConfig(): Promise<NebulaPublicConfig> {
  try {
    const r = await fetch('/api/config', {
      credentials: 'include',
      headers: getGrokRequestHeaders(),
    });
    const d = (await r.json()) as NebulaPublicConfig;
    return d && typeof d === 'object' ? d : {};
  } catch {
    return {};
  }
}
