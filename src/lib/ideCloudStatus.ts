import type { NebulaPublicConfig } from './nebulaPublicConfig';

/** Friendly copy when cloud login / GitHub cannot run locally. */
export function cloudBlockedBannerMessage(cfg: NebulaPublicConfig): string | null {
  const dbDown = Boolean(cfg.databaseConnectionFailed) || !cfg.cloudStorageReady;
  const ghDown = !cfg.githubOAuthReady;

  if (dbDown && ghDown) {
    return 'Cloud features need a working DATABASE_URL, and GitHub login needs GITHUB_CLIENT_SECRET. Continuing as guest.';
  }
  if (dbDown) {
    if (cfg.databaseUrlConfigured && cfg.databaseConnectionFailed) {
      return 'Cloud features need a working DATABASE_URL (use Render’s External Postgres URL). Continuing as guest.';
    }
    return 'Cloud features need DATABASE_URL. Continuing as guest.';
  }
  if (ghDown) {
    if (cfg.githubClientIdConfigured && !cfg.githubClientSecretConfigured) {
      return 'GitHub login needs GITHUB_CLIENT_SECRET in .env (CLIENT_ID alone is not enough). You can keep working as guest.';
    }
    return 'GitHub OAuth is not fully configured. You can keep working as guest.';
  }
  return null;
}

export function isCloudLoginBlocked(cfg: NebulaPublicConfig): boolean {
  return Boolean(cfg.databaseConnectionFailed) || !cfg.cloudStorageReady;
}
