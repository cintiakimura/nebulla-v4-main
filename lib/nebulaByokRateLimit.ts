/**
 * Simple per-uid sliding window rate limit for BYOK save/delete (in-memory).
 * Enough to blunt abuse; not a distributed limiter.
 */

type Bucket = { timestamps: number[] };

const buckets = new Map<string, Bucket>();

export function byokRateLimitAllow(
  key: string,
  opts: { max: number; windowMs: number } = { max: 20, windowMs: 60_000 },
): boolean {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b) {
    b = { timestamps: [] };
    buckets.set(key, b);
  }
  b.timestamps = b.timestamps.filter((t) => now - t < opts.windowMs);
  if (b.timestamps.length >= opts.max) return false;
  b.timestamps.push(now);
  return true;
}
