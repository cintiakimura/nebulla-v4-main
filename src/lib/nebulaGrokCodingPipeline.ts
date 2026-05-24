import { fetchJson } from './apiFetch';
import { normalizeGrokFileBlockSyntax } from './grokChatArtifacts';
import { syncIdeProjectArtifacts } from './ideArtifactSync';
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
  try {
    window.dispatchEvent(new CustomEvent('nebula-files-applied'));
    window.dispatchEvent(new CustomEvent('nebula-master-plan-updated'));
    window.dispatchEvent(new CustomEvent('nebula-open-app-preview'));
  } catch {
    /* ignore */
  }
}

async function afterFilesAppliedArtifacts(userNote?: string, projectName?: string): Promise<void> {
  const sync = await syncIdeProjectArtifacts({ userNote, projectName, seedBasicUi: true });
  if ((sync.masterPlanTabs ?? 0) > 0) {
    try {
      window.dispatchEvent(new CustomEvent('nebula-master-plan-updated'));
      window.dispatchEvent(new CustomEvent('nebula-open-master-plan'));
    } catch {
      /* ignore */
    }
  }
}

export async function applyGeneratedFiles(
  content: string,
  artifactContext?: { userNote?: string; projectName?: string },
): Promise<ApplyGeneratedResult> {
  const clean = stripNonFileArtifacts(normalizeGrokFileBlockSyntax(content));
  if (!clean) {
    return {
      ok: false,
      writtenCount: 0,
      skippedCount: 0,
      message: 'No code output to apply.',
      error: 'empty',
    };
  }
  try {
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
      notifyWorkspaceFilesChanged();
      void afterFilesAppliedArtifacts(artifactContext?.userNote, artifactContext?.projectName);
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
    return { ok: false, writtenCount: 0, skippedCount: 0, message: msg, error: msg };
  }
}

export async function runGoCodeAndApply(options: {
  userId: string;
  projectName: string;
  userNote?: string;
  messages?: { role: 'user' | 'assistant'; content: string }[];
}): Promise<{ ok: boolean; statusMessage: string; codeText?: string }> {
  const { userId, projectName, userNote, messages } = options;
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
    const data = await fetchJson<{
      preCodingSummary?: string;
      summarySaved?: boolean;
      codeError?: string;
      choices?: { message?: { content?: string } }[];
      error?: string;
    }>(withProjectQuery('/api/grok/go-code'), {
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

    if (data.error && !data.summarySaved) {
      return { ok: false, statusMessage: data.error || 'Go Code failed.' };
    }

    const codeText = data.choices?.[0]?.message?.content?.trim() || '';
    if (data.codeError && !codeText) {
      return {
        ok: false,
        statusMessage: `Grok Code error: ${data.codeError.slice(0, 400)}`,
      };
    }

    if (!codeText) {
      return {
        ok: Boolean(data.summarySaved),
        statusMessage: data.summarySaved
          ? 'Master Plan summary saved; Grok Code returned no file output yet.'
          : 'Grok Code returned empty output.',
      };
    }

    const apply = await applyGeneratedFiles(codeText, { userNote, projectName });
    return {
      ok: apply.ok,
      statusMessage: apply.message,
      codeText,
    };
  } catch (e) {
    return { ok: false, statusMessage: e instanceof Error ? e.message : 'Go Code request failed' };
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
}): Promise<{ ran: boolean; statusMessage?: string }> {
  const { assistantContent, planningPhase, userId, projectName, userNote } = options;

  if (hasGrokFileBlocks(assistantContent)) {
    const apply = await applyGeneratedFiles(assistantContent, { userNote, projectName });
    return { ran: true, statusMessage: apply.message };
  }

  const planning = planningPhase.trim();
  const wantsCoding =
    isCodingIntent(planning) || isCodingIntent(assistantContent) || /\bANSWER_Q1\b/i.test(planning);

  if (!wantsCoding) {
    return { ran: false };
  }

  const codingSource = planning || assistantContent;
  const go = await runGoCodeAndApply({
    userId,
    projectName,
    userNote,
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
    await afterFilesAppliedArtifacts(userNote, projectName);
  }
  return { ran: true, statusMessage: go.statusMessage };
}
