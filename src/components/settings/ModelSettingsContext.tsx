'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_AI_CHAT_MODEL,
  normalizeAiChatModelId,
  resolveAiChatSelection,
  type AiChatModelId,
  type AiChatRequestSelection,
  type AiProviderId,
} from '../../lib/aiProvider';
import { getUserCapabilities, type UserCapabilities, type UserTier } from '../../../lib/user-tier';

const CHAT_MODEL_KEY = 'nebula-chat-model-family';

function readStoredChatModel(): AiChatModelId {
  if (typeof window === 'undefined') return DEFAULT_AI_CHAT_MODEL;
  try {
    return normalizeAiChatModelId(localStorage.getItem(CHAT_MODEL_KEY));
  } catch {
    return DEFAULT_AI_CHAT_MODEL;
  }
}

export type ModelSettingsContextValue = {
  billingTier: UserTier;
  capabilities: UserCapabilities;
  /** Catalog model id (Grok / Claude / OpenAI). */
  chatModel: AiChatModelId;
  setChatModel: (m: AiChatModelId | string) => void;
  /** Derived provider for the selected model. */
  aiProvider: AiProviderId;
  /** Normalized payload fields for `/api/grok/chat`. */
  selection: AiChatRequestSelection;
};

const ModelSettingsContext = createContext<ModelSettingsContextValue | null>(null);

export function ModelSettingsProvider({
  children,
  billingTier,
}: {
  children: React.ReactNode;
  billingTier: UserTier;
}) {
  const capabilities = useMemo(() => getUserCapabilities({ tier: billingTier }), [billingTier]);

  const [chatModel, setChatModelState] = useState<AiChatModelId>(() => {
    // Free tier historically locked to grok-3; still default there, but Pro+ may choose any.
    if (capabilities.allowedChatModel === 'grok-3') return 'grok-3';
    return readStoredChatModel();
  });

  useEffect(() => {
    if (capabilities.allowedChatModel === 'grok-3') {
      // Soft default only — do not hard-lock; user may switch provider when keys exist.
      setChatModelState((prev) => (prev.startsWith('grok') ? prev : 'grok-3'));
      return;
    }
    setChatModelState(readStoredChatModel());
  }, [capabilities.allowedChatModel]);

  useEffect(() => {
    const onExternal = (ev: Event) => {
      const detail = (ev as CustomEvent<{ modelId?: string }>).detail;
      if (detail?.modelId) setChatModelState(normalizeAiChatModelId(detail.modelId));
    };
    window.addEventListener('nebula-chat-model-changed', onExternal);
    return () => window.removeEventListener('nebula-chat-model-changed', onExternal);
  }, []);

  const setChatModel = useCallback((m: AiChatModelId | string) => {
    const next = normalizeAiChatModelId(m);
    setChatModelState(next);
    try {
      localStorage.setItem(CHAT_MODEL_KEY, next);
      window.dispatchEvent(new CustomEvent('nebula-chat-model-changed', { detail: { modelId: next } }));
    } catch {
      /* ignore */
    }
  }, []);

  const selection = useMemo(() => resolveAiChatSelection(chatModel), [chatModel]);

  const value = useMemo<ModelSettingsContextValue>(
    () => ({
      billingTier,
      capabilities,
      chatModel,
      setChatModel,
      aiProvider: selection.aiProvider,
      selection,
    }),
    [billingTier, capabilities, chatModel, setChatModel, selection],
  );

  return <ModelSettingsContext.Provider value={value}>{children}</ModelSettingsContext.Provider>;
}

export function useModelSettings(): ModelSettingsContextValue {
  const ctx = useContext(ModelSettingsContext);
  if (!ctx) {
    throw new Error('useModelSettings must be used within ModelSettingsProvider');
  }
  return ctx;
}
