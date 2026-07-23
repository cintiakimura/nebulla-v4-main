import type { NebulaPublicConfig } from './nebulaPublicConfig';

/** Soften / hide guest-mode cloud nags. Guest IDE works without Postgres. */
export function cloudBlockedBannerMessage(cfg: NebulaPublicConfig): string | null {
  // Guest mode is a supported path — do not keep asking for Render DATABASE_URL in the IDE chrome.
  // Sign-in / WorkspaceSetupGate still explain cloud requirements when the user tries to log in.
  const dbDown = Boolean(cfg.databaseConnectionFailed) || !cfg.cloudStorageReady;
  const ghDown = !cfg.githubOAuthReady;

  if (dbDown) {
    return null;
  }
  if (ghDown) {
    if (cfg.githubClientIdConfigured && !cfg.githubClientSecretConfigured) {
      return 'GitHub login needs GITHUB_CLIENT_SECRET in .env (CLIENT_ID alone is not enough). You can keep working as guest.';
    }
    // Incomplete GitHub OAuth is optional — don't nag when guest work is fine.
    return null;
  }
  return null;
}

export function isCloudLoginBlocked(cfg: NebulaPublicConfig): boolean {
  return Boolean(cfg.databaseConnectionFailed) || !cfg.cloudStorageReady;
}
