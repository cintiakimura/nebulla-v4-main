/**
 * Events for the post-login My Projects home → chat / file flows.
 * Keeps Master Plan / Go Code intact until the user explicitly starts guided chat.
 */

import type { NebulaProjectType } from './nebulaProjectType';
import { setStoredProjectType } from './nebulaProjectType';

export type { NebulaProjectType } from './nebulaProjectType';

export const NEBULA_START_GUIDED_CHAT = 'nebula-start-guided-chat';
export const NEBULA_START_FREE_CHAT = 'nebula-start-free-chat';
export const NEBULA_CHAT_OPEN_FILE = 'nebula-chat-open-file';

/** Persist across reload after "New Project" creates a fresh workspace. */
export const NEBULA_START_GUIDED_ON_READY_KEY = 'nebula_start_guided_on_ready';

/** Discovery project type chosen on My Projects (Web / Mobile / Landing). */
export const NEBULA_PENDING_PROJECT_TYPE_KEY = 'nebula_pending_project_type_v1';

export type StartGuidedChatDetail = {
  projectType?: NebulaProjectType;
};

export function dispatchStartGuidedChat(detail?: StartGuidedChatDetail): void {
  try {
    window.dispatchEvent(new CustomEvent(NEBULA_START_GUIDED_CHAT, { detail: detail ?? {} }));
  } catch {
    /* ignore */
  }
}

export function dispatchStartFreeChat(): void {
  try {
    window.dispatchEvent(new CustomEvent(NEBULA_START_FREE_CHAT));
  } catch {
    /* ignore */
  }
}

/** Ask IDE chat to open a local path or GitHub URL via Smart Chat Handler. */
export function dispatchChatOpenFile(target: { path?: string; url?: string }): void {
  try {
    window.dispatchEvent(new CustomEvent(NEBULA_CHAT_OPEN_FILE, { detail: target }));
  } catch {
    /* ignore */
  }
}

export function markGuidedStartOnReady(): void {
  try {
    localStorage.setItem(NEBULA_START_GUIDED_ON_READY_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function consumeGuidedStartOnReady(): boolean {
  try {
    if (localStorage.getItem(NEBULA_START_GUIDED_ON_READY_KEY) === '1') {
      localStorage.removeItem(NEBULA_START_GUIDED_ON_READY_KEY);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export function setPendingProjectType(type: NebulaProjectType): void {
  try {
    localStorage.setItem(NEBULA_PENDING_PROJECT_TYPE_KEY, type);
  } catch {
    /* ignore */
  }
  // Durable copy for UI Studio / App Preview framing (survives consumePendingProjectType).
  setStoredProjectType(type);
}

export function peekPendingProjectType(): NebulaProjectType | null {
  try {
    const v = localStorage.getItem(NEBULA_PENDING_PROJECT_TYPE_KEY)?.trim();
    if (v === 'Web App' || v === 'Mobile App' || v === 'Landing Page') return v;
  } catch {
    /* ignore */
  }
  return null;
}

/** Read and clear pending project type (once per guided start). */
export function consumePendingProjectType(): NebulaProjectType | null {
  const v = peekPendingProjectType();
  if (!v) return null;
  setStoredProjectType(v);
  try {
    localStorage.removeItem(NEBULA_PENDING_PROJECT_TYPE_KEY);
  } catch {
    /* ignore */
  }
  return v;
}
