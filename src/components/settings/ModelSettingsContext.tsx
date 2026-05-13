'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getUserCapabilities, type ChatModelFamily, type UserCapabilities, type UserTier } from '@/lib/user-tier';

const CHAT_MODEL_KEY = 'nebula-chat-model-family';
const AGENTS_PREF_KEY = 'nebula-agents-enabled';

function readStoredChatModel(): ChatModelFamily {
  if (typeof window === 'undefined') return 'grok-4.1';
  const v = localStorage.getItem(CHAT_MODEL_KEY);
  if (v === 'grok-3' || v === 'grok-4.1') return v;
  return 'grok-4.1';
}

function readAgentsPref(): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem(AGENTS_PREF_KEY) !== '0';
}

export type ModelSettingsContextValue = {
  billingTier: UserTier;
  capabilities: UserCapabilities;
  /** Effective chat model for the next request (tier + user choice). */
  chatModel: ChatModelFamily;
  setChatModel: (m: ChatModelFamily) => void;
  /** Swarm toggle — meaningful only when `capabilities.agentsEnabled` is true (Power). */
  agentsEnabled: boolean;
  setAgentsEnabled: (v: boolean) => void;
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

  const [chatModel, setChatModelState] = useState<ChatModelFamily>(() =>
    capabilities.allowedChatModel === 'grok-3' ? 'grok-3' : readStoredChatModel()
  );
  const [agentsEnabled, setAgentsEnabledState] = useState<boolean>(() => readAgentsPref());

  useEffect(() => {
    if (capabilities.allowedChatModel === 'grok-3') {
      setChatModelState('grok-3');
      return;
    }
    const stored = readStoredChatModel();
    setChatModelState(stored === 'grok-3' ? 'grok-3' : 'grok-4.1');
  }, [capabilities.allowedChatModel]);

  useEffect(() => {
    if (!capabilities.agentsEnabled) {
      setAgentsEnabledState(false);
    }
  }, [capabilities.agentsEnabled]);

  const setChatModel = useCallback(
    (m: ChatModelFamily) => {
      if (capabilities.allowedChatModel === 'grok-3') {
        setChatModelState('grok-3');
        return;
      }
      const next = m === 'grok-3' ? 'grok-3' : 'grok-4.1';
      setChatModelState(next);
      try {
        localStorage.setItem(CHAT_MODEL_KEY, next);
      } catch {
        /* ignore */
      }
    },
    [capabilities.allowedChatModel]
  );

  const setAgentsEnabled = useCallback(
    (v: boolean) => {
      if (!capabilities.agentsEnabled) {
        setAgentsEnabledState(false);
        return;
      }
      setAgentsEnabledState(v);
      try {
        localStorage.setItem(AGENTS_PREF_KEY, v ? '1' : '0');
      } catch {
        /* ignore */
      }
    },
    [capabilities.agentsEnabled]
  );

  const value = useMemo<ModelSettingsContextValue>(
    () => ({
      billingTier,
      capabilities,
      chatModel: capabilities.allowedChatModel === 'grok-3' ? 'grok-3' : chatModel,
      setChatModel,
      agentsEnabled: capabilities.agentsEnabled ? agentsEnabled : false,
      setAgentsEnabled,
    }),
    [billingTier, capabilities, chatModel, setChatModel, agentsEnabled, setAgentsEnabled]
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
