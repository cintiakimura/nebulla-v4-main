import type express from "express";

/** Shown in API errors and product UI when no usable Grok key is available. */
export const NEBULA_GROK_KEY_SETUP_HINT =
  "Set GROK_API_KEY in the server .env file and restart the Nebula process. Per-user Grok keys in the app are temporarily disabled.";

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
  const env = process.env.GROK_API_KEY?.trim() ?? "";
  if (!env) {
    return {
      ok: false,
      code: "MISSING",
      message: "GROK_API_KEY is not set on the server.",
      hint: NEBULA_GROK_KEY_SETUP_HINT,
    };
  }
  if (env.length < MIN_KEY_LEN) {
    return {
      ok: false,
      code: "INVALID_LENGTH",
      message: "GROK_API_KEY is set in the environment but is too short to be valid.",
      hint: NEBULA_GROK_KEY_SETUP_HINT,
    };
  }
  return { ok: true, apiKey: env, source: "env" };
}

/**
 * Resolves the **main** Grok key for chat, swarm quality lane, UI tools, and code paths.
 * Uses **`GROK_API_KEY` from the server environment only** (no header, body, or per-user DB overrides).
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
