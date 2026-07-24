/**
 * First-time welcome onboarding (post-login).
 * Non-blocking, skippable; permanent dismiss via localStorage.
 */

import { hasLocalGrokApiKey } from './grokUserKey';
import { getProjectSecretValue } from './nebulaSecretHelpers';
import { getStoredV0ApiKey } from './v0Key';

export const WELCOME_ONBOARDING_DONE_KEY = 'nebula_welcome_onboarding_done_v1';
export const WELCOME_ONBOARDING_SEEN_KEY = 'nebula_welcome_onboarding_seen_v1';
export const WELCOME_ONBOARDING_SESSION_SKIP_KEY = 'nebula_welcome_onboarding_session_skip_v1';
export const WELCOME_PREFERRED_AI_PROVIDER_KEY = 'nebula_preferred_ai_provider_v1';

export type WelcomeAiProvider = 'grok' | 'claude' | 'openai' | 'gemini' | 'v0' | 'other';

/** Secret env name stored in project Secrets (avoids reserved main-Grok names). */
export function aiProviderSecretName(provider: WelcomeAiProvider): string {
  switch (provider) {
    case 'grok':
      return 'XAI_API_KEY';
    case 'claude':
      return 'ANTHROPIC_API_KEY';
    case 'openai':
      return 'OPENAI_API_KEY';
    case 'gemini':
      return 'GEMINI_API_KEY';
    case 'v0':
      return 'V0_API_KEY';
    default:
      return 'AI_API_KEY';
  }
}

export function aiProviderLabel(provider: WelcomeAiProvider): string {
  switch (provider) {
    case 'grok':
      return 'Grok (xAI)';
    case 'claude':
      return 'Claude';
    case 'openai':
      return 'OpenAI';
    case 'gemini':
      return 'Google Gemini';
    case 'v0':
      return 'V0';
    default:
      return 'Other';
  }
}

/** Where beginners get an API key for each provider. */
export function aiProviderKeysUrl(provider: WelcomeAiProvider): string | null {
  switch (provider) {
    case 'grok':
      return 'https://console.x.ai/';
    case 'claude':
      return 'https://console.anthropic.com/settings/keys';
    case 'openai':
      return 'https://platform.openai.com/api-keys';
    case 'gemini':
      return 'https://aistudio.google.com/app/apikey';
    case 'v0':
      return 'https://v0.dev/settings/api-keys';
    default:
      return null;
  }
}

export function isWelcomeOnboardingDone(): boolean {
  try {
    return localStorage.getItem(WELCOME_ONBOARDING_DONE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markWelcomeOnboardingDone(): void {
  try {
    localStorage.setItem(WELCOME_ONBOARDING_DONE_KEY, '1');
    localStorage.setItem(WELCOME_ONBOARDING_SEEN_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function markWelcomeOnboardingSeen(): void {
  try {
    localStorage.setItem(WELCOME_ONBOARDING_SEEN_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function isWelcomeOnboardingFirstVisit(): boolean {
  try {
    return localStorage.getItem(WELCOME_ONBOARDING_SEEN_KEY) !== '1';
  } catch {
    return true;
  }
}

export function isWelcomeOnboardingSessionSkipped(): boolean {
  try {
    return sessionStorage.getItem(WELCOME_ONBOARDING_SESSION_SKIP_KEY) === '1';
  } catch {
    return false;
  }
}

export function markWelcomeOnboardingSessionSkip(): void {
  try {
    sessionStorage.setItem(WELCOME_ONBOARDING_SESSION_SKIP_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function setPreferredAiProvider(provider: WelcomeAiProvider): void {
  try {
    localStorage.setItem(WELCOME_PREFERRED_AI_PROVIDER_KEY, provider);
  } catch {
    /* ignore */
  }
}

export function getPreferredAiProvider(): WelcomeAiProvider | null {
  try {
    const v = localStorage.getItem(WELCOME_PREFERRED_AI_PROVIDER_KEY);
    if (
      v === 'grok' ||
      v === 'claude' ||
      v === 'openai' ||
      v === 'gemini' ||
      v === 'v0' ||
      v === 'other'
    ) {
      return v;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function hasLocalAiApiKeys(projectKey: string): boolean {
  if (hasLocalGrokApiKey()) return true;
  if (getStoredV0ApiKey()?.trim()) return true;
  const names = [
    'XAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'OPENAI_API_KEY',
    'GEMINI_API_KEY',
    'V0_API_KEY',
    'AI_API_KEY',
    'CLAUDE_API_KEY',
  ];
  return names.some((n) => Boolean(getProjectSecretValue(projectKey, n)));
}

/**
 * Show after workspace is ready when:
 * - not permanently dismissed, and
 * - not skipped for this browser session, and
 * - first visit OR no Grok key yet (BYOK local or server main AI).
 */
export function shouldShowWelcomeOnboarding(opts: {
  projectKey: string;
  hasServerMainAiKey: boolean;
}): boolean {
  if (isWelcomeOnboardingDone()) return false;
  if (isWelcomeOnboardingSessionSkipped()) return false;
  const first = isWelcomeOnboardingFirstVisit();
  const hasGrok = opts.hasServerMainAiKey || hasLocalGrokApiKey();
  return first || !hasGrok;
}
