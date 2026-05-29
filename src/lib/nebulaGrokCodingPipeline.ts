import { fetchJson } from './apiFetch';
import { extractGrokFilePaths, normalizeGrokFileBlockSyntax } from './grokChatArtifacts';
import { runPostCodingWorkspaceSync } from './ideArtifactSync';
import type { GrokActivityProgressFn } from './ideGrokActivityStatus';
import { startGrokActivityWaitTicker } from './ideGrokActivityStatus';
import { withProjectBody, withProjectQuery } from './nebulaProjectApi';

const START_CODING_RE = /<\s*START_CODING\s*>|\bSTART_CODING\b/i;
const FILE_BLOCK_RE = /```file:/i;

export function hasGrokFileBlocks(text: string): boolean {
  return FILE_BLOCK_RE.test(text);
}

export function isCodingIntent(text: string): boolean {
  return START_CODING_RE.test(text);
}

export type ApplyGeneratedResult = {
  ok: boolean;
  writtenCount: number;
  skippedCount: number;
  message: string;
  error?: string;
};

function stripNonFileArtifacts(text: string): string {
  return text
    .replace(/<REASONING>[\s\S]*?<\/REASONING>/gi, '')
    .replace(/<START_MASTERPLAN>[\s\S]*?<\/?END_MASTERPLAN>/gi, '')
    .replace(/<\s*START_CODING\s*>/gi, '')
    .replace(/\bSTART_CODING\b/gi, '')
    .trim();
}

export function notifyWorkspaceFilesChanged(): void {
  /* Events are dispatched after artifact + mind-map sync in runPostCodingWorkspaceSync. */
}

async function afterFilesAppliedArtifacts(
  userNote?: string,
  projectName?: string,
  onProgress?: GrokActivityProgressFn,
): Promise<void> {
  await runPostCodingWorkspaceSync({
    userNote,
    projectName,
    seedBasicUi: false,
    openMindMap: true,
    onProgress,
  });
}

export async function applyGeneratedFiles(
  content: string,
  artifactContext?: { userNote?: string; projectName?: string; onProgress?: GrokActivityProgressFn },
): Promise<ApplyGeneratedResult> {
  const onProgress = artifactContext?.onProgress;
  const clean = stripNonFileArtifacts(normalizeGrokFileBlockSyntax(content));
  if (!clean) {
    onProgress?.('No file blocks found in Grok output', 'warn');
    return {
      ok: false,
      writtenCount: 0,
      skippedCount: 0,
      message: 'No code output to apply.',
      error: 'empty',
    };
  }
  const paths = extractGrokFilePaths(clean);
  if (paths.length > 0) {
    onProgress?.(`Parsed ${paths.length} file block(s) from Grok output`, 'info');
    for (const p of paths.slice(0, 12)) {
      onProgress?.(`Will write ${p}`, 'file');
    }
    if (paths.length > 12) {
      onProgress?.(`… and ${paths.length - 12} more file(s)`, 'file');
    }
  }
  try {
    onProgress?.('POST /api/files/apply-generated — writing to cloud workspace', 'info');
    const apply = await fetchJson<{
      success?: boolean;
      written?: string[];
      skipped?: string[];
      parsedBlocks?: number;
      usedFallbackPath?: string;
      error?: string;
    }>(withProjectQuery('/api/files/apply-generated'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(withProjectBody({ content: clean })),
    });
    if (apply.error) {
      onProgress?.(`Apply failed: ${apply.error}`, 'error');
      return {
        ok: false,
        writtenCount: 0,
        skippedCount: 0,
        message: `Files were not applied: ${apply.error}`,
        error: apply.error,
      };
    }
    const writtenCount = Array.isArray(apply.written) ? apply.written.length : 0;
    const skippedCount = Array.isArray(apply.skipped) ? apply.skipped.length : 0;
    if (writtenCount > 0 && Array.isArray(apply.written)) {
      for (const p of apply.written.slice(0, 16)) {
        onProgress?.(`Wrote ${p}`, 'success');
      }
      if (apply.written.length > 16) {
        onProgress?.(`… ${apply.written.length - 16} more file(s) written`, 'success');
      }
    }
    if (writtenCount > 0) {
      notifyWorkspaceFilesChanged();
      onProgress?.('Running post-apply artifact sync (Master Plan, mind map, preview)', 'info');
      await afterFilesAppliedArtifacts(artifactContext?.userNote, artifactContext?.projectName, onProgress);
    }
    return {
      ok: writtenCount > 0,
      writtenCount,
      skippedCount,
      message:
        writtenCount > 0
          ? `Applied ${writtenCount} file(s)${skippedCount ? `, skipped ${skippedCount}` : ''}${
              apply.usedFallbackPath ? ` (fallback: ${apply.usedFallbackPath})` : ''
            }.`
          : 'Grok returned text, but no writable file blocks were found. Expected ```file:path``` blocks.',
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to apply files';
    onProgress?.(msg, 'error');
    return { ok: false, writtenCount: 0, skippedCount: 0, message: msg, error: msg };
  }
}

export async function runGoCodeAndApply(options: {
  userId: string;
  projectName: string;
  userNote?: string;
  messages?: { role: 'user' | 'assistant'; content: string }[];
  onProgress?: GrokActivityProgressFn;
}): Promise<{ ok: boolean; statusMessage: string; codeText?: string }> {
  const { userId, projectName, userNote, messages, onProgress } = options;
  const payloadMessages =
    messages && messages.length > 0
      ? messages
      : [
          {
            role: 'user' as const,
            content:
              userNote && userNote.trim()
                ? `START_CODING — implement now. Session focus: ${userNote.trim()}. Output file artifacts only (paths + file bodies), no conversation.`
                : 'START_CODING — implement now per project-execution-rules.md and master-plan.json. Output file artifacts only (paths + file bodies), no conversation.',
          },
        ];

  try {
    onProgress?.('POST /api/grok/go-code — pre-coding summary + Grok Code (server)', 'info');
    const stopWait = startGrokActivityWaitTicker(
      'Grok Code running on server',
      (msg, kind) => onProgress?.(msg, kind),
    );
    let data: {
      preCodingSummary?: string;
      summarySaved?: boolean;
      codeError?: string;
      choices?: { message?: { content?: string } }[];
      error?: string;
      codeModel?: string;
    };
    try {
      data = await fetchJson(withProjectQuery('/api/grok/go-code'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(
          withProjectBody({
            userId,
            projectName,
            userNote: userNote?.trim() || undefined,
            messages: payloadMessages,
          }),
        ),
      });
    } finally {
      stopWait();
    }

    if (data.error && !data.summarySaved) {
      onProgress?.(data.error || 'Go Code failed', 'error');
      return { ok: false, statusMessage: data.error || 'Go Code failed.' };
    }

    if (data.summarySaved) {
      const preview = data.preCodingSummary?.trim().slice(0, 80);
      onProgress?.(
        preview
          ? `Pre-coding summary saved to Master Plan (${preview}${(data.preCodingSummary?.length ?? 0) > 80 ? '…' : ''})`
          : 'Pre-coding summary saved to Master Plan',
        'success',
      );
      try {
        window.dispatchEvent(new CustomEvent('nebula-master-plan-updated'));
      } catch {
        /* ignore */
      }
    }

    const codeText = data.choices?.[0]?.message?.content?.trim() || '';
    if (data.codeModel) {
      onProgress?.(`Grok Code model: ${data.codeModel}`, 'info');
    }
    if (data.codeError && !codeText) {
      onProgress?.(`Grok Code error: ${data.codeError.slice(0, 200)}`, 'error');
      return {
        ok: false,
        statusMessage: `Grok Code error: ${data.codeError.slice(0, 400)}`,
      };
    }

    if (!codeText) {
      onProgress?.('Grok Code returned no file output', 'warn');
      return {
        ok: Boolean(data.summarySaved),
        statusMessage: data.summarySaved
          ? 'Master Plan summary saved; Grok Code returned no file output yet.'
          : 'Grok Code returned empty output.',
      };
    }

    onProgress?.(`Received Grok Code response (${codeText.length.toLocaleString()} chars)`, 'info');
    const apply = await applyGeneratedFiles(codeText, { userNote, projectName, onProgress });
    return {
      ok: apply.ok,
      statusMessage: apply.message,
      codeText,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Go Code request failed';
    onProgress?.(msg, 'error');
    return { ok: false, statusMessage: msg };
  }
}

/**
 * After `/api/grok/chat`: apply file blocks from the coding handoff, or run Go Code when START_CODING fired.
 */
export async function handlePostGrokCodingTurn(options: {
  assistantContent: string;
  planningPhase: string;
  userId: string;
  projectName: string;
  userNote?: string;
  onProgress?: GrokActivityProgressFn;
}): Promise<{ ran: boolean; statusMessage?: string }> {
  const { assistantContent, planningPhase, userId, projectName, userNote, onProgress } = options;

  if (hasGrokFileBlocks(assistantContent)) {
    onProgress?.('Applying file blocks from Grok chat response', 'info');
    const apply = await applyGeneratedFiles(assistantContent, { userNote, projectName, onProgress });
    return { ran: true, statusMessage: apply.message };
  }

  const planning = planningPhase.trim();
  const wantsCoding =
    isCodingIntent(planning) || isCodingIntent(assistantContent) || /\bANSWER_Q1\b/i.test(planning);

  if (!wantsCoding) {
    return { ran: false };
  }

  const codingSource = planning || assistantContent;
  onProgress?.('START_CODING detected — launching Go Code pipeline', 'info');
  const go = await runGoCodeAndApply({
    userId,
    projectName,
    userNote,
    onProgress,
    messages: [
      { role: 'assistant', content: codingSource.slice(0, 12000) },
      {
        role: 'user',
        content:
          'START_CODING — begin implementation now. Output file artifacts only (paths + file bodies), no conversational text.',
      },
    ],
  });
  if (go.ok) {
    await afterFilesAppliedArtifacts(userNote, projectName, onProgress);
  }
  return { ran: true, statusMessage: go.statusMessage };
}
