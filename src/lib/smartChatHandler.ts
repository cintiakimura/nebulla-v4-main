/**
 * Unified Smart Chat Handler — detect mode, then route to file ops or coding hints.
 * Coding / Guided / Free still continue through the normal Grok pipeline after this
 * pre-handler; File mode can fully resolve in the client.
 */

import { detectChatMode, describeChatMode, type ChatMode, type ChatModeResult } from './chatModeDetector';
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
 * - Guided / Free / Coding: NEVER handled locally — Master Plan, v0, and Go Code
 *   continue through the existing Grok pipeline unchanged.
 */
export async function handleSmartChatMessage(userText: string): Promise<SmartChatHandlerResult> {
  const modeMeta = detectChatMode(userText);
  const { mode } = modeMeta;

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

    return {
      mode,
      modeMeta,
      handledLocally: true,
      filePreview: preview,
      assistantMessage: [
        `Opened ${preview.title} ${where}.`,
        '',
        head ? `Here's a quick peek:\n${head}${opened.content.length > 600 ? '\n…' : ''}` : '',
        '',
        'What would you like to do with this file?',
      ]
        .filter(Boolean)
        .join('\n'),
    };
  }

  // Guided / Coding / Free — pass through to existing Grok chat (Master Plan + Go intact).
  return {
    mode,
    modeMeta,
    handledLocally: false,
    assistantMessage: describeChatMode(mode),
    codingHint:
      mode === 'coding'
        ? 'Use nebulla-project/code-review-checklist.md; on errors use full-bug-database.md + NDM.'
        : mode === 'guided'
          ? 'guided-onboarding'
          : undefined,
  };
}
