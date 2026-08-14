/**
 * Guest / UI-shell lab switch.
 *
 * Production (nebulla.dev / Render): leave unset → false.
 *   Auth, session projects, and signed-in BYOK stay on.
 * Local lab only: set NEBULA_FORCE_GUEST=1 (or VITE_NEBULA_FORCE_GUEST=1) in `.env`.
 *   Then FORCE_GUEST_MODE and UI_SHELL_ONLY are true (skip auth, hide setup banners).
 * Do not set this flag on Render.
 */
export function envFlagEnabled(raw: string | undefined | null): boolean {
  const s = String(raw ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

function readForceGuestMode(): boolean {
  let viteVal = '';
  try {
    const meta = import.meta.env as {
      VITE_NEBULA_FORCE_GUEST?: string;
      NEBULA_FORCE_GUEST?: string;
    };
    viteVal = String(meta.VITE_NEBULA_FORCE_GUEST ?? meta.NEBULA_FORCE_GUEST ?? '');
  } catch {
    /* Node tests without Vite */
  }
  const proc =
    typeof process !== 'undefined' && process.env
      ? String(process.env.NEBULA_FORCE_GUEST || process.env.VITE_NEBULA_FORCE_GUEST || '')
      : '';
  return envFlagEnabled(viteVal) || envFlagEnabled(proc);
}

export const FORCE_GUEST_MODE = readForceGuestMode();

/** Same switch — hide Grok/cloud setup banners only when lab guest is forced. */
export const UI_SHELL_ONLY = FORCE_GUEST_MODE;
