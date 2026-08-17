/**
 * Apply POST transport failures — HTML / 403 / non-JSON.
 * Must not start Go Code pass 2 (second xAI job hangs on the same apply).
 */
export function isApplyTransportFailure(msg: string): boolean {
  const s = String(msg || '');
  if (!s.trim()) return false;
  if (/HTML instead of JSON|HTML block page/i.test(s)) return true;
  if (/Invalid JSON/i.test(s)) return true;
  if (/not found on this server|METHOD_NOT_ALLOWED/i.test(s)) return true;
  if (/Failed to fetch|NetworkError|Load failed/i.test(s)) return true;
  if (/HTTP 403|HTTP 404|HTTP 405|HTTP 502|HTTP 503|HTTP 520|HTTP 521|HTTP 522|HTTP 523|HTTP 524/i.test(s)) {
    return true;
  }
  return false;
}

/** Empty apply timeout — do not burn pass 2 while the host is still wedged. */
export function isApplyEmptyTimeoutFailure(msg: string): boolean {
  return /Apply timed out after 12s|files were not confirmed on disk/i.test(String(msg || ''));
}

export function shouldSkipGoCodeSecondPassAfterApply(opts: {
  ok: boolean;
  writtenCount: number;
  error?: string;
  message?: string;
}): boolean {
  if (opts.ok && opts.writtenCount > 0) return false;
  const msg = String(opts.error || opts.message || '');
  if (isApplyTransportFailure(msg)) return true;
  if (opts.writtenCount === 0 && isApplyEmptyTimeoutFailure(msg)) return true;
  return false;
}
