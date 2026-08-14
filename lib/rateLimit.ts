/**
 * Lightweight in-memory sliding-window rate limiter (single process).
 * Disable with RATE_LIMIT_DISABLED=true. Tune via RATE_LIMIT_* env vars.
 */
import type { NextFunction, Request, Response } from "express";

type Bucket = { timestamps: number[] };

const store = new Map<string, Bucket>();

export type RateLimitOptions = {
  /** Max requests in the window */
  max: number;
  /** Window length in ms */
  windowMs: number;
  /** Key prefix for this limiter */
  name: string;
  /** Optional custom key (default: IP) */
  keyFn?: (req: Request) => string;
};

function clientIp(req: Request): string {
  const xf = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim();
  return xf || req.ip || req.socket.remoteAddress || "unknown";
}

function prune(bucket: Bucket, windowMs: number, now: number): void {
  const cutoff = now - windowMs;
  bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);
}

/** Test helper — clear all buckets. */
export function resetRateLimitStore(): void {
  store.clear();
}

export function createRateLimiter(opts: RateLimitOptions) {
  const max = Math.max(1, opts.max);
  const windowMs = Math.max(1000, opts.windowMs);

  return function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
    if ((process.env.RATE_LIMIT_DISABLED || "").trim() === "true") {
      next();
      return;
    }

    const now = Date.now();
    const id = `${opts.name}:${(opts.keyFn || clientIp)(req)}`;
    let bucket = store.get(id);
    if (!bucket) {
      bucket = { timestamps: [] };
      store.set(id, bucket);
    }
    prune(bucket, windowMs, now);

    if (bucket.timestamps.length >= max) {
      const retryAfterSec = Math.max(
        1,
        Math.ceil((bucket.timestamps[0]! + windowMs - now) / 1000),
      );
      res.setHeader("Retry-After", String(retryAfterSec));
      res.status(429).json({
        error: "Too many requests",
        retryAfterSec,
        limit: opts.name,
      });
      return;
    }

    bucket.timestamps.push(now);
    next();
  };
}

/**
 * Path-prefix matcher — apply different limits to auth vs AI routes.
 * Call once as app.use(createApiRateLimitGate()).
 * Grok kick/chat count; `/api/grok/go-code/poll` does not (would 429 in ~5 min).
 */
export function isAiRateLimitedPath(
  path: string,
  aiPaths: string[] = ["/api/grok/chat", "/api/grok/go-code", "/api/grok/execute-project-rules"],
  exactOnly: Set<string> = new Set(["/api/grok/go-code"]),
): boolean {
  const p = path.split("?")[0] || "";
  return aiPaths.some((prefix) => {
    if (exactOnly.has(prefix)) return p === prefix;
    return p === prefix || p.startsWith(`${prefix}/`);
  });
}

export function createApiRateLimitGate() {
  const authMax = Math.max(5, Number(process.env.RATE_LIMIT_AUTH_MAX || "30") || 30);
  const authWindow = Math.max(1000, Number(process.env.RATE_LIMIT_AUTH_WINDOW_MS || "900000") || 900_000);
  const aiMax = Math.max(5, Number(process.env.RATE_LIMIT_AI_MAX || "60") || 60);
  const aiWindow = Math.max(1000, Number(process.env.RATE_LIMIT_AI_WINDOW_MS || "600000") || 600_000);
  const genMax = Math.max(3, Number(process.env.RATE_LIMIT_UI_GEN_MAX || "20") || 20);
  const genWindow = Math.max(1000, Number(process.env.RATE_LIMIT_UI_GEN_WINDOW_MS || "600000") || 600_000);

  const authLimiter = createRateLimiter({ name: "auth", max: authMax, windowMs: authWindow });
  const aiLimiter = createRateLimiter({ name: "ai", max: aiMax, windowMs: aiWindow });
  const genLimiter = createRateLimiter({ name: "ui-gen", max: genMax, windowMs: genWindow });

  const authPaths = [
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/forgot-password",
    "/api/auth/reset-password",
    "/api/auth/github",
    "/api/auth/google",
  ];
  const aiPaths = ["/api/grok/chat", "/api/grok/go-code", "/api/grok/execute-project-rules"];
  /** Local job status — must not share the Grok kick bucket (poll every 5s would 429 in ~5 min). */
  const aiExactOnly = new Set(["/api/grok/go-code"]);
  const genPaths = [
    "/api/ui-studio-beta/generate",
    "/api/nebula-ui-studio/v0-generate",
    "/api/ui-studio/generate",
  ];

  return function apiRateLimitGate(req: Request, res: Response, next: NextFunction): void {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
      next();
      return;
    }
    const path = req.path || "";
    if (authPaths.some((p) => path === p || path.startsWith(`${p}/`))) {
      authLimiter(req, res, next);
      return;
    }
    if (genPaths.some((p) => path === p || path.startsWith(`${p}/`))) {
      genLimiter(req, res, next);
      return;
    }
    if (isAiRateLimitedPath(path, aiPaths, aiExactOnly)) {
      aiLimiter(req, res, next);
      return;
    }
    next();
  };
}
