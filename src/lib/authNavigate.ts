/** Client navigation helpers for public vs IDE routes. */

export function goToLanding(): void {
  window.location.assign('/');
}

export function goToLogin(next = '/app'): void {
  const q = next && next !== '/app' ? `?next=${encodeURIComponent(next)}` : '';
  window.location.assign(`/login${q}`);
}

export function goToApp(): void {
  window.location.assign('/app');
}

export function goToPricing(): void {
  window.location.assign('/pricing');
}

export function readLoginNextParam(): string {
  try {
    const n = new URLSearchParams(window.location.search).get('next')?.trim();
    if (n && n.startsWith('/') && !n.startsWith('//')) return n;
  } catch {
    /* ignore */
  }
  return '/app';
}
