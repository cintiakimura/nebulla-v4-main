import type express from "express";

/** Server env var for main Grok 4 (chat, coding, UI tools, Master Plan orchestration). */
export const MAIN_GROK_ENV_VAR = "GROK_API_KEY_LUMEN";

/** Shown in API errors and product UI when no usable Grok key is available. */
export const NEBULA_GROK_KEY_SETUP_HINT =
  `Set ${MAIN_GROK_ENV_VAR} in the server .env file and restart the Nebula process. Per-user Grok keys in the app are temporarily disabled.`;

const MIN_KEY_LEN = 20;

export type MainGrokKeySource = "env";

export type MainGrokResolveOk = { ok: true; apiKey: string; source: MainGrokKeySource };

export type MainGrokResolveErr = {
  ok: false;
  code: "MISSING" | "INVALID_LENGTH";
  message: string;
  hint: string;
};

export type MainGrokResolveResult = MainGrokResolveOk | MainGrokResolveErr;

function resolveEnvGrokKey(): MainGrokResolveResult {
  const env = process.env[MAIN_GROK_ENV_VAR]?.trim() ?? "";
  if (!env) {
    return {
      ok: false,
      code: "MISSING",
      message: `${MAIN_GROK_ENV_VAR} is not set on the server.`,
      hint: NEBULA_GROK_KEY_SETUP_HINT,
    };
  }
  if (env.length < MIN_KEY_LEN) {
    return {
      ok: false,
      code: "INVALID_LENGTH",
      message: `${MAIN_GROK_ENV_VAR} is set in the environment but is too short to be valid.`,
      hint: NEBULA_GROK_KEY_SETUP_HINT,
    };
  }
  return { ok: true, apiKey: env, source: "env" };
}

/**
 * Resolves the **main** Grok key for chat, UI tools, and code paths.
 * Uses **`GROK_API_KEY_LUMEN` from the server environment only** (no header, body, or per-user DB overrides).
 */
export function createResolveMainGrokApiKey(_readSessionUid: (req: express.Request) => string | null) {
  void _readSessionUid;
  return async function resolveMainGrokApiKey(
    _req: express.Request,
    _bodyGrokOverride?: string
  ): Promise<string> {
    const r = resolveEnvGrokKey();
    return r.ok ? r.apiKey : "";
  };
}

/** Same as {@link createResolveMainGrokApiKey} with explicit error codes for `/api/grok/chat`. */
export function createResolveMainGrokApiKeyDetailed(_readSessionUid: (req: express.Request) => string | null) {
  void _readSessionUid;
  return async function resolveMainGrokApiKeyDetailed(
    _req: express.Request,
    _bodyGrokOverride?: string
  ): Promise<MainGrokResolveResult> {
    return resolveEnvGrokKey();
  };
}
