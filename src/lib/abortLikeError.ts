/**
 * Browser AbortError / timeout — never show Chrome's
 * "signal is aborted without reason" as a hard coding stop.
 */

export function isAbortLikeError(e: unknown): boolean {
  if (!e) return false;
  if (typeof DOMException !== 'undefined' && e instanceof DOMException) {
    if (e.name === 'AbortError' || e.name === 'TimeoutError') return true;
  }
  if (e instanceof Error) {
    return e.name === 'AbortError' || e.name === 'TimeoutError' || isAbortLikeMessage(e.message);
  }
  return isAbortLikeMessage(String(e));
}

export function isAbortLikeMessage(message?: string | null): boolean {
  return /aborted|abort|timed out|timeout|without reason/i.test(String(message || ''));
}

/** AbortController.abort() with a reason so Chrome does not say "without reason". */
export function abortWithTimeoutReason(ac: AbortController, message: string): void {
  try {
    if (typeof DOMException !== 'undefined') {
      ac.abort(new DOMException(message, 'TimeoutError'));
      return;
    }
  } catch {
    /* older abort() is 0-arg only */
  }
  try {
    ac.abort();
  } catch {
    /* ignore */
  }
}
