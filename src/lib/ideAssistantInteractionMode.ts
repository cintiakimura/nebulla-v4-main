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
  return mode === 'agent' ? 'Agent · coding' : 'Chat · brainstorming';
}

export function interactionModeIdleSubhead(
  mode: IdeAssistantInteractionMode,
): string {
  return mode === 'agent'
    ? 'Agent mode — Go runs Grok Code and writes files. Switch to Chat to brainstorm without spending agent tokens.'
    : 'Chat mode — brainstorm & plan. Switch to Agent when you are ready to build or edit code.';
}

/** Local reply when Chat mode blocks a coding / debug / UI intent. */
export function buildSwitchToAgentPrompt(options: {
  detectorMode: string;
  discoveryRequired?: boolean;
}): string {
  const kind =
    options.detectorMode === 'debugging'
      ? 'debug'
      : options.detectorMode === 'ui'
        ? 'generate UI'
        : 'implement';
  const discovery = options.discoveryRequired
    ? ' Discovery is still open on this project — Agent will keep those gates.'
    : '';
  return (
    `You're in **Chat** (brainstorm & plan) — I won't write files or run the coding agent while we talk.${discovery}\n\n` +
    `Switch to **Agent** to ${kind}?`
  );
}
