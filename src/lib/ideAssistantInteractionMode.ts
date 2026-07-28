/**
 * Explicit Chat vs Agent interaction mode (user-controlled).
 * Orthogonal to chatModeDetector labels (guided/free/coding/…).
 *
 * Chat = brainstorm / discovery / plan discussion (no file writes).
 * Agent = coding pipeline (Go, START_CODING, file apply).
 *
 * Rationale: BYOK makes every agent turn cost the user; voice brainstorming
 * must not accidentally trigger coding.
 */

import { t } from './i18n/t';

export type IdeAssistantInteractionMode = 'chat' | 'agent';

const STORAGE_PREFIX = 'nebula-assistant-interaction-mode:';

export function interactionModeStorageKey(projectKey: string): string {
  const key = (projectKey || 'default').trim() || 'default';
  return `${STORAGE_PREFIX}${key}`;
}

export function normalizeInteractionMode(
  value: unknown,
): IdeAssistantInteractionMode {
  return value === 'agent' ? 'agent' : 'chat';
}

/** Default is always Chat (safer for voice + incomplete Master Plan). */
export function readStoredInteractionMode(
  projectKey: string,
): IdeAssistantInteractionMode {
  try {
    return normalizeInteractionMode(
      localStorage.getItem(interactionModeStorageKey(projectKey)),
    );
  } catch {
    return 'chat';
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
