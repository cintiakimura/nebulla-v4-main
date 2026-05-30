import { fetchJson, readResponseJson } from './apiFetch';
import { extractGrokFilePaths, normalizeGrokFileBlockSyntax } from './grokChatArtifacts';
import { runPostCodingWorkspaceSync } from './ideArtifactSync';
import { cancelProjectBackgroundJobs } from './ideProjectReset';
import type { GrokActivityProgressFn } from './ideGrokActivityStatus';
import { startGrokActivityWaitTicker } from './ideGrokActivityStatus';
import { withProjectBody, withProjectQuery } from './nebulaProjectApi';

const START_CODING_RE = /<\s*START_CODING\s*>|\bSTART_CODING\b/i;
const GO_POLL_MS = 3500;
const GO_MAX_POLLS = 120;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms));
}

export function hasGrokFileBlocks(text: string): boolean {
  const normalized = normalizeGrokFileBlockSyntax(text);
  return (
    /```(?:file|filepath)\s*:/i.test(normalized) ||
    /"""\s*file:/i.test(text) ||
    /'''\s*file:/i.test(text)
  );
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
    onProgress?.(`Applying ${paths.length} file(s) to workspace`, 'info');
  }
  try {
    onProgress?.('Writing files to cloud workspace', 'info');
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
    if (writtenCount > 0) {
      onProgress?.(`Wrote ${writtenCount} file(s) to workspace`, 'success');
    }
    if (writtenCount > 0) {
      notifyWorkspaceFilesChanged();
      onProgress?.('Syncing Master Plan, mind map, and preview', 'info');
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

type GoCodePayload = {
  preCodingSummary?: string;
  summarySaved?: boolean;
  codeError?: string;
  choices?: { message?: { content?: string } }[];
  error?: string;
  codeModel?: string;
  pending?: boolean;
  coding?: boolean;
  v0PromptWritten?: boolean;
  v0PromptLength?: number;
};

async function pollGoCodeUntilDone(
  projectName: string,
  onProgress?: GrokActivityProgressFn,
): Promise<GoCodePayload> {
  for (let i = 0; i < GO_MAX_POLLS; i++) {
    await sleep(GO_POLL_MS);
    try {
      const response = await fetch(withProjectQuery('/api/grok/go-code/poll'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(withProjectBody({ projectName })),
      });
      const poll = await readResponseJson<
        GoCodePayload & { hint?: string; elapsedMs?: number; error?: string }
      >(response);
      if (!response.ok && !poll.pending) {
        return poll;
      }
      if (poll.pending && poll.coding) {
        if (i === 0 || i % 8 === 0) {
          const mins = poll.elapsedMs ? Math.round(poll.elapsedMs / 60_000) : undefined;
          onProgress?.(
            mins && mins >= 1
              ? `Grok Code still running (~${mins} min) — polling…`
              : 'Grok Code running on server — polling…',
            'info',
          );
        }
        continue;
      }
      if (poll.v0PromptWritten) {
        try {
          window.dispatchEvent(new CustomEvent('nebula-master-plan-updated'));
        } catch {
          /* ignore */
        }
      }
      return poll;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Go poll failed';
      if (i >= GO_MAX_POLLS - 1) {
        return { error: msg };
      }
    }
  }
  return {
    error: 'Grok Code is still running after several minutes. Try Go again with a narrower focus.',
  };
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
      ? messages.map((m) => ({
          role: m.role,
          content: m.content.slice(0, 12000),
        }))
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
    onProgress?.('Grok Code on server — summary then implementation', 'info');
    const stopWait = startGrokActivityWaitTicker(
      'Grok Code running on server',
      (msg, kind, options) => onProgress?.(msg, kind, options),
    );
    let data: GoCodePayload;
    try {
      data = await fetchJson<GoCodePayload>(withProjectQuery('/api/grok/go-code'), {
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
      if (data.pending && data.coding) {
        onProgress?.('Pre-coding summary saved — waiting for Grok Code (background job)', 'info');
        data = await pollGoCodeUntilDone(projectName, onProgress);
      }
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
      if (data.v0PromptWritten) {
        onProgress?.(
          `v0 prompt ready (${data.v0PromptLength ?? 0} chars in nebula-ui-studio/v0-prompt.md)`,
          'success',
        );
      }
      try {
        window.dispatchEvent(new CustomEvent('nebula-master-plan-updated'));
        window.dispatchEvent(new CustomEvent('nebula-open-master-plan-tab', { detail: { tabNumber: 6 } }));
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
        ok: Boolean(data.summarySaved),
        statusMessage: data.summarySaved
          ? `Grok Code error (v0 prompt may still be ready): ${data.codeError.slice(0, 400)}`
          : `Grok Code error: ${data.codeError.slice(0, 400)}`,
      };
    }

    if (!codeText) {
      onProgress?.('Grok Code returned no file output', 'warn');
      return {
        ok: Boolean(data.summarySaved),
        statusMessage: data.summarySaved
          ? 'Master Plan session brief saved. Grok Code returned no file output — try Go again or add Master Plan §4+§5 first.'
          : 'Grok Code returned empty output.',
      };
    }

    onProgress?.(`Received Grok Code response (${codeText.length.toLocaleString()} chars)`, 'info');
    const apply = await applyGeneratedFiles(codeText, { userNote, projectName, onProgress });
    if (apply.ok) {
      void cancelProjectBackgroundJobs();
    }
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
