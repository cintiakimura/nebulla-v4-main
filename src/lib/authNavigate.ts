/** Client navigation helpers for public vs IDE routes. */

import { FORCE_GUEST_MODE } from './testingBranch';

export function goToLanding(): void {
  window.location.assign('/');
}

export function goToLogin(next = '/app'): void {
  if (FORCE_GUEST_MODE) {
    window.location.assign('/app');
    return;
  }
  const q = next && next !== '/app' ? `?next=${encodeURIComponent(next)}` : '';
  window.location.assign(`/login${q}`);
}

/** Free-trial onboarding: create account, then open the IDE. */
export function goToTryFree(next = '/app'): void {
  if (FORCE_GUEST_MODE) {
    window.location.assign('/app');
    return;
  }
  const dest = next.startsWith('/') && !next.startsWith('//') ? next : '/app';
  window.location.assign(`/signup?next=${encodeURIComponent(dest)}`);
}

export function goToApp(): void {
  window.location.assign('/app');
}

export function goToPricing(): void {
  window.location.assign('/payment');
}

export function goToPayment(): void {
  window.location.assign('/payment');
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
