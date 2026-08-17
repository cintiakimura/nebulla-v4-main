/**
 * Shell-wide Grok / Go activity. Chat lives on Build only; Code and Plan
 * must still show whether coding is waiting, timed out, or finished.
 */
import type { GrokActivityStatus } from './ideGrokActivityStatus';

export type GrokActivityBroadcast = {
  activity: GrokActivityStatus;
  v0Live?: boolean;
};

const EVENT = 'nebula-grok-activity';

let last: GrokActivityBroadcast | null = null;

export function publishGrokActivity(next: GrokActivityBroadcast): void {
  last = next;
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
  } catch {
    /* ignore */
  }
}

export function getPublishedGrokActivity(): GrokActivityBroadcast | null {
  return last;
}

export function subscribeGrokActivity(onChange: (next: GrokActivityBroadcast) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (ev: Event) => {
    onChange((ev as CustomEvent<GrokActivityBroadcast>).detail);
  };
  window.addEventListener(EVENT, handler);
  if (last) onChange(last);
  return () => window.removeEventListener(EVENT, handler);
}

export function grokActivityStripVisible(next: GrokActivityBroadcast | null): boolean {
  if (!next) return false;
  return next.activity.tone === 'work' || next.activity.tone === 'error' || Boolean(next.v0Live);
}
