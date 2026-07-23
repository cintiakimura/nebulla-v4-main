/**
 * Chat mode detection for Nebula Guardian / Smart Chat Handler.
 * Run this FIRST on every user message before routing.
 *
 * Mode sequence (product): Chat/Discovery → Architecture → Coding → Debugging → UI Generation
 * (+ File Ops short-circuit). Detector labels map to that sequence.
 */

export type ChatMode =
  | 'guided'
  | 'free'
  | 'coding'
  | 'file'
  | 'debugging'
  | 'architecture'
  | 'ui';

export type ChatModeResult = {
  mode: ChatMode;
  /** Short, beginner-friendly label for UI badges */
  label: string;
  confidence: 'high' | 'medium' | 'low';
};

const GUIDED_RE =
  /\b(new project|create (an? )?app|start from scratch|build (an? )?app|start a project)\b/i;

const ARCHITECTURE_RE =
  /\b(master plan|architecture|pages and navigation|tech\s*&\s*search|text\s*&\s*search|features and kpis|refine (the )?plan)\b/i;

const CODING_RE =
  /\b(write code|implement|add feature|refactor|edit (the )?code|generate (a )?component|paste|go code|press go)\b/i;

const DEBUG_RE =
  /\b(debug|debugging|bug|broken|not working|failing test|stack trace|exception|crash|runtime error|fix (this |the )?(bug|error|issue|crash))\b/i;

const UI_RE =
  /\b(ui studio|nebula ui|v0(\.dev)?|mockup|ui\/ux|generate ui|visual editor|design system for (the )?app)\b/i;

const FILE_RE =
  /\b(open file|load file|show (me )?the file|from github|open github|edit [\w./-]+\.(ts|tsx|js|jsx|md|json|css))\b/i;

const GITHUB_URL_RE = /https?:\/\/(?:www\.)?(?:github\.com|raw\.githubusercontent\.com)\//i;

const LOCAL_PATH_HINT_RE =
  /(?:^|\s)((?:nebulla-project|nebula-project|src|app|lib|components)\/[\w./-]+|[\w./-]+\.(?:ts|tsx|js|jsx|md|json|css))\b/i;

/**
 * Detect which chat mode best matches the user message.
 * Defaults to free chat when unsure (never force Master Plan).
 * File mode must not steal Coding / Guided / Architecture / Debugging intents.
 */
export function detectChatMode(input: string): ChatModeResult {
  const text = String(input || '').trim();
  if (!text) {
    return { mode: 'free', label: 'Chat', confidence: 'low' };
  }

  const looksGuided = GUIDED_RE.test(text);
  const looksArchitecture = ARCHITECTURE_RE.test(text);
  const looksDebug = DEBUG_RE.test(text);
  const looksUi = UI_RE.test(text);
  const looksCoding = CODING_RE.test(text) || /```/.test(text) || /\bfix\b/i.test(text);
  const hasGitHubUrl = GITHUB_URL_RE.test(text);
  const hasOpenVerb = /\b(open|load|show|read)\b/i.test(text);
  const hasFilePath =
    LOCAL_PATH_HINT_RE.test(text) || /\b[\w./-]+\.(?:ts|tsx|js|jsx|md|json|css)\b/i.test(text);
  const looksFile =
    hasGitHubUrl ||
    (hasOpenVerb && hasFilePath) ||
    (FILE_RE.test(text) && hasOpenVerb);

  // Explicit GitHub / open-path file ops (even if "fix" appears later in the message)
  if (hasGitHubUrl || (hasOpenVerb && hasFilePath && !looksGuided && !looksArchitecture)) {
    return { mode: 'file', label: 'Files', confidence: 'high' };
  }

  // Guided discovery for new projects
  if (looksGuided) {
    return { mode: 'guided', label: 'Discovery', confidence: 'high' };
  }

  // Debugging before generic coding ("fix the bug" vs "fix login")
  if (looksDebug) {
    return { mode: 'debugging', label: 'Debugging', confidence: 'high' };
  }

  // UI Generation (Studio / v0)
  if (looksUi) {
    return { mode: 'ui', label: 'UI', confidence: 'high' };
  }

  // Architecture / Master Plan refinement
  if (looksArchitecture) {
    return { mode: 'architecture', label: 'Architecture', confidence: 'high' };
  }

  if (looksCoding) {
    return { mode: 'coding', label: 'Coding', confidence: 'high' };
  }

  if (looksFile) {
    return { mode: 'file', label: 'Files', confidence: 'medium' };
  }

  return { mode: 'free', label: 'Chat', confidence: 'medium' };
}

/** Friendly one-liner explaining the active mode (for optional UI hints). */
export function describeChatMode(mode: ChatMode): string {
  switch (mode) {
    case 'guided':
      return "Let's discover your product — one clear question at a time.";
    case 'architecture':
      return "I'll deepen the Master Plan with research-backed architecture.";
    case 'coding':
      return "I'll help write or change code carefully — smallest safe change.";
    case 'debugging':
      return "Let's debug carefully: Verify → Analyze → Trace → Fix → Validate.";
    case 'ui':
      return "I'll craft a specific, research-grounded UI / V0 prompt.";
    case 'file':
      return "I'll open the file and show a preview.";
    case 'free':
    default:
      return "I'm here to chat, brainstorm, and help — depth over rush.";
  }
}
