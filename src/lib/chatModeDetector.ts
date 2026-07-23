/**
 * Chat mode detection for Nebula Guardian / Smart Chat Handler.
 * Run this FIRST on every user message before routing.
 */

export type ChatMode = 'guided' | 'free' | 'coding' | 'file';

export type ChatModeResult = {
  mode: ChatMode;
  /** Short, beginner-friendly label for UI badges */
  label: string;
  confidence: 'high' | 'medium' | 'low';
};

const GUIDED_RE =
  /\b(new project|create (an? )?app|start from scratch|build (an? )?app|master plan|start a project)\b/i;

const CODING_RE =
  /\b(write code|fix|implement|add feature|refactor|edit (the )?code|generate (a )?component|paste)\b/i;

const FILE_RE =
  /\b(open file|load file|show (me )?the file|from github|open github|edit [\w./-]+\.(ts|tsx|js|jsx|md|json|css))\b/i;

const GITHUB_URL_RE = /https?:\/\/(?:www\.)?(?:github\.com|raw\.githubusercontent\.com)\//i;

const LOCAL_PATH_HINT_RE =
  /(?:^|\s)((?:nebulla-project|nebula-project|src|app|lib|components)\/[\w./-]+|[\w./-]+\.(?:ts|tsx|js|jsx|md|json|css))\b/i;

/**
 * Detect which chat mode best matches the user message.
 * Defaults to free chat when unsure (never force Master Plan).
 */
export function detectChatMode(input: string): ChatModeResult {
  const text = String(input || '').trim();
  if (!text) {
    return { mode: 'free', label: 'Chat', confidence: 'low' };
  }

  // File ops win when a GitHub URL or clear open/load intent is present
  if (GITHUB_URL_RE.test(text) || FILE_RE.test(text) || /\bopen\b.+\.(md|ts|tsx|js|jsx)\b/i.test(text)) {
    return { mode: 'file', label: 'Files', confidence: 'high' };
  }

  if (LOCAL_PATH_HINT_RE.test(text) && /\b(open|load|show|read)\b/i.test(text)) {
    return { mode: 'file', label: 'Files', confidence: 'medium' };
  }

  if (GUIDED_RE.test(text)) {
    return { mode: 'guided', label: 'New project', confidence: 'high' };
  }

  if (CODING_RE.test(text) || /```/.test(text)) {
    return { mode: 'coding', label: 'Coding', confidence: 'high' };
  }

  return { mode: 'free', label: 'Chat', confidence: 'medium' };
}

/** Friendly one-liner explaining the active mode (for optional UI hints). */
export function describeChatMode(mode: ChatMode): string {
  switch (mode) {
    case 'guided':
      return "Let's start a new project — one clear question at a time.";
    case 'coding':
      return "I'll help write or fix code carefully.";
    case 'file':
      return "I'll open the file and show a preview.";
    case 'free':
    default:
      return "I'm here to chat and help however you need.";
  }
}
