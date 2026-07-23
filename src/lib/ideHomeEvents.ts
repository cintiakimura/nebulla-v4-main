/**
 * Events for the post-login My Projects home → chat / file flows.
 * Keeps Master Plan / Go Code intact until the user explicitly starts guided chat.
 */

export const NEBULA_START_GUIDED_CHAT = 'nebula-start-guided-chat';
export const NEBULA_START_FREE_CHAT = 'nebula-start-free-chat';
export const NEBULA_CHAT_OPEN_FILE = 'nebula-chat-open-file';

/** Persist across reload after "New Project" creates a fresh workspace. */
export const NEBULA_START_GUIDED_ON_READY_KEY = 'nebula_start_guided_on_ready';

export function dispatchStartGuidedChat(): void {
  try {
    window.dispatchEvent(new CustomEvent(NEBULA_START_GUIDED_CHAT));
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
