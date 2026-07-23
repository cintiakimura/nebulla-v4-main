/**
 * Chat mode detection for Nebula Guardian / Smart Chat Handler.
 * Run this FIRST on every user message before routing.
 *
 * Mode sequence (product): Chat/Discovery → Architecture → Coding → Debugging → UI Generation
 * (+ File Ops short-circuit). Detector labels map to that sequence.
 *
 * Critical: File / Free Chat / paste-code / "just build" must NOT permanently skip Discovery.
 * If the project lacks a complete Master Plan (with research pillars), prefer Discovery
 * before serious Architecture / Coding / UI work.
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
  /**
   * When true, Master Plan is incomplete — Discovery + Research Pillars are still required
   * before architecture/coding (even after a File open).
   */
  discoveryRequired?: boolean;
};

export type DetectChatModeOptions = {
  /** When false/undefined, treat Master Plan as incomplete and gate build paths into Discovery. */
  masterPlanComplete?: boolean;
};

const GUIDED_RE =
  /\b(new project|create (an? )?app|start from scratch|build (an? )?app|start a project|just build|build something|make (me )?(an? )?app)\b/i;

/** Incomplete-plan hard gate: expand/build/continue must enter Discovery (not soft free). */
const BUILD_EXPAND_RE =
  /\b(expand(\s+(this|the|on|it))?|build\s+(on|out|upon|from)\b|build\s+out\b|continue(\s+(building|with|the\s+project|the\s+app|discovery))?|improve\s+(this|the|and\s+expand)|turn\s+this\s+into|make\s+(this|it)\s+(a\s+|an\s+)?(full\s+)?app|scaffold(\s+the)?|proceed\s+with\s+(the\s+)?(app|project|build)|keep\s+(building|going))\b/i;

const ARCHITECTURE_RE =
  /\b(master plan|architecture|pages and navigation|tech\s*&\s*search|text\s*&\s*search|features and kpis|refine (the )?plan)\b/i;

const CODING_RE =
  /\b(write code|implement|add feature|refactor|edit (the )?code|generate (a )?component|paste|go code|press go)\b/i;

/**
 * Debug intent only — never match bare "bug"/"error"/"fix" inside filenames/paths.
 * Paths/URLs are stripped before this runs.
 * Allows words between "fix" and "bug" (e.g. "fix the login bug").
 */
const DEBUG_INTENT_RE =
  /\b(debug(?:ging)?|broken|not working|failing test|stack trace|exception|crash|runtime error|null reference|cannot read propert(?:y|ies)|typeerror|referenceerror|fix(?:\s+\w+){0,6}\s+(?:bug|error|issue|crash)|(?:bug|error|issue|crash)(?:\s+\w+){0,4}\s+fix|there(?:'s| is) (?:a |an )?(?:bug|error)|got (?:an? )?error|throws?)\b/i;

const UI_RE =
  /\b(ui studio|nebula ui|v0(\.dev)?|mockup|ui\/ux|generate ui|visual editor|design system for (the )?app)\b/i;

const FILE_RE =
  /\b(open file|load file|show (me )?the file|from github|open github|edit [\w./-]+\.(ts|tsx|js|jsx|md|json|css))\b/i;

const GITHUB_URL_RE = /https?:\/\/(?:www\.)?(?:github\.com|raw\.githubusercontent\.com)\//i;

const LOCAL_PATH_HINT_RE =
  /(?:^|\s)((?:nebulla-project|nebula-project|src|app|lib|components)\/[\w./-]+|[\w./-]+\.(?:ts|tsx|js|jsx|md|json|css))\b/i;

/** Remove paths/URLs so words like "bug" in full-bug-database.md cannot trigger Debugging. */
function stripPathsAndUrls(text: string): string {
  return text
    .replace(GITHUB_URL_RE, ' ')
    .replace(/(?:^|\s)((?:nebulla-project|nebula-project|src|app|lib|components)\/[\w./-]+)/gi, ' ')
    .replace(/\b[\w./-]+\.(?:ts|tsx|js|jsx|md|json|css)\b/gi, ' ');
}

function looksLikeDebugIntent(text: string): boolean {
  return DEBUG_INTENT_RE.test(stripPathsAndUrls(text));
}

/**
 * Detect which chat mode best matches the user message.
 * File mode must not permanently skip Discovery when the Master Plan is incomplete.
 */
export function detectChatMode(
  input: string,
  opts?: DetectChatModeOptions,
): ChatModeResult {
  const text = String(input || '').trim();
  const masterPlanComplete = opts?.masterPlanComplete === true;
  const discoveryRequired = !masterPlanComplete;

  if (!text) {
    return {
      mode: discoveryRequired ? 'guided' : 'free',
      label: discoveryRequired ? 'Discovery' : 'Chat',
      confidence: 'low',
      discoveryRequired,
    };
  }

  const looksGuided = GUIDED_RE.test(text);
  const looksBuildExpand = BUILD_EXPAND_RE.test(text);
  const looksArchitecture = ARCHITECTURE_RE.test(text);
  const looksDebug = looksLikeDebugIntent(text);
  const looksUi = UI_RE.test(text);
  // Bare "fix" alone is too broad (collides with debugging); require coding verbs or fences.
  const looksCoding =
    CODING_RE.test(text) ||
    /```/.test(text) ||
    (/\bfix\b/i.test(text) && !looksDebug);
  const hasGitHubUrl = GITHUB_URL_RE.test(text);
  const hasOpenVerb = /\b(open|load|show|read)\b/i.test(text);
  const hasFilePath =
    LOCAL_PATH_HINT_RE.test(text) || /\b[\w./-]+\.(?:ts|tsx|js|jsx|md|json|css)\b/i.test(text);
  const looksFile =
    hasGitHubUrl ||
    (hasOpenVerb && hasFilePath) ||
    (FILE_RE.test(text) && hasOpenVerb);

  // File Ops win over Debugging when the user is clearly opening a path/URL —
  // even if the filename contains "bug", "error", or "fix".
  if (hasGitHubUrl || (hasOpenVerb && hasFilePath && !looksGuided && !looksArchitecture)) {
    return {
      mode: 'file',
      label: 'Files',
      confidence: 'high',
      discoveryRequired,
    };
  }

  // Incomplete Master Plan: force Discovery for build / architecture / UI / guided intents
  // (Debugging existing code may still run NDM; Free casual Q&A may stay free.)
  if (discoveryRequired) {
    // NDM before Discovery for clear bug/error language — tiny fixes must not be blocked.
    if (looksDebug) {
      return {
        mode: 'debugging',
        label: 'Debugging',
        confidence: 'high',
        discoveryRequired: true,
      };
    }
    if (looksGuided || looksBuildExpand || looksCoding || looksArchitecture || looksUi) {
      return {
        mode: 'guided',
        label: 'Discovery',
        confidence: 'high',
        discoveryRequired: true,
      };
    }
    if (looksFile) {
      return {
        mode: 'file',
        label: 'Files',
        confidence: 'medium',
        discoveryRequired: true,
      };
    }
    // Free chat is allowed, but discoveryRequired stays true so the model resumes Discovery
    // before architecture / coding.
    return {
      mode: 'free',
      label: 'Chat',
      confidence: 'medium',
      discoveryRequired: true,
    };
  }

  // Master Plan complete — normal mode matrix
  if (looksGuided) {
    return { mode: 'guided', label: 'Discovery', confidence: 'high', discoveryRequired: false };
  }

  if (looksDebug) {
    return { mode: 'debugging', label: 'Debugging', confidence: 'high', discoveryRequired: false };
  }

  if (looksUi) {
    return { mode: 'ui', label: 'UI', confidence: 'high', discoveryRequired: false };
  }

  if (looksArchitecture) {
    return { mode: 'architecture', label: 'Architecture', confidence: 'high', discoveryRequired: false };
  }

  if (looksCoding || looksBuildExpand) {
    return { mode: 'coding', label: 'Coding', confidence: 'high', discoveryRequired: false };
  }

  if (looksFile) {
    return { mode: 'file', label: 'Files', confidence: 'medium', discoveryRequired: false };
  }

  return { mode: 'free', label: 'Chat', confidence: 'medium', discoveryRequired: false };
}

/** Friendly one-liner explaining the active mode (for optional UI hints). */
export function describeChatMode(mode: ChatMode, discoveryRequired?: boolean): string {
  if (discoveryRequired && mode !== 'file' && mode !== 'debugging') {
    return "Let's finish Discovery first (goal, project type, and research) before architecture or coding.";
  }
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
      return discoveryRequired
        ? "I'll open the file — then we should finish Discovery before building."
        : "I'll open the file and show a preview.";
    case 'free':
    default:
      return discoveryRequired
        ? "Happy to chat — when you're ready to build, we'll complete Discovery and the Research Pillars first."
        : "I'm here to chat, brainstorm, and help — depth over rush.";
  }
}
