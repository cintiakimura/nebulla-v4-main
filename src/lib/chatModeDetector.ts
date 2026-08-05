/**
 * Chat mode detection for Nebula Guardian / Smart Chat Handler.
 * Run this FIRST on every user message before routing.
 *
 * Default incomplete-plan path: **inference-first** (`nebula-project/inference-first-rules.md`)
 * — categorize → research → draft → build. Guided interview is opt-in only.
 *
 * Mode sequence (product): Chat / Inference-first → Architecture → Coding → Debugging → UI
 * (+ File Ops short-circuit). Explicit brainstorm / full interview → Guided Discovery.
 */

import {
  detectGuidedInterviewIntent,
  detectInferenceFirstIntent,
} from './ideStartMode';

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
   * When true, Guided interview / Discovery Q&A is required (opt-in exception).
   * Default incomplete-plan builds use inference-first with discoveryRequired false.
   */
  discoveryRequired?: boolean;
  /** When true, follow inference-first-rules.md (default for clear goals / new builds). */
  inferenceFirst?: boolean;
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
  /\b(ui studio|nebula ui|ui[-\s]?brief|ui gen(eration)?|v0(\.dev)?|mockup|ui\/ux|generate ui|visual editor|design system for (the )?app)\b/i;

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
  const planIncomplete = !masterPlanComplete;

  if (!text) {
    return {
      mode: 'free',
      label: 'Chat',
      confidence: 'low',
      discoveryRequired: false,
      inferenceFirst: planIncomplete,
    };
  }

  const wantsInterview = detectGuidedInterviewIntent(text);
  const inferenceGoal = detectInferenceFirstIntent(text, {
    masterPlanComplete,
  });
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

  // File Ops win when the user is clearly opening a path/URL.
  if (hasGitHubUrl || (hasOpenVerb && hasFilePath && !looksGuided && !looksArchitecture && !wantsInterview)) {
    return {
      mode: 'file',
      label: 'Files',
      confidence: 'high',
      discoveryRequired: false,
      inferenceFirst: false,
    };
  }

  if (looksDebug) {
    return {
      mode: 'debugging',
      label: 'Debugging',
      confidence: 'high',
      discoveryRequired: false,
      inferenceFirst: false,
    };
  }

  // Opt-in Guided interview only.
  if (wantsInterview) {
    return {
      mode: 'guided',
      label: 'Discovery',
      confidence: 'high',
      discoveryRequired: true,
      inferenceFirst: false,
    };
  }

  // Incomplete plan + clear goal / build → inference-first (default), not Q&A Discovery.
  if (
    planIncomplete &&
    (inferenceGoal || looksGuided || looksBuildExpand || looksCoding || looksArchitecture || looksUi)
  ) {
    return {
      mode: 'coding',
      label: 'Inference-first',
      confidence: 'high',
      discoveryRequired: false,
      inferenceFirst: true,
    };
  }

  if (planIncomplete && looksFile) {
    return {
      mode: 'file',
      label: 'Files',
      confidence: 'medium',
      discoveryRequired: false,
      inferenceFirst: false,
    };
  }

  if (planIncomplete) {
    return {
      mode: 'free',
      label: 'Chat',
      confidence: 'medium',
      discoveryRequired: false,
      inferenceFirst: true,
    };
  }

  // Master Plan complete — normal mode matrix
  if (looksGuided) {
    return {
      mode: 'guided',
      label: 'Discovery',
      confidence: 'high',
      discoveryRequired: false,
      inferenceFirst: false,
    };
  }

  if (looksUi) {
    return { mode: 'ui', label: 'UI', confidence: 'high', discoveryRequired: false };
  }

  if (looksArchitecture) {
    return { mode: 'architecture', label: 'Architecture', confidence: 'high', discoveryRequired: false };
  }

  if (looksCoding || looksBuildExpand || inferenceGoal) {
    return { mode: 'coding', label: 'Coding', confidence: 'high', discoveryRequired: false };
  }

  if (looksFile) {
    return { mode: 'file', label: 'Files', confidence: 'medium', discoveryRequired: false };
  }

  return { mode: 'free', label: 'Chat', confidence: 'medium', discoveryRequired: false };
}

/** Friendly one-liner explaining the active mode (for optional UI hints). */
export function describeChatMode(mode: ChatMode, discoveryRequired?: boolean): string {
  if (discoveryRequired && mode === 'guided') {
    return 'Guided interview — I will ask one clear Discovery question at a time.';
  }
  switch (mode) {
    case 'guided':
      return "Let's discover your product — one clear question at a time.";
    case 'architecture':
      return "I'll deepen the Master Plan with research-backed architecture.";
    case 'coding':
      return 'Inference-first or coding: categorize, research, draft the Master Plan, then build carefully.';
    case 'debugging':
      return "Let's debug carefully: Verify → Analyze → Trace → Fix → Validate.";
    case 'ui':
      return "I'll use your UI brief and design tokens for UI Gen — research-grounded, not vague.";
    case 'file':
      return "I'll open the file and show a preview.";
    case 'free':
    default:
      return 'Ask me anything — clear goals start inference-first; say "interview me" for guided Q&A.';
  }
}
