/**
 * Talk vs Build — two model ids, one xAI key.
 * Talk = existing main chat. Build = grok-build-0.1. Never silently swap them.
 *
 * Override Build only: GROK_BUILD_MODEL (documented). GROK_CODE_MODEL is not a Talk fallback.
 */

/** Catalog / chat UI id (TopBar). Never grok-build-0.1. */
export const MODEL_TALK = "grok-4.1";

/** Default xAI upstream id for Talk when GROK_CHAT_MODEL_GROK41 / MAIN_AI_CHAT_MODEL unset. */
export const MODEL_TALK_UPSTREAM_DEFAULT = "grok-4";

/** xAI coding model for Go Code / apply. Same API key as Talk. */
export const MODEL_BUILD = "grok-build-0.1";
/** If grok-build-0.1 400/404 — coding family only, never Talk Grok. */
export const MODEL_BUILD_FALLBACK = "grok-code-fast-1";

export function isBuildModelId(model: string): boolean {
  const m = String(model || "").trim().toLowerCase();
  return /grok-build/.test(m);
}

/** Coding-family ids that must never be used on /api/grok/chat. */
export function isCodingFamilyModelId(model: string): boolean {
  const m = String(model || "").trim().toLowerCase();
  if (!m) return false;
  return /grok-build/.test(m) || /grok-code/.test(m);
}

/** Talk Completions model — current main Grok, never grok-build-0.1. */
export function resolveTalkModel(clientHint?: string): string {
  const hint = String(clientHint || "").trim().toLowerCase();
  if (hint === "grok-3" || hint === "grok3") {
    return process.env.GROK_CHAT_MODEL_GROK3?.trim() || "grok-3";
  }
  const override = process.env.MAIN_AI_CHAT_MODEL?.trim();
  if (override && !isCodingFamilyModelId(override)) return override;
  const grok41 = process.env.GROK_CHAT_MODEL_GROK41?.trim();
  if (grok41 && !isCodingFamilyModelId(grok41)) return grok41;
  return MODEL_TALK_UPSTREAM_DEFAULT;
}

/**
 * Go Code model. Default grok-build-0.1.
 * Optional env GROK_BUILD_MODEL. On API 400/404 the job may retry MODEL_BUILD_FALLBACK
 * (grok-code-fast-1) — never Talk Grok.
 */
export function resolveBuildModel(): string {
  const override = process.env.GROK_BUILD_MODEL?.trim();
  if (override) return override;
  return MODEL_BUILD;
}

export function shouldFallbackBuildModel(httpStatus: number, currentModel: string): boolean {
  if (httpStatus !== 400 && httpStatus !== 404) return false;
  const m = String(currentModel || "").trim().toLowerCase();
  if (/grok-code-fast/.test(m)) return false;
  return /grok-build/.test(m) || m === MODEL_BUILD.toLowerCase();
}

export function talkModelIsNotBuild(model: string): boolean {
  return !isCodingFamilyModelId(model);
}
