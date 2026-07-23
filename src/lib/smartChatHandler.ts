/**
 * Unified Smart Chat Handler — detect mode, then route to file ops or coding hints.
 * Coding / Guided / Free still continue through the normal Grok pipeline after this
 * pre-handler; File mode can fully resolve in the client.
 *
 * When Master Plan is incomplete, File opens still work, but Discovery remains required
 * before architecture/coding (see chat-mode-detection.md).
 */

import {
  detectChatMode,
  describeChatMode,
  type ChatMode,
  type ChatModeResult,
} from './chatModeDetector';
import {
  extractGitHubUrl,
  extractLocalFilePath,
  openGitHubFile,
  openLocalFile,
  type OpenedFile,
  type OpenFileResult,
} from './fileOperations';

export type SmartChatFilePreview = {
  title: string;
  source: 'local' | 'github';
  pathOrUrl: string;
  language: string;
  content: string;
};

export type SmartChatHandlerResult = {
  mode: ChatMode;
  modeMeta: ChatModeResult;
  /** When true, AIChat should NOT call Grok for this turn */
  handledLocally: boolean;
  /** Friendly assistant text for the chat bubble */
  assistantMessage: string;
  /** Optional rich file preview attachment */
  filePreview?: SmartChatFilePreview;
  /** Hint for coding pipeline (caller may still invoke Go / Grok) */
  codingHint?: string;
};

export type SmartChatHandlerOptions = {
  /** When true, Master Plan has research pillars + all sections — Discovery may be skipped. */
  masterPlanComplete?: boolean;
};

function previewFromOpened(opened: OpenedFile): SmartChatFilePreview {
  const pathOrUrl = opened.path || opened.url || 'file';
  const short =
    pathOrUrl.split('/').filter(Boolean).slice(-2).join('/') || pathOrUrl;
  return {
    title: short,
    source: opened.source,
    pathOrUrl,
    language: opened.language || 'plaintext',
    content: opened.content,
  };
}

function summarizeMarkdownPreview(content: string, maxLines = 8): string {
  const lines = content.split(/\n/).filter((l) => l.trim());
  return lines.slice(0, maxLines).join('\n').slice(0, 600);
}

/**
 * Pre-handle a user message.
 * - File mode: open local/GitHub files and return a rich preview (handled locally).
 * - Guided / Free / Coding / Debugging / Architecture / UI: NEVER handled locally —
 *   Master Plan, v0, and Go Code continue through the existing Grok pipeline unchanged.
 */
export async function handleSmartChatMessage(
  userText: string,
  opts?: SmartChatHandlerOptions,
): Promise<SmartChatHandlerResult> {
  const masterPlanComplete = opts?.masterPlanComplete === true;
  const modeMeta = detectChatMode(userText, { masterPlanComplete });
  const { mode, discoveryRequired } = modeMeta;

  // Only File mode short-circuits the Grok / Master Plan / Go pipeline.
  if (mode === 'file') {
    const gh = extractGitHubUrl(userText);
    let opened: OpenFileResult;

    if (gh) {
      opened = await openGitHubFile(gh);
    } else {
      const localPath = extractLocalFilePath(userText);
      if (!localPath) {
        return {
          mode,
          modeMeta,
          handledLocally: true,
          assistantMessage:
            "I'd love to open a file for you. Share a project path (like nebulla-project/full-bug-database.md) or a public GitHub file link.",
        };
      }
      opened = await openLocalFile(localPath);
    }

    if (opened.success === false) {
      return {
        mode,
        modeMeta,
        handledLocally: true,
        assistantMessage: opened.userMessage,
      };
    }

    const preview = previewFromOpened(opened);
    const head = summarizeMarkdownPreview(opened.content);
    const where =
      opened.source === 'github' ? 'from GitHub' : 'from your project';

    const discoveryNudge = discoveryRequired
      ? 'This project still needs Discovery (goal, project type, and research) before we architecture or code the full app. What would you like to do with this file — or shall we continue Discovery?'
      : 'What would you like to do with this file?';

    return {
      mode,
      modeMeta,
      handledLocally: true,
      filePreview: preview,
      codingHint: discoveryRequired ? 'discovery-required-after-file' : undefined,
      assistantMessage: [
        `Opened ${preview.title} ${where}.`,
        '',
        head ? `Here's a quick peek:\n${head}${opened.content.length > 600 ? '\n…' : ''}` : '',
        '',
        discoveryNudge,
      ]
        .filter(Boolean)
        .join('\n'),
    };
  }

  // Non-file modes — pass through to existing Grok chat (Master Plan + Go intact).
  // Incomplete plan + guided = hard Discovery (codingHint guided-onboarding), not a soft free hint.
  const hardDiscovery = Boolean(discoveryRequired && mode === 'guided');
  return {
    mode,
    modeMeta,
    handledLocally: false,
    assistantMessage: describeChatMode(mode, discoveryRequired),
    codingHint: hardDiscovery
      ? 'guided-onboarding'
      : discoveryRequired && (mode === 'coding' || mode === 'ui' || mode === 'architecture')
        ? 'guided-onboarding'
        : mode === 'coding'
          ? 'Use nebulla-project/code-review-checklist.md; prefer smallest safe change; architecture first unless user explicitly requested code.'
          : mode === 'debugging'
            ? 'NDM: Verify → Analyze → Trace → Fix → Validate; use full-bug-database.md; smallest safe fix.'
            : mode === 'architecture'
              ? 'Mandatory Research Pillars before §§2–5 / V0; Master Plan tags only.'
              : mode === 'ui'
                ? 'Research-grounded V0/UI Studio prompt; no vague modern/clean/user-friendly alone.'
                : mode === 'guided'
                  ? 'guided-onboarding'
                  : discoveryRequired
                    ? 'discovery-required'
                    : undefined,
  };
}
