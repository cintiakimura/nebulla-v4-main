import { fetchJson, readResponseJson } from './apiFetch';
import { extractGrokFilePaths, normalizeGrokFileBlockSyntax } from './grokChatArtifacts';
import { runPostCodingWorkspaceSync } from './ideArtifactSync';
import { cancelProjectBackgroundJobs } from './ideProjectReset';
import type { GrokActivityProgressFn } from './ideGrokActivityStatus';
import { startGrokActivityWaitTicker } from './ideGrokActivityStatus';
import { getGrokRequestHeaders } from './grokUserKey';
import { withProjectBody, withProjectQuery } from './nebulaProjectApi';
import { triggerUiStudioBetaAfterFilesApplied } from './uiStudioBetaEngine';

const START_CODING_RE = /<\s*START_CODING\s*>|\bSTART_CODING\b/i;
const GO_POLL_MS = 5000;
const GO_MAX_POLLS = 90;
const GO_CODE_MAX_PASSES = 2;

/** One poll loop per project tab — avoids duplicate POST /go-code/poll spam. */
let goCodePollInFlight: Promise<GoCodePayload> | null = null;

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
  writtenPaths: string[];
  message: string;
  error?: string;
};

const APP_SOURCE_PREFIXES = ['app/', 'components/', 'src/', 'pages/'];

function isPlanOnlyApply(writtenPaths: string[]): boolean {
  if (writtenPaths.length === 0) return false;
  return !writtenPaths.some((p) => APP_SOURCE_PREFIXES.some((prefix) => p.startsWith(prefix)));
}

function buildGoCompleteMessage(
  totalWritten: number,
  writtenPaths: string[],
  passes: number,
  partialPlanOnly: boolean,
): string {
  const appFiles = writtenPaths.filter((p) =>
    APP_SOURCE_PREFIXES.some((prefix) => p.startsWith(prefix)),
  );
  const passNote = passes > 1 ? ` (${passes} Grok Code passes)` : '';
  if (totalWritten === 0) {
    return 'No files were written.';
  }
  if (partialPlanOnly) {
    return `Updated Master Plan only (${totalWritten} file). App code may be incomplete — try Go again or narrow scope.`;
  }
  const routeHint =
    appFiles.length > 0
      ? ` App routes: ${appFiles.slice(0, 6).join(', ')}${appFiles.length > 6 ? '…' : ''}.`
      : '';
  return `Slice complete${passNote}. Applied ${totalWritten} file(s).${routeHint} Validate this slice (NDM happy path) before the next Go. Master Plan synced — UI Studio Beta will generate from Master Plan + these files.`;
}

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
      writtenPaths: [],
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
        writtenPaths: [],
        message: `Files were not applied: ${apply.error}`,
        error: apply.error,
      };
    }
    const writtenPaths = Array.isArray(apply.written) ? apply.written : [];
    const writtenCount = writtenPaths.length;
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
      writtenPaths,
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
    return { ok: false, writtenCount: 0, skippedCount: 0, writtenPaths: [], message: msg, error: msg };
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
  idle?: boolean;
  hint?: string;
  v0PromptWritten?: boolean;
  v0PromptLength?: number;
  continuation?: boolean;
};

async function pollGoCodeUntilDone(
  projectName: string,
  onProgress?: GrokActivityProgressFn,
): Promise<GoCodePayload> {
  if (goCodePollInFlight) {
    onProgress?.('Go already polling on server — joining existing wait…', 'info');
    return goCodePollInFlight;
  }

  goCodePollInFlight = pollGoCodeUntilDoneInner(projectName, onProgress).finally(() => {
    goCodePollInFlight = null;
  });
  return goCodePollInFlight;
}

async function pollGoCodeUntilDoneInner(
  projectName: string,
  onProgress?: GrokActivityProgressFn,
): Promise<GoCodePayload> {
  for (let i = 0; i < GO_MAX_POLLS; i++) {
    await sleep(GO_POLL_MS);
    try {
      const response = await fetch(withProjectQuery('/api/grok/go-code/poll'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getGrokRequestHeaders() },
        credentials: 'include',
        body: JSON.stringify(withProjectBody({ projectName })),
      });
      const poll = await readResponseJson<
        GoCodePayload & { hint?: string; elapsedMs?: number; error?: string; idle?: boolean }
      >(response);
      if (poll.idle) {
        if (i < 4) continue;
        return poll;
      }
      if (!response.ok && !poll.pending) {
        return poll;
      }
      if (poll.pending && poll.coding) {
        if (i === 0 || i % 6 === 0) {
          const mins = poll.elapsedMs ? Math.round(poll.elapsedMs / 60_000) : undefined;
          onProgress?.(
            mins && mins >= 1
              ? `Grok Code still running (~${mins} min) — one pass, please wait…`
              : 'Grok Code running on server — generating all files in one pass…',
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

async function kickGoCodeJob(options: {
  userId: string;
  projectName: string;
  userNote?: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  continuation?: boolean;
  onProgress?: GrokActivityProgressFn;
}): Promise<GoCodePayload> {
  const { userId, projectName, userNote, messages, continuation, onProgress } = options;

  let prePoll: GoCodePayload | null = null;
  if (!continuation) {
    try {
      const preRes = await fetch(withProjectQuery('/api/grok/go-code/poll'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getGrokRequestHeaders() },
        credentials: 'include',
        body: JSON.stringify(withProjectBody({ projectName })),
      });
      prePoll = await readResponseJson<GoCodePayload>(preRes);
      if (prePoll.idle) {
        prePoll = null;
      } else if (prePoll.pending && prePoll.coding) {
        onProgress?.('Grok Code already running — waiting for it to finish (do not press Go again)', 'warn');
      } else if (prePoll.choices?.[0]?.message?.content?.trim()) {
        // Unconsumed durable result — do not start a new Go and overwrite it.
        onProgress?.('Recovering unapplied Go Code result from server', 'info');
        return prePoll;
      }
    } catch {
      prePoll = null;
    }
  } else {
    await cancelProjectBackgroundJobs();
  }

  const stopWait = startGrokActivityWaitTicker(
    continuation ? 'Grok Code continuation on server' : 'Grok Code running on server',
    (msg, kind, opts) => onProgress?.(msg, kind, opts),
  );

  try {
    if (prePoll?.pending && prePoll.coding) {
      return await pollGoCodeUntilDone(projectName, onProgress);
    }

    const data = await fetchJson<GoCodePayload>(withProjectQuery('/api/grok/go-code'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getGrokRequestHeaders() },
      credentials: 'include',
      body: JSON.stringify(
        withProjectBody({
          userId,
          projectName,
          userNote: userNote?.trim() || undefined,
          messages,
          continuation: continuation || undefined,
        }),
      ),
    });

    if (data.pending && data.coding) {
      onProgress?.(
        continuation
          ? 'Continuing Grok Code — Foundation slice (shell)…'
          : 'Pre-coding summary saved — Grok Code generating current slice (1–3 min)',
        'info',
      );
      return await pollGoCodeUntilDone(projectName, onProgress);
    }
    return data;
  } finally {
    stopWait();
  }
}

export async function runGoCodeAndApply(options: {
  userId: string;
  projectName: string;
  userNote?: string;
  messages?: { role: 'user' | 'assistant'; content: string }[];
  onProgress?: GrokActivityProgressFn;
}): Promise<{ ok: boolean; statusMessage: string; codeText?: string; totalWritten?: number }> {
  const { userId, projectName, userNote, messages, onProgress } = options;
  const baseMessages =
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
                ? `START_CODING — implement ONE coherent slice only (Build → Debug → Next; see incremental-development.md). Session focus: ${userNote.trim()}. Prefer Foundation first if no shell exists; do not dump every §4 route. File blocks only — not master-plan.json only.`
                : 'START_CODING — implement ONE coherent slice only per master-plan.json, project-execution-rules.md, and incremental-development.md. Foundation → Auth → Data/API → Primary → Secondary → Polish. File blocks for this slice only.',
          },
        ];

  try {
    onProgress?.('Go — Grok Code will generate one slice (auto-continues only if Master Plan-only)', 'info');

    let totalWritten = 0;
    const allWrittenPaths: string[] = [];
    let lastCodeText = '';
    let passes = 0;
    let partialPlanOnly = false;

    for (let pass = 0; pass < GO_CODE_MAX_PASSES; pass++) {
      passes = pass + 1;
      const continuation = pass > 0;
      const passMessages = continuation
        ? [
            ...baseMessages,
            {
              role: 'user' as const,
              content:
                'CONTINUATION — master-plan.json is updated. Output the Foundation slice only: layout.tsx, globals.css, root page, minimal routing shell. Do NOT implement every §4 route. Do NOT stop at master-plan.json only.',
            },
          ]
        : baseMessages;

      if (continuation) {
        onProgress?.(
          'Only Master Plan was updated — auto-continuing Foundation slice (do not press Go again)',
          'warn',
        );
      }

      const data = await kickGoCodeJob({
        userId,
        projectName,
        userNote,
        messages: passMessages,
        continuation,
        onProgress,
      });

      if (data.error && !data.summarySaved && !data.choices?.length) {
        onProgress?.(data.error || 'Go Code failed', 'error');
        if (totalWritten > 0) break;
        return { ok: false, statusMessage: data.error || 'Go Code failed.', totalWritten };
      }

      if (data.summarySaved && pass === 0) {
        const preview = data.preCodingSummary?.trim().slice(0, 80);
        onProgress?.(
          preview
            ? `Pre-coding summary saved (${preview}${(data.preCodingSummary?.length ?? 0) > 80 ? '…' : ''})`
            : 'Pre-coding summary saved to Master Plan',
          'success',
        );
        // Legacy v0-prompt.md may still be written server-side; do not surface as auto-V0 status.

        try {
          window.dispatchEvent(new CustomEvent('nebula-master-plan-updated'));
        } catch {
          /* ignore */
        }
      }

      const codeText = data.choices?.[0]?.message?.content?.trim() || '';
      if (data.codeError && !codeText) {
        onProgress?.(`Grok Code error: ${data.codeError.slice(0, 200)}`, 'error');
        if (totalWritten > 0) break;
        return {
          ok: Boolean(data.summarySaved),
          statusMessage: data.codeError.slice(0, 400),
          totalWritten,
        };
      }

      if (!codeText) {
        if (totalWritten > 0) break;
        onProgress?.('Grok Code returned no file output', 'warn');
        return {
          ok: Boolean(data.summarySaved),
          statusMessage: data.summarySaved
            ? 'Master Plan saved but Grok Code returned no files — try Go again.'
            : 'Grok Code returned empty output.',
          totalWritten,
        };
      }

      lastCodeText = codeText;
      onProgress?.(`Received Grok Code output (${codeText.length.toLocaleString()} chars)`, 'info');
      const apply = await applyGeneratedFiles(codeText, { userNote, projectName, onProgress });
      totalWritten += apply.writtenCount;
      allWrittenPaths.push(...apply.writtenPaths);

      if (apply.ok && apply.writtenCount > 0) {
        // Ack durable server result only after files are applied — missed polls can re-fetch until then.
        try {
          await fetch(withProjectQuery('/api/grok/go-code/poll'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getGrokRequestHeaders() },
            credentials: 'include',
            body: JSON.stringify(withProjectBody({ projectName, consume: true })),
          });
        } catch {
          /* keep durable result for retry */
        }
      }

      if (!apply.ok) {
        partialPlanOnly = isPlanOnlyApply(apply.writtenPaths);
        if (pass >= GO_CODE_MAX_PASSES - 1) break;
        if (!isPlanOnlyApply(apply.writtenPaths)) break;
        continue;
      }

      partialPlanOnly = isPlanOnlyApply(apply.writtenPaths);
      if (!partialPlanOnly && apply.writtenCount >= 2) {
        break;
      }
      if (pass >= GO_CODE_MAX_PASSES - 1) break;
      if (!partialPlanOnly) break;
    }

    if (totalWritten > 0) {
      void cancelProjectBackgroundJobs();
      try {
        window.dispatchEvent(new CustomEvent('nebula-master-plan-updated'));
      } catch {
        /* ignore */
      }
    }

    const statusMessage = buildGoCompleteMessage(totalWritten, allWrittenPaths, passes, partialPlanOnly);
    if (totalWritten > 0) {
      onProgress?.(statusMessage, 'success');
    }

    const ok = totalWritten > 0 && !partialPlanOnly;
    if (ok) {
      await triggerUiStudioBetaAfterFilesApplied({
        writtenPaths: allWrittenPaths,
        projectName,
        onProgress,
      });
    }

    return {
      ok,
      statusMessage,
      codeText: lastCodeText,
      totalWritten,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Go Code request failed';
    onProgress?.(msg, 'error');
    return { ok: false, statusMessage: msg, totalWritten: 0 };
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
    if (apply.ok) {
      await triggerUiStudioBetaAfterFilesApplied({
        writtenPaths: apply.writtenPaths,
        projectName,
        onProgress,
      });
    }
    return { ran: true, statusMessage: apply.message };
  }

  const planning = planningPhase.trim();
  // Only START_CODING / explicit coding tags launch Go — never ANSWER_Qn (tab approval ≠ implement).
  const wantsCoding = isCodingIntent(planning) || isCodingIntent(assistantContent);

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
          'START_CODING — implement ONE coherent slice only (Build → Debug → Next). File blocks for this slice only — not the full §4 app.',
      },
    ],
  });
  if (go.ok) {
    await afterFilesAppliedArtifacts(userNote, projectName, onProgress);
    // UI Studio Beta already triggered inside runGoCodeAndApply after successful apply.
  }
  return { ran: true, statusMessage: go.statusMessage };
}
