/** Server env var for v0 by Vercel (Nebula UI Studio first-pass UI generation). */
export const V0_ENV_VAR = "V0_API_KEY";

export const NEBULA_V0_KEY_SETUP_HINT = "Please add your V0_API_KEY in .env";

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
  const env = process.env[V0_ENV_VAR]?.trim() ?? "";
  if (!env) {
    return {
      ok: false,
      code: "MISSING",
      message: `${V0_ENV_VAR} is not set on the server.`,
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
