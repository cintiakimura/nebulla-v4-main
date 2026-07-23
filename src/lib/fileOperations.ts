/**
 * File operations for Smart Chat Handler — local workspace + public GitHub.
 * Uses existing projectKey / projectName via nebulaProjectApi.
 */

import { withProjectBody, withProjectQuery } from './nebulaProjectApi';
import { readResponseJson } from './apiFetch';

/** Browser uses relative URLs; Node/tests need an absolute origin. */
function apiUrl(pathWithQuery: string): string {
  if (typeof window !== 'undefined') return pathWithQuery;
  const base = (process.env.TEST_BASE_URL || process.env.VITE_DEV_SERVER || 'http://127.0.0.1:3000').replace(
    /\/$/,
    '',
  );
  return `${base}${pathWithQuery.startsWith('/') ? '' : '/'}${pathWithQuery}`;
}

export type OpenedFile = {
  success: true;
  path?: string;
  url?: string;
  source: 'local' | 'github';
  content: string;
  language: string;
};

export type OpenFileError = {
  success: false;
  error: string;
  /** Beginner-friendly message for chat UI */
  userMessage: string;
};

export type OpenFileResult = OpenedFile | OpenFileError;

function friendlyOpenError(raw: string, kind: 'local' | 'github'): string {
  const msg = String(raw || '').toLowerCase();
  if (msg.includes('not found')) {
    return kind === 'github'
      ? "I couldn't find that file on GitHub. Double-check the link and try again."
      : "I couldn't find that file in your project. Check the path and try again.";
  }
  if (msg.includes('too large')) {
    return 'That file is a bit too large to open here. Try a smaller file.';
  }
  if (msg.includes('only public') || msg.includes('supported')) {
    return 'I can only open public GitHub file links right now.';
  }
  return kind === 'github'
    ? "I couldn't open that GitHub file. Want to try a different link?"
    : "I couldn't open that file. Want to try another path?";
}

/**
 * Open a file from the active project workspace (or product docs like nebulla-project/).
 */
export async function openLocalFile(filePath: string): Promise<OpenFileResult> {
  const path = String(filePath || '')
    .trim()
    .replace(/^\.\/+/, '')
    .replace(/\\/g, '/');
  if (!path) {
    return {
      success: false,
      error: 'path is required',
      userMessage: 'Please share a file path so I can open it.',
    };
  }

  try {
    const res = await fetch(apiUrl(withProjectQuery('/api/files/open')), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(withProjectBody({ path })),
    });
    const data = await readResponseJson<{
      success?: boolean;
      path?: string;
      content?: string;
      language?: string;
      error?: string;
    }>(res);

    if (!res.ok || !data.content) {
      const err = data.error || `Open failed (${res.status})`;
      return { success: false, error: err, userMessage: friendlyOpenError(err, 'local') };
    }

    return {
      success: true,
      source: 'local',
      path: data.path || path,
      content: data.content,
      language: data.language || 'plaintext',
    };
  } catch (e) {
    const err = e instanceof Error ? e.message : 'Failed to open file';
    return { success: false, error: err, userMessage: friendlyOpenError(err, 'local') };
  }
}

/**
 * Open a single public GitHub blob or raw URL.
 */
export async function openGitHubFile(url: string, branch = 'main'): Promise<OpenFileResult> {
  const trimmed = String(url || '').trim();
  if (!trimmed) {
    return {
      success: false,
      error: 'url is required',
      userMessage: 'Please share a GitHub file link so I can open it.',
    };
  }

  try {
    const res = await fetch(apiUrl(withProjectQuery('/api/files/open-github')), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(withProjectBody({ url: trimmed, branch })),
    });
    const data = await readResponseJson<{
      success?: boolean;
      url?: string;
      content?: string;
      language?: string;
      error?: string;
    }>(res);

    if (!res.ok || !data.content) {
      const err = data.error || `Open failed (${res.status})`;
      return { success: false, error: err, userMessage: friendlyOpenError(err, 'github') };
    }

    return {
      success: true,
      source: 'github',
      url: data.url || trimmed,
      content: data.content,
      language: data.language || 'plaintext',
    };
  } catch (e) {
    const err = e instanceof Error ? e.message : 'Failed to open GitHub file';
    return { success: false, error: err, userMessage: friendlyOpenError(err, 'github') };
  }
}

/** Pull first GitHub URL from free text, if any. */
export function extractGitHubUrl(text: string): string | null {
  const m = String(text || '').match(
    /https?:\/\/(?:www\.)?(?:github\.com|raw\.githubusercontent\.com)\/[^\s)]+/i,
  );
  return m ? m[0].replace(/[.,;]+$/, '') : null;
}

/** Pull a likely local project path from free text. */
export function extractLocalFilePath(text: string): string | null {
  const t = String(text || '').trim();
  const quoted = t.match(/["'`]((?:nebulla-project|nebula-project|src|app|lib|components)\/[^"'`]+)["'`]/i);
  if (quoted?.[1]) return quoted[1].replace(/\\/g, '/');

  const afterOpen = t.match(
    /\b(?:open|load|show|read)(?:\s+(?:the\s+)?file)?[:\s]+([^\s]+\.(?:ts|tsx|js|jsx|md|json|css|html))\b/i,
  );
  if (afterOpen?.[1]) return afterOpen[1].replace(/\\/g, '/');

  const bare = t.match(
    /((?:nebulla-project|nebula-project|src|app|lib|components)\/[\w./-]+\.(?:ts|tsx|js|jsx|md|json|css|html))/i,
  );
  return bare?.[1]?.replace(/\\/g, '/') ?? null;
}

/** Core Guardian docs — handy shortcuts for File mode. */
export const GUARDIAN_DOC_PATHS = {
  checklist: 'nebulla-project/code-review-checklist.md',
  bugDatabase: 'nebulla-project/full-bug-database.md',
  debugging: 'nebulla-project/debugging-method.md',
  communication: 'nebulla-project/user-communication-rules.md',
} as const;
