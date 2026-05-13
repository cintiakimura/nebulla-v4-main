/**
 * Public site base for OAuth callback registration.
 * Priority: server-provided PUBLIC_SITE_URL -> VITE_PUBLIC_SITE_URL -> current origin.
 */
export function getPublicSiteBase(serverPublicSiteUrl?: string | null): string {
  const fromServer = (serverPublicSiteUrl || "").trim();
  const explicit = import.meta.env.VITE_PUBLIC_SITE_URL?.trim() || "";
  const origin = (typeof window !== "undefined" ? window.location.origin : "") || "";
  const selected = fromServer || explicit || origin;
  return selected.replace(/\/$/, "");
}

/** Must match GitHub OAuth App → Authorization callback URL. */
export function getGithubOAuthCallbackUrl(serverPublicSiteUrl?: string | null): string {
  return `${getPublicSiteBase(serverPublicSiteUrl)}/api/auth/github/callback`;
}
