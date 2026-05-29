import type { Request } from "express";

/** Server env var for v0 by Vercel (Nebula UI Studio first-pass UI generation). */
export const V0_ENV_VAR = "V0_API_KEY";

export const NEBULA_V0_KEY_SETUP_HINT =
  "Add V0_API_KEY in Render Environment, or save your key in My services → v0 API key.";

export const NEBULLA_V0_HEADER = "x-nebula-v0-api-key";

const MIN_KEY_LEN = 8;

export type V0ResolveOk = { ok: true; apiKey: string };
export type V0ResolveErr = {
  ok: false;
  code: "MISSING" | "INVALID_LENGTH";
  message: string;
  hint: string;
};
export type V0ResolveResult = V0ResolveOk | V0ResolveErr;

/** Resolves v0 API key from server environment only (same pattern as main Grok key). */
export function resolveV0ApiKey(): V0ResolveResult {
  return resolveV0ApiKeyFromSources(process.env[V0_ENV_VAR]?.trim() ?? "");
}

/** Server env first; optional per-request header from signed-in user's My services key. */
export function resolveV0ApiKeyFromRequest(req?: Request): V0ResolveResult {
  const fromEnv = process.env[V0_ENV_VAR]?.trim() ?? "";
  if (fromEnv) return resolveV0ApiKeyFromSources(fromEnv);
  const header = req?.headers[NEBULLA_V0_HEADER];
  const fromHeader = typeof header === "string" ? header.trim() : "";
  if (fromHeader) return resolveV0ApiKeyFromSources(fromHeader);
  const body = (req?.body || {}) as { v0ApiKey?: unknown };
  const fromBody = typeof body.v0ApiKey === "string" ? body.v0ApiKey.trim() : "";
  return resolveV0ApiKeyFromSources(fromBody);
}

function resolveV0ApiKeyFromSources(raw: string): V0ResolveResult {
  const env = raw.trim();
  if (!env) {
    return {
      ok: false,
      code: "MISSING",
      message: `${V0_ENV_VAR} is not set on the server and no client key was sent.`,
      hint: NEBULA_V0_KEY_SETUP_HINT,
    };
  }
  if (env.length < MIN_KEY_LEN) {
    return {
      ok: false,
      code: "INVALID_LENGTH",
      message: `${V0_ENV_VAR} is set but too short to be valid.`,
      hint: NEBULA_V0_KEY_SETUP_HINT,
    };
  }
  return { ok: true, apiKey: env };
}

export function resolveV0ApiKeyOrEmpty(): string {
  const r = resolveV0ApiKey();
  return r.ok ? r.apiKey : "";
}
