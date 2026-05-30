/** Blocks UI Studio auto-v0 while Grok Code / Go is writing workspace files. */

const EVENT = 'nebula-grok-coding-active';

export function setGrokCodingActive(active: boolean): void {
  try {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { active } }));
  } catch {
    /* ignore */
  }
}

export function subscribeGrokCodingActive(onChange: (active: boolean) => void): () => void {
  const handler = (ev: Event) => {
    onChange(Boolean((ev as CustomEvent<{ active?: boolean }>).detail?.active));
  };
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
