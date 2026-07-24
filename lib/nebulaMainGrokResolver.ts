import type express from "express";

/** Canonical server env var for the main Grok / xAI brain (chat, coding, UI tools, Master Plan). */
export const MAIN_AI_ENV_VAR = "MAIN_API_KEY_GROK";

/** Older names still read when `MAIN_API_KEY_GROK` is unset (migration). */
const LEGACY_MAIN_AI_ENV_VARS = ["MAIN_AI_API_KEY", "GROK_API_KEY_LUMEN"] as const;

/** @deprecated Use {@link MAIN_AI_ENV_VAR}. */
export const MAIN_GROK_ENV_VAR = MAIN_AI_ENV_VAR;

/** Shown in API errors and product UI when no usable main AI key is available. */
export const MAIN_AI_KEY_SETUP_HINT =
  `Set ${MAIN_AI_ENV_VAR} in the server .env or Render Environment (default chat model: grok-4 on xAI when using an xAI key). Legacy aliases: MAIN_AI_API_KEY, GROK_API_KEY_LUMEN. Per-user API overrides in the app are temporarily disabled.`;

/** @deprecated Use {@link MAIN_AI_KEY_SETUP_HINT}. */
export const NEBULA_GROK_KEY_SETUP_HINT = MAIN_AI_KEY_SETUP_HINT;

/** TEMPORARY: quota fallback for `/api/grok/chat` — see `lib/nebulaClaudeFallback.ts`. */
export { tryClaudeQuotaFallback, isGrokQuotaLimitError } from "./nebulaClaudeFallback";

export {
  detectMainAiProvider,
  mainAiProviderLabel,
  resolveMainAiChatModel,
  FREE_TIER_MONTHLY_LIMIT_MESSAGE,
  type MainAiProvider,
} from "./nebulaMainAiProvider";

const MIN_KEY_LEN = 20;

/** Strip wrapping quotes and accidental newlines from Render / .env pastes. */
function sanitizeEnvSecret(raw: string): string {
  let s = raw.trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s.replace(/[\r\n]+/g, "");
}

/** Browser BYOK header (same pattern as v0's x-nebula-v0-api-key). */
export const NEBULLA_XAI_HEADER = "x-nebula-xai-api-key";

export type MainGrokKeySource = "env" | "client";

export type MainGrokResolveOk = { ok: true; apiKey: string; source: MainGrokKeySource };

export type MainGrokResolveErr = {
  ok: false;
  code: "MISSING" | "INVALID_LENGTH";
  message: string;
  hint: string;
};

export type MainGrokResolveResult = MainGrokResolveOk | MainGrokResolveErr;

/** Read main AI key: `MAIN_API_KEY_GROK`, then legacy `MAIN_AI_API_KEY`, `GROK_API_KEY_LUMEN`. */
export function readMainAiApiKeyFromEnv(): string {
  const primary = sanitizeEnvSecret(process.env[MAIN_AI_ENV_VAR] ?? "");
  if (primary) return primary;
  for (const legacy of LEGACY_MAIN_AI_ENV_VARS) {
    const v = sanitizeEnvSecret(process.env[legacy] ?? "");
    if (v) return v;
  }
  return "";
}

/** Last 4 chars of the configured key (for matching local vs Render without exposing the secret). */
export function mainAiApiKeyTail(): string | undefined {
  const k = readMainAiApiKeyFromEnv();
  return k.length >= 8 ? k.slice(-4) : undefined;
}

function resolveEnvMainAiKey(): MainGrokResolveResult {
  const env = readMainAiApiKeyFromEnv();
  if (!env) {
    return {
      ok: false,
      code: "MISSING",
      message: `${MAIN_AI_ENV_VAR} is not set on the server (legacy: ${LEGACY_MAIN_AI_ENV_VARS.join(", ")}).`,
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

function readClientXaiApiKey(req: express.Request): string {
  const raw = req.headers[NEBULLA_XAI_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return sanitizeEnvSecret(typeof value === "string" ? value : "");
}

function resolveMainAiKeyWithClient(req: express.Request): MainGrokResolveResult {
  // Prefer the user's own key from onboarding / Secrets (BYOK).
  const client = readClientXaiApiKey(req);
  if (client.length >= MIN_KEY_LEN) {
    return { ok: true, apiKey: client, source: "client" };
  }
  if (client && client.length > 0) {
    return {
      ok: false,
      code: "INVALID_LENGTH",
      message: "Your Grok API key looks too short. Paste the full key from the xAI console.",
      hint: "Open Onboarding or Settings, paste your xAI API key, then try again.",
    };
  }
  return resolveEnvMainAiKey();
}

/**
 * Resolves the **main** AI key for chat, UI tools, and code paths.
 * Prefers browser BYOK header `X-Nebula-Xai-Api-Key`, then server `MAIN_API_KEY_GROK`.
 */
export function createResolveMainGrokApiKey(_readSessionUid: (req: express.Request) => string | null) {
  void _readSessionUid;
  return async function resolveMainGrokApiKey(
    req: express.Request,
    _bodyGrokOverride?: string
  ): Promise<string> {
    void _bodyGrokOverride;
    const r = resolveMainAiKeyWithClient(req);
    return r.ok ? r.apiKey : "";
  };
}

/** Same as {@link createResolveMainGrokApiKey} with explicit error codes for `/api/grok/chat`. */
export function createResolveMainGrokApiKeyDetailed(_readSessionUid: (req: express.Request) => string | null) {
  void _readSessionUid;
  return async function resolveMainGrokApiKeyDetailed(
    req: express.Request,
    _bodyGrokOverride?: string
  ): Promise<MainGrokResolveResult> {
    void _bodyGrokOverride;
    return resolveMainAiKeyWithClient(req);
  };
}
