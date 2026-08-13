/**
 * Phase 7.2 Continue failure taxonomy + Phase 7.0 key/auth detection.
 * Authority: nebula-project/recovery-orchestration.md
 */

import {
  MAIN_AI_CHAT_SETUP_HINT,
  XAI_INCORRECT_KEY_MESSAGE,
  isProviderPermissionError,
  resolveAiLimitUserMessage,
} from './grokKey';
import { getBrowserProjectKey } from './nebulaProjectApi';

export type ContinueFailureClass =
  | 'ui crash'
  | 'dead chat'
  | 'bootstrap not re-fired'
  | 'parse miss'
  | 'save miss'
  | 'key/auth fail'
  | 'unknown';

function authRejectedKey(projectKey?: string): string {
  const k = (projectKey || getBrowserProjectKey() || 'default').trim() || 'default';
  return `nebula-main-ai-auth-rejected:${k}`;
}

/** Session sticky: after 401/403, stop auto Start/Continue stampede until a successful chat. */
export function markMainAiAuthRejected(projectKey?: string): void {
  try {
    sessionStorage.setItem(authRejectedKey(projectKey), '1');
  } catch {
    /* ignore */
  }
}

export function clearMainAiAuthRejected(projectKey?: string): void {
  try {
    sessionStorage.removeItem(authRejectedKey(projectKey));
  } catch {
    /* ignore */
  }
}

/** Clear every project’s sticky 401 flag (key save / landing reset). */
export function clearAllMainAiAuthRejected(): void {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith('nebula-main-ai-auth-rejected:')) doomed.push(k);
    }
    for (const k of doomed) sessionStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

export function isMainAiAuthRejected(projectKey?: string): boolean {
  try {
    return sessionStorage.getItem(authRejectedKey(projectKey)) === '1';
  } catch {
    return false;
  }
}

/** True when the main chat key was rejected or is missing (not Free-plan metering alone). */
export function isKeyAuthFailureMessage(message: string): boolean {
  const msg = String(message || '');
  if (!msg.trim()) return false;
  const m = msg.toLowerCase();
  if (
    m.includes('grok api key') ||
    m.includes('main ai') ||
    m.includes('main_api_key_grok') ||
    m.includes('main_ai_api_key') ||
    m.includes('grok_api_key') ||
    m.includes('grok chat is unavailable') ||
    m.includes('please add your grok') ||
    m.includes('rejected this api key') ||
    m.includes('no valid api key') ||
    m.includes('invalid api key') ||
    m.includes('incorrect api key') ||
    /\bhttp\s*401\b/.test(m) ||
    /\b401\b/.test(m)
  ) {
    return true;
  }
  return isProviderPermissionError(msg);
}

export function classifyContinueFailure(input: {
  message?: string;
  uiCrashed?: boolean;
  sendNeverStarted?: boolean;
  bootstrapSkipped?: boolean;
  repliedWithoutMasterPlanTags?: boolean;
  tagsPresentButNotSaved?: boolean;
}): ContinueFailureClass {
  if (input.uiCrashed) return 'ui crash';
  if (input.message && isKeyAuthFailureMessage(input.message)) return 'key/auth fail';
  if (input.sendNeverStarted) return 'dead chat';
  if (input.bootstrapSkipped) return 'bootstrap not re-fired';
  if (input.tagsPresentButNotSaved) return 'save miss';
  if (input.repliedWithoutMasterPlanTags) return 'parse miss';
  return 'unknown';
}

export function userFacingContinueFailureMessage(
  failureClass: ContinueFailureClass,
  rawMessage: string,
  opts?: {
    billingEnabled?: boolean;
    freeTierTokenLimitDisabled?: boolean;
    hasUserByok?: boolean;
  },
): string {
  const limited = resolveAiLimitUserMessage(rawMessage, opts);
  if (failureClass === 'key/auth fail') {
    if (/incorrect api key/i.test(rawMessage)) return XAI_INCORRECT_KEY_MESSAGE;
    // Permission/quota copy when recognizable; otherwise the standard missing-key hint.
    if (limited !== rawMessage) return limited;
    return MAIN_AI_CHAT_SETUP_HINT;
  }
  return limited;
}

export function continueFailureActivityLine(
  failureClass: ContinueFailureClass,
  rawMessage?: string,
): string {
  const short = rawMessage ? rawMessage.replace(/\s+/g, ' ').slice(0, 120) : '';
  switch (failureClass) {
    case 'key/auth fail':
      return short
        ? `Continue stopped — key/auth fail: ${short}`
        : 'Continue stopped — key/auth fail (main chat key rejected or missing)';
    case 'parse miss':
      return 'Continue issue — parse miss (reply had no Master Plan tags)';
    case 'save miss':
      return 'Continue issue — save miss (tags present but Master Plan not persisted)';
    case 'bootstrap not re-fired':
      return 'Continue issue — bootstrap not re-fired';
    case 'dead chat':
      return 'Continue issue — dead chat (send never started)';
    case 'ui crash':
      return 'Continue issue — UI crash';
    default:
      return short ? `Continue failed: ${short}` : 'Continue failed';
  }
}
