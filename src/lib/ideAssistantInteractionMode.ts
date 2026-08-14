/**
 * Explicit Chat vs Agent interaction mode (user-controlled).
 * Orthogonal to chatModeDetector labels (guided/free/coding/…).
 *
 * Agent (default) = coding pipeline (Go, START_CODING, file apply).
 * Chat = opt-in brainstorm / discovery / plan discussion (no file writes).
 *
 * Users click **Chat** when they want to talk without building — not the
 * other way around — so the coding agent is never blocked by a default-off Agent button.
 */

import { t } from './i18n/t';

export type IdeAssistantInteractionMode = 'chat' | 'agent';

const STORAGE_PREFIX = 'nebula-assistant-interaction-mode-v2:';

export function interactionModeStorageKey(projectKey: string): string {
  const key = (projectKey || 'default').trim() || 'default';
  return `${STORAGE_PREFIX}${key}`;
}

export function normalizeInteractionMode(
  value: unknown,
): IdeAssistantInteractionMode {
  return value === 'chat' ? 'chat' : 'agent';
}

/** Default is Agent so coding/Go is never blocked until the user opts into Chat. */
export function readStoredInteractionMode(
  projectKey: string,
): IdeAssistantInteractionMode {
  try {
    return normalizeInteractionMode(
      localStorage.getItem(interactionModeStorageKey(projectKey)),
    );
  } catch {
    return 'agent';
  }
}

export function writeStoredInteractionMode(
  projectKey: string,
  mode: IdeAssistantInteractionMode,
): void {
  try {
    localStorage.setItem(interactionModeStorageKey(projectKey), mode);
  } catch {
    /* ignore */
  }
}

/** Detector modes that require Agent when the user locked Chat. */
export function isAgentLockedDetectorMode(mode: string | undefined): boolean {
  const m = (mode || '').trim().toLowerCase();
  return m === 'coding' || m === 'debugging' || m === 'ui';
}

export function interactionModeStatusLabel(
  mode: IdeAssistantInteractionMode,
): string {
  return mode === 'agent' ? t('chat.status.agent') : t('chat.status.chat');
}

export function interactionModeIdleSubhead(
  mode: IdeAssistantInteractionMode,
): string {
  return mode === 'agent' ? t('chat.idle.agent') : t('chat.idle.chat');
}

/** Local reply when Chat mode blocks a coding / debug / UI intent. */
export function buildSwitchToAgentPrompt(options: {
  detectorMode: string;
  discoveryRequired?: boolean;
}): string {
  const kindKey =
    options.detectorMode === 'debugging'
      ? 'chat.switchKind.debug'
      : options.detectorMode === 'ui'
        ? 'chat.switchKind.ui'
        : 'chat.switchKind.implement';
  const discovery = options.discoveryRequired ? t('chat.switchDiscovery') : '';
  return t('chat.switchPrompt', { discovery, kind: t(kindKey) });
}
