import type express from "express";

/** Server env var for the main AI brain (chat, coding, UI tools, Master Plan). Default model: grok-4 on xAI. */
export const MAIN_AI_ENV_VAR = "MAIN_AI_API_KEY";

/** Legacy names still read if `MAIN_AI_API_KEY` is unset (migration). */
const LEGACY_MAIN_AI_ENV_VARS = ["GROK_API_KEY_LUMEN"] as const;

/** @deprecated Use {@link MAIN_AI_ENV_VAR}. */
export const MAIN_GROK_ENV_VAR = MAIN_AI_ENV_VAR;

/** Shown in API errors and product UI when no usable main AI key is available. */
export const MAIN_AI_KEY_SETUP_HINT =
  `Set ${MAIN_AI_ENV_VAR} in the server .env file and restart the Nebula process (default chat model: grok-4 on xAI when using an xAI key). Per-user API overrides in the app are temporarily disabled.`;

/** @deprecated Use {@link MAIN_AI_KEY_SETUP_HINT}. */
export const NEBULA_GROK_KEY_SETUP_HINT = MAIN_AI_KEY_SETUP_HINT;

/** TEMPORARY: quota fallback for `/api/grok/chat` — see `lib/nebulaClaudeFallback.ts`. */
export { tryClaudeQuotaFallback, isGrokQuotaLimitError } from "./nebulaClaudeFallback";

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

/** Read main AI key from env (`MAIN_AI_API_KEY`, then legacy aliases). */
export function readMainAiApiKeyFromEnv(): string {
  const primary = process.env[MAIN_AI_ENV_VAR]?.trim() ?? "";
  if (primary) return primary;
  for (const legacy of LEGACY_MAIN_AI_ENV_VARS) {
    const v = process.env[legacy]?.trim() ?? "";
    if (v) return v;
  }
  return "";
}

function resolveEnvMainAiKey(): MainGrokResolveResult {
  const env = readMainAiApiKeyFromEnv();
  if (!env) {
    return {
      ok: false,
      code: "MISSING",
      message: `${MAIN_AI_ENV_VAR} is not set on the server.`,
      hint: MAIN_AI_KEY_SETUP_HINT,
    };
  }
  if (env.length < MIN_KEY_LEN) {
    return {
      ok: false,
      code: "INVALID_LENGTH",
      message: `${MAIN_AI_ENV_VAR} is set in the environment but is too short to be valid.`,
      hint: MAIN_AI_KEY_SETUP_HINT,
    };
  }
  return { ok: true, apiKey: env, source: "env" };
}

/**
 * Resolves the **main** AI key for chat, UI tools, and code paths.
 * Uses **`MAIN_AI_API_KEY` from the server environment only** (no header, body, or per-user DB overrides).
 */
export function createResolveMainGrokApiKey(_readSessionUid: (req: express.Request) => string | null) {
  void _readSessionUid;
  return async function resolveMainGrokApiKey(
    _req: express.Request,
    _bodyGrokOverride?: string
  ): Promise<string> {
    const r = resolveEnvMainAiKey();
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
    return resolveEnvMainAiKey();
  };
}
