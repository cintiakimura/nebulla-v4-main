/**
 * Client-facing AI provider catalog.
 * Server execution lives in `lib/aiChatCompletion.ts` — this module normalizes
 * selection, labels, and the payload sent to `/api/grok/chat`.
 *
 * Default remains Grok (xAI). Claude / OpenAI work when matching server keys exist.
 */

export type AiProviderId = 'xai' | 'anthropic' | 'openai';

/** Stable UI / localStorage ids (not always identical to upstream API model strings). */
export type AiChatModelId =
  | 'grok-3'
  | 'grok-4.1'
  | 'claude-3-5-sonnet'
  | 'gpt-4o'
  | 'gpt-4o-mini';

export type AiChatModelOption = {
  id: AiChatModelId;
  provider: AiProviderId;
  label: string;
  badge?: string | null;
  /** Hint sent as `chatModel` — server maps to the real upstream id. */
  apiModelHint: string;
};

export const DEFAULT_AI_PROVIDER: AiProviderId = 'xai';
export const DEFAULT_AI_CHAT_MODEL: AiChatModelId = 'grok-4.1';

export const AI_CHAT_MODELS: readonly AiChatModelOption[] = [
  { id: 'grok-3', provider: 'xai', label: 'Grok 3', badge: null, apiModelHint: 'grok-3' },
  {
    id: 'grok-4.1',
    provider: 'xai',
    label: 'Grok',
    badge: 'Default',
    apiModelHint: 'grok-4.1',
  },
  {
    id: 'claude-3-5-sonnet',
    provider: 'anthropic',
    label: 'Claude 3.5 Sonnet',
    badge: null,
    apiModelHint: 'claude-3-5-sonnet',
  },
  { id: 'gpt-4o', provider: 'openai', label: 'GPT-4o', badge: null, apiModelHint: 'gpt-4o' },
  {
    id: 'gpt-4o-mini',
    provider: 'openai',
    label: 'GPT-4o mini',
    badge: null,
    apiModelHint: 'gpt-4o-mini',
  },
] as const;

export const AI_PROVIDER_LABELS: Record<AiProviderId, string> = {
  xai: 'Grok (xAI)',
  anthropic: 'Claude (Anthropic)',
  openai: 'OpenAI',
};

const MODEL_BY_ID = new Map(AI_CHAT_MODELS.map((m) => [m.id, m]));

export function isAiChatModelId(v: string | null | undefined): v is AiChatModelId {
  return Boolean(v && MODEL_BY_ID.has(v as AiChatModelId));
}

export function isAiProviderId(v: string | null | undefined): v is AiProviderId {
  return v === 'xai' || v === 'anthropic' || v === 'openai';
}

export function getAiChatModelOption(id: AiChatModelId): AiChatModelOption {
  return MODEL_BY_ID.get(id) ?? MODEL_BY_ID.get(DEFAULT_AI_CHAT_MODEL)!;
}

/** Normalize legacy ids (`grok-4`, ChatModelFamily) into the catalog. */
export function normalizeAiChatModelId(raw: string | null | undefined): AiChatModelId {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'grok-4' || v === 'grok-4.1' || v === 'grok4' || v === 'grok') return 'grok-4.1';
  if (v === 'grok-3' || v === 'grok3') return 'grok-3';
  if (v === 'claude-3-5-sonnet' || v === 'claude' || v === 'claude-3.5-sonnet') {
    return 'claude-3-5-sonnet';
  }
  if (v === 'gpt-4o' || v === 'gpt4o' || v === 'openai') return 'gpt-4o';
  if (v === 'gpt-4o-mini' || v === 'gpt4o-mini') return 'gpt-4o-mini';
  if (isAiChatModelId(v)) return v;
  return DEFAULT_AI_CHAT_MODEL;
}

export type AiChatRequestSelection = {
  provider: AiProviderId;
  /** Catalog id (UI / settings). */
  modelId: AiChatModelId;
  /** Value for `/api/grok/chat` body `chatModel`. */
  chatModel: string;
  /** Value for `/api/grok/chat` body `aiProvider` (preferred provider). */
  aiProvider: AiProviderId;
  label: string;
  providerLabel: string;
};

export function resolveAiChatSelection(
  modelId: AiChatModelId | string | null | undefined,
): AiChatRequestSelection {
  const id = normalizeAiChatModelId(modelId);
  const opt = getAiChatModelOption(id);
  return {
    provider: opt.provider,
    modelId: opt.id,
    chatModel: opt.apiModelHint,
    aiProvider: opt.provider,
    label: opt.label,
    providerLabel: AI_PROVIDER_LABELS[opt.provider],
  };
}

/** Models shown in free-tier UI (Grok only; Pro+ unlocks the rest via settings). */
export function modelsForTier(allowed: 'grok-3' | 'all'): AiChatModelOption[] {
  if (allowed === 'grok-3') {
    return AI_CHAT_MODELS.filter((m) => m.id === 'grok-3');
  }
  return [...AI_CHAT_MODELS];
}
