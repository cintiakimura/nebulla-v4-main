import type express from "express";
import { getNebulaPgPool } from "./nebulaPgPool";
import {
  getUserByokApiKeyDecrypted,
  type ByokProvider,
  isByokProvider,
} from "./nebulaUserGrokStore";
import type { MainAiProvider } from "./nebulaMainAiProvider";

/** Canonical server env var for the main Grok / xAI brain (chat, coding, UI tools, Master Plan). */
export const MAIN_AI_ENV_VAR = "MAIN_API_KEY_GROK";

/** Older names still read when `MAIN_API_KEY_GROK` is unset (migration). */
const LEGACY_MAIN_AI_ENV_VARS = ["MAIN_AI_API_KEY", "GROK_API_KEY_LUMEN"] as const;

/** @deprecated Use {@link MAIN_AI_ENV_VAR}. */
export const MAIN_GROK_ENV_VAR = MAIN_AI_ENV_VAR;

/** Shown in API errors and product UI when no usable main AI key is available. */
export const MAIN_AI_KEY_SETUP_HINT =
  `Add your AI API key in Onboarding or Secrets (saved encrypted on your account). ` +
  `Optional platform fallback: set ${MAIN_AI_ENV_VAR} on the server. Legacy aliases: MAIN_AI_API_KEY, GROK_API_KEY_LUMEN.`;

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

/** Browser BYOK header (migration). Prefer account-encrypted keys after save. */
export const NEBULLA_XAI_HEADER = "x-nebula-xai-api-key";
export const NEBULLA_ANTHROPIC_HEADER = "x-nebula-anthropic-api-key";
export const NEBULLA_OPENAI_HEADER = "x-nebula-openai-api-key";

export type MainGrokKeySource = "user_db" | "client" | "env";

export type MainGrokResolveOk = {
  ok: true;
  apiKey: string;
  source: MainGrokKeySource;
  provider: MainAiProvider;
};

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

function readEnvKeyForProvider(provider: ByokProvider): string {
  if (provider === "xai") {
    const main = readMainAiApiKeyFromEnv();
    if (main) return main;
    return sanitizeEnvSecret(process.env.XAI_API_KEY ?? "");
  }
  if (provider === "anthropic") {
    return (
      sanitizeEnvSecret(process.env.CLAUDE_API_KEY ?? "") ||
      sanitizeEnvSecret(process.env.ANTHROPIC_API_KEY ?? "")
    );
  }
  return sanitizeEnvSecret(process.env.OPENAI_API_KEY ?? "");
}

/** Last 4 chars of the configured platform key (for matching local vs Render without exposing the secret). */
export function mainAiApiKeyTail(): string | undefined {
  const k = readMainAiApiKeyFromEnv();
  return k.length >= 8 ? k.slice(-4) : undefined;
}

function headerNameForProvider(provider: ByokProvider): string {
  if (provider === "anthropic") return NEBULLA_ANTHROPIC_HEADER;
  if (provider === "openai") return NEBULLA_OPENAI_HEADER;
  return NEBULLA_XAI_HEADER;
}

function readClientHeaderKey(req: express.Request, provider: ByokProvider): string {
  const raw = req.headers[headerNameForProvider(provider)];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return sanitizeEnvSecret(typeof value === "string" ? value : "");
}

function normalizePreferred(preferred?: MainAiProvider | string | null): ByokProvider {
  const p = String(preferred || "xai").trim().toLowerCase();
  if (isByokProvider(p)) return p;
  return "xai";
}

/**
 * Resolve AI key for a provider:
 * 1) encrypted user DB (session)
 * 2) migration browser header
 * 3) platform env for that provider
 */
export async function resolveAiApiKeyDetailed(
  req: express.Request,
  readSessionUid: (req: express.Request) => string | null,
  preferred?: MainAiProvider | string | null,
): Promise<MainGrokResolveResult> {
  const provider = normalizePreferred(preferred);

  const uid = readSessionUid(req);
  const pool = getNebulaPgPool();
  if (uid && pool) {
    try {
      const fromDb = await getUserByokApiKeyDecrypted(pool, uid, provider);
      if (fromDb && fromDb.length >= MIN_KEY_LEN) {
        return { ok: true, apiKey: fromDb, source: "user_db", provider };
      }
    } catch (e) {
      console.warn("[byok] user key read failed:", e instanceof Error ? e.message : String(e));
    }
  }

  const client = readClientHeaderKey(req, provider);
  if (client.length >= MIN_KEY_LEN) {
    return { ok: true, apiKey: client, source: "client", provider };
  }
  if (client && client.length > 0) {
    return {
      ok: false,
      code: "INVALID_LENGTH",
      message: "Your AI API key looks too short. Paste the full key from the provider console.",
      hint: "Open Onboarding or Secrets, paste your key, then try again.",
    };
  }

  // Prefer exact provider env; for main brain also allow any MAIN_API_KEY_GROK shape.
  const envExact = readEnvKeyForProvider(provider);
  if (envExact.length >= MIN_KEY_LEN) {
    return { ok: true, apiKey: envExact, source: "env", provider };
  }

  if (provider !== "xai") {
    const main = readMainAiApiKeyFromEnv();
    if (main.length >= MIN_KEY_LEN) {
      return { ok: true, apiKey: main, source: "env", provider: "xai" };
    }
  }

  return {
    ok: false,
    code: "MISSING",
    message:
      "No AI API key available. Add your key in Onboarding or Secrets (saved on your account), or set a platform fallback on the server.",
    hint: MAIN_AI_KEY_SETUP_HINT,
  };
}

/**
 * Resolves the **main** AI key for chat, UI tools, and code paths.
 * Prefers encrypted account key → browser BYOK header → server `MAIN_API_KEY_GROK`.
 */
export function createResolveMainGrokApiKey(readSessionUid: (req: express.Request) => string | null) {
  return async function resolveMainGrokApiKey(
    req: express.Request,
    _bodyGrokOverride?: string,
  ): Promise<string> {
    void _bodyGrokOverride;
    const r = await resolveAiApiKeyDetailed(req, readSessionUid, "xai");
    return r.ok ? r.apiKey : "";
  };
}

/** Same as {@link createResolveMainGrokApiKey} with explicit error codes for `/api/grok/chat`. */
export function createResolveMainGrokApiKeyDetailed(
  readSessionUid: (req: express.Request) => string | null,
) {
  return async function resolveMainGrokApiKeyDetailed(
    req: express.Request,
    preferredProvider?: MainAiProvider | string | null,
  ): Promise<MainGrokResolveResult> {
    return resolveAiApiKeyDetailed(req, readSessionUid, preferredProvider ?? "xai");
  };
}
