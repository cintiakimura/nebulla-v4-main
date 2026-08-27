import { fetchJson, readResponseJson } from './apiFetch';
import { extractGrokFilePaths, normalizeGrokFileBlockSyntax, buildApplyGeneratedPayload } from './grokChatArtifacts';
import { runPostCodingWorkspaceSync } from './ideArtifactSync';
import { cancelProjectBackgroundJobs } from './ideProjectReset';
import type { GrokActivityProgressFn } from './ideGrokActivityStatus';
import { startGrokActivityWaitTicker } from './ideGrokActivityStatus';
import { getGrokRequestHeaders } from './grokUserKey';
import { formatGoBlockedByPlanMessage } from './masterPlanStatus';
import { reportGoApplyTelemetry } from './contractTelemetryClient';
import { assessFoundationGoExit, assessOversizedGoApply, parseGoSliceLabel, shouldRunGoCodeSecondPass, type GoSliceLabel } from '../../lib/goSliceContract';
import { PREVIEW_FALLBACK_CHAT_LINE } from '../../lib/uiGenerationEngine/v2/previewCompose';
import { classifyGoFailure, formatBlockedReasonLine, goBlocked, type GoBlockedReason } from '../../lib/goBlockedReason';
import { assessApplyRouteDepth } from '../../lib/workspaceCodedAppUi';
import { UNSOLICITED_BAAS_SKIP_REASON } from '../../lib/mvpStackContract';
import {
  GO_CODE_PASS1_LABEL,
  GO_JOIN_LABEL,
  GO_PREPARING_LABEL,
  classifyGoPoll,
  goCodePassWaitLabel,
  goPollActivityMessage,
  goPollBackoffMs,
} from './spineSequenceGates';
import { getBrowserProjectKey, withProjectBody, withProjectQuery } from './nebulaProjectApi';
import { dispatchStudioShowLiveApp, triggerUiStudioBetaAfterFilesApplied } from './uiStudioBetaEngine';
import { markFoundationGoInFlight } from './foundationHeavyJob';
import { setGrokCodingActive } from './nebulaGrokCodingGate';
import {
  buildAutopilotSliceInstruction,
  buildNarrowSliceInstruction,
  FOUNDATION_RETRY_ACTIVITY,
  FOUNDATION_SLICE_INSTRUCTION,
  resolveNextContinueSlice,
  userNoteRequestsNextSlice,
} from './fastPrototypeNextSlice';
import {
  fetchResearchStatus,
  formatResearchStopMessage,
} from './nebulaResearchClient';
import {
  isApplyTransportFailure,
  shouldSkipGoCodeSecondPassAfterApply,
} from './applyTransportFailure';

const START_CODING_RE = /<\s*START_CODING\s*>|\bSTART_CODING\b/i;
/** Safety cap — wall clock GO_POLL_MAX_WAIT_MS is the real stop. */
const GO_MAX_POLLS = 36;
const GO_CODE_MAX_PASSES = 2;
/** Ack after apply must never stall the coding turn (server may be busy on post-apply IO). */
const GO_CONSUME_TIMEOUT_MS = 4000;
/** Hung apply left chat on "Writing files to cloud workspace". 3-file writes must not wait 45s. */
const APPLY_GENERATED_TIMEOUT_MS = 12_000;
const APPLY_TIMEOUT_MESSAGE =
  'Apply timed out after 12s — checking whether files already landed on disk.';
const APPLY_DISK_CONFIRM_MS = 4_000;
/** One Go poll HTTP call must not block the whole wait. */
const GO_POLL_FETCH_TIMEOUT_MS = 12_000;
/** Hard max wait for Grok Code generation (matches server GO_CODE_JOB_TIMEOUT_MS). */
const GO_POLL_MAX_WAIT_MS = 180_000;
const GO_POLL_TIMEOUT_MESSAGE =
  'Grok Code timed out after 3 minutes — checking for a late result (not asking you to retry).';
/** After the 3 min UI wait — Grok may still finish; apply if files arrive. */
const GO_TIMEOUT_GRACE_MS = 90_000;
const GO_TIMEOUT_GRACE_POLL_MS = 6_000;

/** One poll loop per project — do not join ADHD + children onto the same waiter. */
const goCodePollInFlightByProject = new Map<string, Promise<GoCodePayload>>();
const goCodePollAbortedByProject = new Set<string>();
const goSessionAbortedByProject = new Set<string>();
const applyAbortByProject = new Map<string, AbortController>();

function goPollProjectKey(projectName?: string): string {
  return (projectName || '').trim() || 'default';
}

function clearCodingLocks(projectName: string): void {
  markFoundationGoInFlight(projectName, false);
  setGrokCodingActive(false);
}

function isGoSessionAborted(projectName: string): boolean {
  return goSessionAbortedByProject.has(goPollProjectKey(projectName));
}

/** Unblock a hung apply POST without cancelling Grok Code / the Go session. */
export function abortApplyWait(projectName: string): void {
  const key = goPollProjectKey(projectName);
  try {
    applyAbortByProject.get(key)?.abort();
  } catch {
    /* ignore */
  }
}

/** Stop / timeout: abort poll + apply wait and drop in-flight so UI Gen is not refused. */
export function abortGoCodeWait(projectName: string): void {
  const key = goPollProjectKey(projectName);
  goCodePollAbortedByProject.add(key);
  goSessionAbortedByProject.add(key);
  goCodePollInFlightByProject.delete(key);
  abortApplyWait(projectName);
  clearCodingLocks(projectName);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms));
}

function isAbortError(e: unknown): boolean {
  if (!e) return false;
  if (e instanceof Error) {
    return e.name === 'AbortError' || /aborted|abort/i.test(e.message);
  }
  return /aborted|abort/i.test(String(e));
}

function isApplyWaitTimeout(e: unknown): boolean {
  if (isAbortError(e)) return true;
  const msg = e instanceof Error ? e.message : String(e || '');
  return /Apply timed out after 12s|The operation was aborted/i.test(msg);
}

async function confirmAppliedPathsOnDisk(expected: string[]): Promise<string[]> {
  const want = expected
    .map((p) => p.replace(/\\/g, '/').replace(/^\.\//, ''))
    .filter((p) => p && !/supabase|firebase/i.test(p));
  if (want.length === 0) return [];
  const timed = abortAfter(APPLY_DISK_CONFIRM_MS);
  try {
    const data = await Promise.race([
      fetchJson<{ found?: string[] }>('/api/files/exists', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-nebula-project-key': getBrowserProjectKey(),
        },
        credentials: 'include',
        signal: timed.signal,
        body: JSON.stringify(withProjectBody({ paths: want.slice(0, 40) })),
      }),
      rejectAfter(APPLY_DISK_CONFIRM_MS, 'disk confirm timed out'),
    ]);
    const found = Array.isArray(data.found) ? data.found : [];
    const onDisk = new Set(
      found.map((p) => String(p || '').replace(/\\/g, '/').replace(/^\.\//, '')).filter(Boolean),
    );
    return want.filter((p) => onDisk.has(p) || [...onDisk].some((d) => d === p || d.endsWith(`/${p}`)));
  } catch {
    return [];
  } finally {
    timed.cancel();
  }
}

function diskLooksApplied(expected: string[], found: string[]): boolean {
  if (found.length === 0) return false;
  const need = Math.max(1, Math.ceil(expected.length * 0.4));
  return found.length >= need;
}

/** Architecture docs / package.json-only writes are not “index.html is not a product shell”. */
function shouldWarnZeroProductRoutes(writtenPaths: string[]): boolean {
  return writtenPaths.some((p) =>
    /^(index\.html|src\/(App|main)\.(tsx|jsx)|app\/|pages\/|src\/(pages|app)\/)/i.test(
      String(p || '').replace(/\\/g, '/').replace(/^\.\//, ''),
    ),
  );
}

function rejectAfter(ms: number, message: string): Promise<never> {
  return new Promise((_, reject) => {
    const w = typeof window !== 'undefined' ? window : null;
    if (w) w.setTimeout(() => reject(new Error(message)), ms);
    else setTimeout(() => reject(new Error(message)), ms);
  });
}

function abortAfter(ms: number): { signal?: AbortSignal; cancel: () => void } {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const w = typeof window !== 'undefined' ? window : null;
  const timer = controller
    ? w
      ? w.setTimeout(() => controller.abort(), ms)
      : setTimeout(() => controller.abort(), ms)
    : null;
  return {
    signal: controller?.signal,
    cancel: () => {
      if (timer == null) return;
      if (w) w.clearTimeout(timer);
      else clearTimeout(timer);
    },
  };
}

/** Fire-and-forget ack so apply is not blocked if poll consume hangs. */
export function ackConsumedGoCodeResult(projectName: string): void {
  const consumeTimed = abortAfter(GO_CONSUME_TIMEOUT_MS);
  void fetch(withProjectQuery('/api/grok/go-code/poll'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getGrokRequestHeaders() },
    credentials: 'include',
    signal: consumeTimed.signal,
    body: JSON.stringify(withProjectBody({ projectName, consume: true })),
  })
    .catch(() => {
      /* keep durable result for retry */
    })
    .finally(() => {
      consumeTimed.cancel();
    });
}

export function hasGrokFileBlocks(text: string): boolean {
  const normalized = normalizeGrokFileBlockSyntax(text);
  return (
    /```(?:file|filepath)\s*:/i.test(normalized) ||
    /"""\s*file:/i.test(text) ||
    /'''\s*file:/i.test(text)
  );
}

/** Research / plan / ui-brief paths — safe to apply before UI mockup (not app code). */
export function isArchitectureArtifactPath(relPath: string): boolean {
  const p = relPath.replace(/\\/g, '/').replace(/^\.?\//, '').trim();
  if (!p) return false;
  if (/^nebula-project\//i.test(p)) return true;
  if (/^nebula-ui-studio\//i.test(p)) return true;
  if (/(^|\/)(ui-brief|v0-prompt|master-plan)\.(md|json)$/i.test(p)) return true;
  return false;
}

const GROK_FILE_BLOCK_RE =
  /```(?:file|filepath)\s*:\s*([^\n`]+)\n([\s\S]*?)```/gi;

function collectGrokFileBlocks(
  content: string,
  keep: (relPath: string) => boolean,
): string {
  const normalized = normalizeGrokFileBlockSyntax(content);
  const blocks: string[] = [];
  const re = new RegExp(GROK_FILE_BLOCK_RE.source, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(normalized)) !== null) {
    const path = (m[1] || '').trim().replace(/^["'`]+|["'`]+$/g, '');
    if (keep(path)) {
      blocks.push(`\`\`\`file:${path}\n${m[2]}\`\`\``);
    }
  }
  return blocks.join('\n\n').trim();
}

/**
 * Keep only architecture/doc file blocks so research + ui-brief land before mockup,
 * without applying foundation/app code in the same pass.
 */
export function filterGrokContentToArchitectureFiles(content: string): string {
  return collectGrokFileBlocks(content, isArchitectureArtifactPath);
}

/** App / product source blocks only — Foundation coding handoff (not plan/ui-brief). */
export function filterGrokContentToAppCodeFiles(content: string): string {
  return collectGrokFileBlocks(content, (p) => !isArchitectureArtifactPath(p));
}

/** True when the reply has ```file:``` blocks but every path is architecture-only. */
export function hasOnlyArchitectureFileBlocks(content: string): boolean {
  if (!hasGrokFileBlocks(content)) return false;
  return !filterGrokContentToAppCodeFiles(content);
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
  runnableRoot?: boolean;
  runnableStatusLine?: string;
  deployable?: boolean;
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
  runnableHint?: { runnableRoot?: boolean; runnableStatusLine?: string },
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
  const runnableLine =
    typeof runnableHint?.runnableRoot === 'boolean'
      ? ` ${runnableHint.runnableStatusLine || `Runnable root: ${runnableHint.runnableRoot ? 'yes' : 'no'} (workspace root)`}.`
      : appFiles.length > 0
        ? ' Runnable root: check package.json at workspace root (Deploy / Build check).'
        : '';
  return `Slice complete${passNote}. Applied ${totalWritten} file(s).${routeHint}${runnableLine} Validate this slice (NDM happy path) before the next Go. Master Plan synced — UI mockup is plan-first (or optional refine if pages changed).`;
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
  // Soft-fail + hard timeout inside runPostCodingWorkspaceSync — never throw to coding success.
  try {
    await runPostCodingWorkspaceSync({
      userNote,
      projectName,
      seedBasicUi: false,
      openMindMap: true,
      onProgress,
      timeoutMs: 12_000,
    });
  } catch (e) {
    console.warn('[nebulaGrokCodingPipeline] artifact sync soft-fail:', e);
    onProgress?.(
      'Artifact sync timed out/skipped — files already applied; continuing',
      'warn',
    );
  }
  try {
    const st = await fetchJson<{ ui_status?: string }>(withProjectQuery('/api/ui-studio-beta/status'), {
      credentials: 'include',
      headers: getGrokRequestHeaders(),
    });
    if (st.ui_status === 'partial') {
      onProgress?.(PREVIEW_FALLBACK_CHAT_LINE, 'info');
    }
  } catch {
    /* preview meta optional */
  }
}

export async function applyGeneratedFiles(
  content: string,
  artifactContext?: {
    userNote?: string;
    projectName?: string;
    onProgress?: GrokActivityProgressFn;
    /** Skip mind-map/preview sync (used when applying architecture docs before plan-first UI mockup). */
    skipPostSync?: boolean;
  },
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
  const stopApplyWait = startGrokActivityWaitTicker('Writing files to cloud workspace', (msg, kind, opts) =>
    onProgress?.(msg, kind, opts),
  );
  const projectKey = goPollProjectKey(artifactContext?.projectName);
  const applyAbort = new AbortController();
  applyAbortByProject.set(projectKey, applyAbort);
  try {
    const applyTimed = abortAfter(APPLY_GENERATED_TIMEOUT_MS);
    const onAbortTimed = () => {
      try {
        applyAbort.abort();
      } catch {
        /* ignore */
      }
    };
    applyTimed.signal?.addEventListener('abort', onAbortTimed);
    let apply:
      | {
          success?: boolean;
          written?: string[];
          skipped?: string[];
          parsedBlocks?: number;
          usedFallbackPath?: string;
          baasSkippedReason?: string;
          error?: string;
          writtenCount?: number;
          runnableRoot?: boolean;
          runnableStatusLine?: string;
          deployable?: boolean;
          skeletonWritten?: string[];
          interactivePreview?: boolean;
          interactivePreviewPath?: string;
        }
      | undefined;
    try {
      const fetchP = fetchJson('/api/files/apply-generated', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-nebula-project-key': getBrowserProjectKey(),
        },
        credentials: 'include',
        signal: applyAbort.signal,
        body: JSON.stringify(
          withProjectBody({
            ...buildApplyGeneratedPayload(clean),
            userNote: artifactContext?.userNote?.trim() || undefined,
            projectName: artifactContext?.projectName?.trim() || undefined,
          }),
        ),
      }) as Promise<typeof apply>;

      let postErr: unknown;
      const settled = fetchP.then(
        (value) => {
          apply = value;
        },
        (err) => {
          postErr = err;
        },
      );

      const deadline = Date.now() + APPLY_GENERATED_TIMEOUT_MS;
      while (!apply && Date.now() < deadline) {
        const waitMs = Math.min(800, Math.max(50, deadline - Date.now()));
        await Promise.race([settled, sleep(waitMs)]);
        if (apply) break;
        if (postErr && !isApplyWaitTimeout(postErr)) {
          throw postErr;
        }
        if (paths.length > 0) {
          const found = await confirmAppliedPathsOnDisk(paths);
          if (diskLooksApplied(paths, found)) {
            onProgress?.(
              `Files already on disk (${found.length}) — continuing without waiting for apply POST`,
              'success',
            );
            apply = {
              success: true,
              written: found,
              writtenCount: found.length,
            };
            break;
          }
        }
      }
      if (!apply) {
        throw postErr instanceof Error ? postErr : new Error(APPLY_TIMEOUT_MESSAGE);
      }
    } finally {
      applyTimed.cancel();
    }
    if (!apply) {
      throw new Error(APPLY_TIMEOUT_MESSAGE);
    }
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
    const writtenCount =
      typeof apply.writtenCount === 'number' && apply.writtenCount > 0
        ? apply.writtenCount
        : writtenPaths.length;
    const skippedCount = Array.isArray(apply.skipped) ? apply.skipped.length : 0;
    const depth = assessApplyRouteDepth(writtenPaths);
    // Phase 6: IF plan needs routes AND disk is App+main-only → not “App looks OK”.
    if (writtenCount > 0) {
      onProgress?.(
        `Wrote ${writtenCount} file(s): ${writtenPaths.slice(0, 12).join(', ')}${
          writtenPaths.length > 12 ? '…' : ''
        }`,
        'success',
      );
      if (depth.zeroProductRoutes && shouldWarnZeroProductRoutes(writtenPaths)) {
        const viteShell = writtenPaths.some((p) => /^src\/(App|main)\.(tsx|jsx)$/i.test(p));
        onProgress?.(
          viteShell
            ? 'Zero app/ or pages/ routes in this apply — Vite src/App.tsx + src/main.tsx is not a product shell'
            : 'Zero app/ or pages/ routes in this apply — index.html alone is not a product shell',
          'warn',
        );
      } else {
        onProgress?.(
          `Product routes: ${depth.productRoutes.slice(0, 8).join(', ')}${
            depth.productRoutes.length > 8 ? '…' : ''
          }`,
          'info',
        );
      }
    }
    if (typeof apply.runnableRoot === 'boolean') {
      onProgress?.(
        apply.runnableStatusLine ||
          `Runnable root: ${apply.runnableRoot ? 'yes' : 'no'} (workspace root)`,
        apply.runnableRoot ? 'success' : 'warn',
      );
    }
    if (apply.skeletonWritten?.length) {
      onProgress?.(
        `Runnable skeleton filled: ${apply.skeletonWritten.slice(0, 6).join(', ')}${
          apply.skeletonWritten.length > 6 ? '…' : ''
        }`,
        'info',
      );
    }
    if (apply.interactivePreview) {
      onProgress?.(
        `Interactive product preview ready (${apply.interactivePreviewPath || 'public/product-preview/index.html'}) — practice flow is in App Preview`,
        'success',
      );
    }
    if (apply.baasSkippedReason) {
      onProgress?.(apply.baasSkippedReason, 'warn');
    } else if (
      skippedCount > 0 &&
      (apply.skipped || []).some((p) => /supabase|firebase/i.test(p))
    ) {
      onProgress?.(UNSOLICITED_BAAS_SKIP_REASON, 'warn');
    }
    if (writtenCount === 0 && skippedCount === 0) {
      onProgress?.('No writable file blocks applied', 'warn');
    }
    if (writtenCount > 0) {
      // Defer preview/tree events — sync dispatch after skeleton froze the coding turn
      // (listeners hit the API while apply-generated's setImmediate still owns the event loop).
      window.setTimeout(() => {
        try {
          window.dispatchEvent(new CustomEvent('nebula-files-applied'));
          window.dispatchEvent(new CustomEvent('nebula-reload-app-preview'));
          if (!assessApplyRouteDepth(writtenPaths).zeroProductRoutes) {
            dispatchStudioShowLiveApp();
            window.dispatchEvent(new CustomEvent('nebula-open-app-preview'));
          } else if (apply.interactivePreview) {
            window.dispatchEvent(new CustomEvent('nebula-open-app-preview'));
          }
        } catch {
          /* ignore */
        }
        notifyWorkspaceFilesChanged();
        if (!artifactContext?.skipPostSync) {
          void afterFilesAppliedArtifacts(artifactContext?.userNote, artifactContext?.projectName, onProgress);
        }
      }, 0);
    }
    const runnableNote =
      typeof apply.runnableRoot === 'boolean'
        ? ` ${apply.runnableStatusLine || `Runnable root: ${apply.runnableRoot ? 'yes' : 'no'}`}.`
        : '';
    return {
      ok: writtenCount > 0,
      writtenCount,
      skippedCount,
      writtenPaths,
      runnableRoot: apply.runnableRoot,
      runnableStatusLine: apply.runnableStatusLine,
      deployable: apply.deployable,
      message:
        writtenCount > 0
          ? `Applied ${writtenCount} file(s)${skippedCount ? `, skipped ${skippedCount}` : ''}${
              apply.usedFallbackPath ? ` (fallback: ${apply.usedFallbackPath})` : ''
            }.${runnableNote}`
          : 'Grok returned text, but no writable file blocks were found. Expected ```file:path``` blocks.',
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to apply files';
    if (isApplyWaitTimeout(e)) {
      const expected = extractGrokFilePaths(clean);
      const found = await confirmAppliedPathsOnDisk(expected);
      if (found.length > 0) {
        onProgress?.(
          `Apply finished — ${found.length} file(s) already on disk (write wait timed out)`,
          'success',
        );
        window.setTimeout(() => {
          try {
            window.dispatchEvent(new CustomEvent('nebula-files-applied'));
            window.dispatchEvent(new CustomEvent('nebula-reload-app-preview'));
          } catch {
            /* ignore */
          }
          if (!artifactContext?.skipPostSync) {
            void afterFilesAppliedArtifacts(
              artifactContext?.userNote,
              artifactContext?.projectName,
              onProgress,
            );
          }
        }, 0);
        return {
          ok: true,
          writtenCount: found.length,
          skippedCount: 0,
          writtenPaths: found,
          message: `Applied ${found.length} file(s) (confirmed on disk after write wait timed out).`,
        };
      }
      onProgress?.(
        'Apply timed out — files were not confirmed on disk. Try Go again.',
        'error',
      );
      return {
        ok: false,
        writtenCount: 0,
        skippedCount: 0,
        writtenPaths: [],
        message: 'Apply timed out — files were not confirmed on disk.',
        error: APPLY_TIMEOUT_MESSAGE,
      };
    }
    onProgress?.(
      isApplyTransportFailure(msg)
        ? `File apply blocked: ${msg.replace(/^HTTP \d+:\s*/i, '')} Retry Go — this wait will not start Code pass 2.`
        : msg,
      'error',
    );
    return { ok: false, writtenCount: 0, skippedCount: 0, writtenPaths: [], message: msg, error: msg };
  } finally {
    applyAbortByProject.delete(projectKey);
    stopApplyWait();
  }
}

/** Apply research / ui-brief / plan docs only — before UI Gen mockup (single-key stage B). */
export async function applyArchitectureArtifactsFromAssistant(
  assistantContent: string,
  options?: { projectName?: string; onProgress?: GrokActivityProgressFn },
): Promise<ApplyGeneratedResult | null> {
  const arch = filterGrokContentToArchitectureFiles(assistantContent);
  if (!arch) return null;
  options?.onProgress?.('Applying architecture artifacts (research + ui-brief) before UI mockup…', 'info');
  return applyGeneratedFiles(arch, {
    projectName: options?.projectName,
    onProgress: options?.onProgress,
    skipPostSync: true,
  });
}

type GoCodePayload = {
  preCodingSummary?: string;
  summarySaved?: boolean;
  codeError?: string;
  blockedReason?: GoBlockedReason;
  code?: string;
  choices?: { message?: { content?: string } }[];
  error?: string;
  codeModel?: string;
  pending?: boolean;
  coding?: boolean;
  preparing?: boolean;
  idle?: boolean;
  hint?: string;
  elapsedMs?: number;
  v0PromptWritten?: boolean;
  v0PromptLength?: number;
  continuation?: boolean;
};

async function pollGoCodeUntilDone(
  projectName: string,
  onProgress?: GrokActivityProgressFn,
  codingLabel: string = GO_CODE_PASS1_LABEL,
): Promise<GoCodePayload> {
  const key = goPollProjectKey(projectName);
  const existing = goCodePollInFlightByProject.get(key);
  if (existing) {
    onProgress?.('Go already polling on server — joining existing wait…', 'info');
    return existing;
  }

  const run = pollGoCodeUntilDoneInner(projectName, onProgress, codingLabel).finally(() => {
    goCodePollInFlightByProject.delete(key);
  });
  goCodePollInFlightByProject.set(key, run);
  return run;
}

async function pollGoCodeUntilDoneInner(
  projectName: string,
  onProgress?: GrokActivityProgressFn,
  codingLabel: string = GO_CODE_PASS1_LABEL,
): Promise<GoCodePayload> {
  const key = goPollProjectKey(projectName);
  goCodePollAbortedByProject.delete(key);
  const deadline = Date.now() + GO_POLL_MAX_WAIT_MS;
  for (let i = 0; i < GO_MAX_POLLS; i++) {
    if (goCodePollAbortedByProject.has(key)) {
      goCodePollAbortedByProject.delete(key);
      const stopped = goBlocked('GO_FAILED', 'Stopped — coding cancelled.');
      return { error: formatBlockedReasonLine(stopped), blockedReason: stopped, code: stopped.code };
    }
    if (Date.now() >= deadline) break;
    const sleepMs = Math.min(goPollBackoffMs(i), Math.max(0, deadline - Date.now()));
    if (sleepMs > 0) await sleep(sleepMs);
    if (goCodePollAbortedByProject.has(key)) {
      goCodePollAbortedByProject.delete(key);
      const stopped = goBlocked('GO_FAILED', 'Stopped — coding cancelled.');
      return { error: formatBlockedReasonLine(stopped), blockedReason: stopped, code: stopped.code };
    }
    if (Date.now() >= deadline) break;
    try {
      const pollTimed = abortAfter(GO_POLL_FETCH_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch(withProjectQuery('/api/grok/go-code/poll'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getGrokRequestHeaders() },
          credentials: 'include',
          signal: pollTimed.signal,
          body: JSON.stringify(withProjectBody({ projectName })),
        });
      } finally {
        pollTimed.cancel();
      }
      const poll = await readResponseJson<
        GoCodePayload & {
          hint?: string;
          elapsedMs?: number;
          error?: string;
          idle?: boolean;
          preparing?: boolean;
          retryAfterSec?: number;
        }
      >(response);
      if (response.status === 429) {
        const waitSec = Math.min(45, Math.max(5, Number(poll.retryAfterSec) || 12));
        onProgress?.(
          `Too many requests — waiting ${waitSec}s then continuing to poll (not a preview crash)…`,
          'warn',
        );
        await sleep(Math.min(waitSec * 1000, Math.max(0, deadline - Date.now())));
        continue;
      }
      if (poll.idle) {
        if (i === 0 || i % 6 === 0) {
          onProgress?.(GO_PREPARING_LABEL, 'info');
        }
        if (i < 8 && Date.now() < deadline) continue;
        return poll;
      }
      if (poll.error && !poll.choices?.length) {
        const blocked =
          poll.blockedReason ||
          classifyGoFailure({
            code: poll.code,
            error: poll.error,
            codeError: poll.codeError,
          });
        return { ...poll, error: formatBlockedReasonLine(blocked), blockedReason: blocked, code: blocked.code };
      }
      if (poll.codeError && !poll.choices?.[0]?.message?.content?.trim()) {
        const blocked =
          poll.blockedReason || classifyGoFailure({ code: poll.code, codeError: poll.codeError, error: poll.error });
        return { ...poll, error: formatBlockedReasonLine(blocked), blockedReason: blocked, code: blocked.code };
      }
      if (!response.ok && !poll.pending) {
        return poll;
      }
      const phase = classifyGoPoll(poll);
      if (phase === 'preparing' || (poll.pending && poll.preparing && !poll.coding)) {
        const elapsed = Number(poll.elapsedMs) || 0;
        if (elapsed >= 12_000 && i > 0 && i % 3 === 0) {
          onProgress?.('Foundation still preparing — nudging server to schedule Grok Code', 'warn');
          try {
            const nudgeTimed = abortAfter(8_000);
            try {
              await fetch(withProjectQuery('/api/grok/go-code'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getGrokRequestHeaders() },
                credentials: 'include',
                signal: nudgeTimed.signal,
                body: JSON.stringify(withProjectBody({ projectName })),
              });
            } finally {
              nudgeTimed.cancel();
            }
          } catch {
            /* next poll */
          }
        }
        if (i === 0 || i % 6 === 0) {
          onProgress?.(goPollActivityMessage('preparing', poll.elapsedMs), 'info');
        }
        continue;
      }
      if (poll.pending && poll.coding) {
        if (i === 0 || i % 6 === 0) {
          onProgress?.(codingLabel, 'info');
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
      if (Date.now() >= deadline || i >= GO_MAX_POLLS - 1) {
        const blocked = classifyGoFailure({ error: msg });
        onProgress?.(formatBlockedReasonLine(blocked), 'error');
        return { error: formatBlockedReasonLine(blocked), blockedReason: blocked, code: blocked.code };
      }
    }
  }
  const timedOut = classifyGoFailure({ error: GO_POLL_TIMEOUT_MESSAGE, code: 'GO_TIMEOUT' });
  onProgress?.(GO_POLL_TIMEOUT_MESSAGE, 'warn');
  return { error: formatBlockedReasonLine(timedOut), blockedReason: timedOut, code: timedOut.code };
}

function goPollLooksTimedOut(p: {
  code?: string;
  blockedReason?: GoBlockedReason;
  elapsedMs?: number;
}): boolean {
  if (p.code === 'GO_TIMEOUT' || p.blockedReason?.code === 'GO_TIMEOUT') return true;
  if (typeof p.elapsedMs === 'number' && p.elapsedMs >= GO_POLL_MAX_WAIT_MS) return true;
  return false;
}

/** After GO_TIMEOUT — keep polling last-result while the server fetch may still finish. */
async function recoverUnconsumedGoResult(
  projectName: string,
  onProgress?: GrokActivityProgressFn,
): Promise<GoCodePayload | null> {
  const deadline = Date.now() + GO_TIMEOUT_GRACE_MS;
  let attempt = 0;
  while (Date.now() < deadline) {
    try {
      const timed = abortAfter(GO_POLL_FETCH_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch(withProjectQuery('/api/grok/go-code/poll'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getGrokRequestHeaders() },
          credentials: 'include',
          signal: timed.signal,
          body: JSON.stringify(withProjectBody({ projectName })),
        });
      } finally {
        timed.cancel();
      }
      const poll = await readResponseJson<GoCodePayload>(response);
      if (poll.choices?.[0]?.message?.content?.trim()) return poll;
      if (poll.idle && attempt > 0) return null;
      if (attempt === 0 || attempt % 3 === 0) {
        onProgress?.(
          'Grok Code still finishing — applying when files arrive (not asking you to retry)',
          'info',
        );
      }
    } catch {
      /* next grace poll */
    }
    attempt += 1;
    const sleepMs = Math.min(GO_TIMEOUT_GRACE_POLL_MS, Math.max(0, deadline - Date.now()));
    if (sleepMs <= 0) break;
    await sleep(sleepMs);
  }
  return null;
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
  const codingLabel = goCodePassWaitLabel(continuation ? 2 : 1, parseGoSliceLabel(userNote));

  let prePoll: GoCodePayload | null = null;
  if (!continuation) {
    try {
      const preTimed = abortAfter(GO_POLL_FETCH_TIMEOUT_MS);
      let preRes: Response;
      try {
        preRes = await fetch(withProjectQuery('/api/grok/go-code/poll'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getGrokRequestHeaders() },
          credentials: 'include',
          signal: preTimed.signal,
          body: JSON.stringify(withProjectBody({ projectName })),
        });
      } finally {
        preTimed.cancel();
      }
      prePoll = await readResponseJson<GoCodePayload>(preRes);
      if (prePoll.idle) {
        prePoll = null;
      } else if (goPollLooksTimedOut(prePoll)) {
        onProgress?.('Previous Code pass already timed out — not joining it', 'warn');
        await cancelProjectBackgroundJobs();
        prePoll = null;
      } else if (prePoll.pending && prePoll.coding) {
        onProgress?.(GO_JOIN_LABEL, 'warn');
      } else if (prePoll.pending && prePoll.preparing) {
        onProgress?.(GO_JOIN_LABEL, 'info');
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

  let stopWait = () => {};
  const switchWaitLabel = (next: string) => {
    stopWait();
    stopWait = startGrokActivityWaitTicker(next, (msg, kind, opts) =>
      onProgress?.(msg, kind, opts),
    );
  };

  try {
    if (prePoll?.pending && prePoll.coding) {
      switchWaitLabel(GO_JOIN_LABEL);
      return await pollGoCodeUntilDone(projectName, onProgress, codingLabel);
    }
    if (prePoll?.pending && prePoll.preparing) {
      switchWaitLabel(GO_PREPARING_LABEL);
      return await pollGoCodeUntilDone(projectName, onProgress, codingLabel);
    }

    const GO_KICK_TIMEOUT_MS = 55_000;
    const kickController = new AbortController();
    const kickTimer = window.setTimeout(() => kickController.abort(), GO_KICK_TIMEOUT_MS);

    let goRes: Response;
    try {
      goRes = await fetch(withProjectQuery('/api/grok/go-code'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getGrokRequestHeaders() },
        credentials: 'include',
        signal: kickController.signal,
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
    } catch (err) {
      const aborted =
        (err instanceof DOMException && err.name === 'AbortError') ||
        (err instanceof Error && /abort/i.test(err.message));
      if (aborted) {
        onProgress?.(
          'Go kick still preparing — polling until the Foundation job is scheduled (not coding yet)',
          'warn',
        );
        switchWaitLabel(GO_PREPARING_LABEL);
        return await pollGoCodeUntilDone(projectName, onProgress, codingLabel);
      }
      throw err;
    } finally {
      window.clearTimeout(kickTimer);
    }

    let data = await readResponseJson<
      GoCodePayload & {
        code?: string;
        masterPlanCompleteness?: {
          gaps?: { code: string; section: string; severity: 'warn' | 'block'; message: string; remediation: string }[];
          mode?: string;
        };
      }
    >(goRes);
    if (!goRes.ok && goRes.status === 409 && String(data.code || '') === 'RESEARCH_IN_FLIGHT') {
      onProgress?.(
        String(data.error || 'Research still running — coding waits (one heavy job).'),
        'warn',
      );
      switchWaitLabel(GO_PREPARING_LABEL);
      for (let w = 0; w < 18; w++) {
        await sleep(5000);
        const retryController = new AbortController();
        const retryTimer = window.setTimeout(() => retryController.abort(), GO_KICK_TIMEOUT_MS);
        try {
          goRes = await fetch(withProjectQuery('/api/grok/go-code'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getGrokRequestHeaders() },
            credentials: 'include',
            signal: retryController.signal,
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
          data = await readResponseJson(goRes);
        } catch {
          continue;
        } finally {
          window.clearTimeout(retryTimer);
        }
        if (goRes.ok || String(data.code || '') !== 'RESEARCH_IN_FLIGHT') break;
        onProgress?.('Research still running — coding waits (one heavy job).', 'wait');
      }
    }
    if (!goRes.ok) {
      if (goRes.status === 429) {
        const waitSec = Math.min(45, Math.max(8, Number((data as { retryAfterSec?: number }).retryAfterSec) || 15));
        onProgress?.(
          `Too many Grok kicks — waiting ${waitSec}s, then polling (files may already be generating)…`,
          'warn',
        );
        await sleep(waitSec * 1000);
        switchWaitLabel(GO_PREPARING_LABEL);
        return await pollGoCodeUntilDone(projectName, onProgress, codingLabel);
      }
      const blocked = classifyGoFailure({
        httpStatus: goRes.status,
        code: data.code,
        error: data.error,
        blockedReason: (data as GoCodePayload).blockedReason,
      });
      const friendly =
        blocked.code === 'MASTER_PLAN_INCOMPLETE'
          ? formatGoBlockedByPlanMessage({ ...data, blockedReason: blocked })
          : formatBlockedReasonLine(blocked);
      onProgress?.(
        friendly.split('\n')[0] || blocked.message,
        blocked.code === 'RESEARCH_INCOMPLETE' ? 'error' : 'warn',
      );
      return {
        error: friendly,
        blockedReason: blocked,
        code: blocked.code,
      };
    }

    const warnings = Array.isArray((data as { gateWarnings?: unknown }).gateWarnings)
      ? ((data as { gateWarnings: unknown[] }).gateWarnings.filter((w) => typeof w === 'string') as string[])
      : [];
    for (const w of warnings) {
      onProgress?.(`Gate noted — continuing: ${w.replace(/^Stopped:\s*/i, '')}`, 'warn');
    }

    if (data.pending && data.coding) {
      switchWaitLabel(codingLabel);
      onProgress?.(
        continuation
          ? `${codingLabel} — empty/zero-route retry (up to ~3 min, no stream)…`
          : `Pre-coding summary saved — ${codingLabel}`,
        'info',
      );
      return await pollGoCodeUntilDone(projectName, onProgress, codingLabel);
    }
    if (data.pending && data.preparing) {
      switchWaitLabel(GO_PREPARING_LABEL);
      onProgress?.(GO_PREPARING_LABEL, 'info');
      return await pollGoCodeUntilDone(projectName, onProgress, codingLabel);
    }
    return data;
  } finally {
    stopWait();
  }
}

/** Gate R — never mark Go in-flight or POST go-code until research is ok (or demo skip). */
async function blockGoIfResearchIncomplete(
  projectName: string,
  onProgress?: GrokActivityProgressFn,
): Promise<GoBlockedReason | null> {
  const research = await fetchResearchStatus(projectName);
  if (research.ok) return null;
  const stop = formatResearchStopMessage(research.reasons);
  onProgress?.(stop, 'error');
  return goBlocked('RESEARCH_INCOMPLETE', stop);
}

export async function runGoCodeAndApply(options: {
  userId: string;
  projectName: string;
  userNote?: string;
  messages?: { role: 'user' | 'assistant'; content: string }[];
  onProgress?: GrokActivityProgressFn;
}): Promise<{
  ok: boolean;
  statusMessage: string;
  codeText?: string;
  totalWritten?: number;
  sliceLabel?: GoSliceLabel | null;
  oversizedWarning?: string | null;
  blockedReason?: GoBlockedReason;
  productRouteCount?: number;
}> {
  const { userId, projectName, userNote, messages, onProgress } = options;
  const noteSlice = parseGoSliceLabel(userNote);
  const baseMessages =
    messages && messages.length > 0
      ? messages.map((m) => ({
          role: m.role,
          content: m.content.slice(0, 2000),
        }))
      : [
          {
            role: 'user' as const,
            content: (userNote && userNote.trim()
              ? userNote.trim()
              : 'START_CODING — Foundation slice only'
            ).slice(0, 2000),
          },
        ];

  const researchBlock = await blockGoIfResearchIncomplete(projectName, onProgress);
  if (researchBlock) {
    return {
      ok: false,
      statusMessage: formatBlockedReasonLine(researchBlock),
      totalWritten: 0,
      blockedReason: researchBlock,
    };
  }
  onProgress?.('Grok Code — Code pass 1 (waiting for generated files)…', 'info');

  markFoundationGoInFlight(projectName, true);
  setGrokCodingActive(true);
  const jobKey = goPollProjectKey(projectName);
  goSessionAbortedByProject.delete(jobKey);
  goCodePollAbortedByProject.delete(jobKey);
  try {
    let totalWritten = 0;
    const allWrittenPaths: string[] = [];
    let lastCodeText = '';
    let passes = 0;
    let partialPlanOnly = false;
    let lastRunnable: { runnableRoot?: boolean; runnableStatusLine?: string } = {};
    let grokRelaunches = 0;
    const MAX_GROK_RELAUNCHES = 1;
    let timeoutRelaunches = 0;
    const MAX_TIMEOUT_RELAUNCHES = 1;
    let activeNote = userNote;
    let activeMessages = baseMessages;

    for (let pass = 0; pass < GO_CODE_MAX_PASSES; pass++) {
      if (isGoSessionAborted(projectName)) break;
      passes = pass + 1;
      const continuation = pass > 0;
      const passMessages = continuation
        ? [
            ...activeMessages,
            {
              role: 'user' as const,
              content:
                'CONTINUATION — master-plan.json is updated. Output the Foundation slice only: layout.tsx, globals.css, root page, minimal routing shell. Do NOT implement every §4 route. Do NOT stop at master-plan.json only.',
            },
          ]
        : activeMessages;

      if (continuation) {
        onProgress?.(
          `${goCodePassWaitLabel(2, noteSlice)} — empty or zero product routes after pass 1`,
          'warn',
        );
      }

      let data = await kickGoCodeJob({
        userId,
        projectName,
        userNote: activeNote,
        messages: passMessages,
        continuation,
        onProgress,
      });

      if (data.error && !data.choices?.length) {
        const blocked =
          data.blockedReason ||
          classifyGoFailure({ code: data.code, error: data.error, codeError: data.codeError });
        const hardGate =
          blocked.code === 'KEY_AUTH' ||
          blocked.code === 'RESEARCH_INCOMPLETE' ||
          blocked.code === 'MASTER_PLAN_INCOMPLETE' ||
          blocked.code === 'UI_BRIEF_MISSING';
        if (hardGate) {
          onProgress?.(formatBlockedReasonLine(blocked), 'error');
          return {
            ok: false,
            statusMessage: formatBlockedReasonLine(blocked),
            totalWritten,
            blockedReason: blocked,
          };
        }
        if (totalWritten > 0) break;
        if (blocked.code === 'GO_TIMEOUT') {
          const recovered = await recoverUnconsumedGoResult(projectName, onProgress);
          if (recovered?.choices?.[0]?.message?.content?.trim()) {
            onProgress?.('Recovering unapplied Go Code result from server', 'info');
            data = recovered;
          } else if (timeoutRelaunches < MAX_TIMEOUT_RELAUNCHES) {
            timeoutRelaunches += 1;
            const narrow = buildNarrowSliceInstruction(noteSlice || 'Foundation');
            activeNote = narrow;
            activeMessages = [{ role: 'user', content: narrow.slice(0, 2000) }];
            onProgress?.(
              'Grok Code timed out — retrying a narrower slice automatically (not asking you to type Continue)',
              'warn',
            );
            await cancelProjectBackgroundJobs();
            pass -= 1;
            continue;
          } else {
            onProgress?.(formatBlockedReasonLine(blocked), 'error');
            try {
              window.dispatchEvent(
                new CustomEvent('nebula-preview-wait-status', {
                  detail: { status: formatBlockedReasonLine(blocked) },
                }),
              );
            } catch {
              /* ignore */
            }
            return {
              ok: false,
              statusMessage: formatBlockedReasonLine(blocked),
              totalWritten,
              blockedReason: blocked,
            };
          }
        } else if (
          grokRelaunches < MAX_GROK_RELAUNCHES &&
          (blocked.code === 'GO_EMPTY_OUTPUT' || blocked.code === 'GO_FAILED')
        ) {
          grokRelaunches += 1;
          onProgress?.('No Grok Code result — relaunching this slice once', 'warn');
          pass -= 1;
          continue;
        } else {
          onProgress?.(formatBlockedReasonLine(blocked), 'error');
          return {
            ok: false,
            statusMessage: formatBlockedReasonLine(blocked),
            totalWritten,
            blockedReason: blocked,
          };
        }
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
        const blocked =
          data.blockedReason || classifyGoFailure({ code: data.code, codeError: data.codeError, error: data.error });
        if (totalWritten > 0) break;
        if (blocked.code === 'GO_TIMEOUT') {
          const recovered = await recoverUnconsumedGoResult(projectName, onProgress);
          if (recovered?.choices?.[0]?.message?.content?.trim()) {
            onProgress?.('Recovering unapplied Go Code result from server', 'info');
            data = recovered;
          } else if (timeoutRelaunches < MAX_TIMEOUT_RELAUNCHES) {
            timeoutRelaunches += 1;
            const narrow = buildNarrowSliceInstruction(noteSlice || 'Foundation');
            activeNote = narrow;
            activeMessages = [{ role: 'user', content: narrow.slice(0, 2000) }];
            onProgress?.(
              'Grok Code timed out — retrying a narrower slice automatically (not asking you to type Continue)',
              'warn',
            );
            await cancelProjectBackgroundJobs();
            pass -= 1;
            continue;
          } else {
            onProgress?.(formatBlockedReasonLine(blocked), 'error');
            return {
              ok: false,
              statusMessage: formatBlockedReasonLine(blocked),
              totalWritten,
              blockedReason: blocked,
            };
          }
        } else if (grokRelaunches < MAX_GROK_RELAUNCHES) {
          grokRelaunches += 1;
          onProgress?.('Grok Code error with no files — relaunching this slice once', 'warn');
          pass -= 1;
          continue;
        } else {
          onProgress?.(formatBlockedReasonLine(blocked), 'error');
          return {
            ok: false,
            statusMessage: formatBlockedReasonLine(blocked),
            totalWritten,
            blockedReason: blocked,
          };
        }
      }

      if (!codeText) {
        if (totalWritten > 0) break;
        if (grokRelaunches < MAX_GROK_RELAUNCHES) {
          grokRelaunches += 1;
          onProgress?.('Grok returned no files — relaunching this slice once', 'warn');
          pass -= 1;
          continue;
        }
        const empty = goBlocked('NO_FILE_BLOCKS');
        onProgress?.(formatBlockedReasonLine(empty), 'error');
        return {
          ok: false,
          statusMessage: formatBlockedReasonLine(empty),
          totalWritten,
          blockedReason: empty,
        };
      }

      lastCodeText = codeText;
      onProgress?.(`Received Grok Code output (${codeText.length.toLocaleString()} chars)`, 'info');
      // Skip per-pass artifact sync — one post-apply sync after the Go loop (avoids stacked hangs).
      const apply = await applyGeneratedFiles(codeText, {
        userNote,
        projectName,
        onProgress,
        skipPostSync: true,
      });
      totalWritten += apply.writtenCount;
      allWrittenPaths.push(...apply.writtenPaths);
      if (isGoSessionAborted(projectName)) break;
      if (shouldSkipGoCodeSecondPassAfterApply(apply)) {
        onProgress?.(
          'File apply did not reach the workspace (host HTML/403 or timeout). Not starting Code pass 2.',
          'error',
        );
        break;
      }
      if (typeof apply.runnableRoot === 'boolean') {
        lastRunnable = {
          runnableRoot: apply.runnableRoot,
          runnableStatusLine: apply.runnableStatusLine,
        };
      }

      if (apply.ok && apply.writtenCount > 0) {
        ackConsumedGoCodeResult(projectName);
      }

      partialPlanOnly = isPlanOnlyApply(allWrittenPaths) && lastRunnable.runnableRoot !== true;
      if (pass >= GO_CODE_MAX_PASSES - 1) break;
      if (
        !shouldRunGoCodeSecondPass({
          totalWritten,
          writtenPaths: allWrittenPaths,
          partialPlanOnly,
        })
      ) {
        onProgress?.(
          'Slice files on disk — not starting Code pass 2 (product files already landed).',
          'success',
        );
        break;
      }
    }

    if (totalWritten > 0) {
      void cancelProjectBackgroundJobs();
      try {
        window.dispatchEvent(new CustomEvent('nebula-master-plan-updated'));
      } catch {
        /* ignore */
      }
    }

    const depth = assessApplyRouteDepth(allWrittenPaths);
    // Prefer the slice we asked for. A thin this-turn apply must not relabel
    // Secondary/Polish as Foundation (that sent Continue back to Primary).
    const sliceLabel =
      parseGoSliceLabel(userNote) ||
      parseGoSliceLabel(lastCodeText) ||
      parseGoSliceLabel('SLICE: Foundation');
    const oversized = assessOversizedGoApply({ sliceLabel, writtenPaths: allWrittenPaths });
    const exit = assessFoundationGoExit({
      totalWritten,
      writtenPaths: allWrittenPaths,
      sliceLabel,
      runnableRoot: lastRunnable.runnableRoot,
      partialPlanOnly,
    });
    let statusMessage = buildGoCompleteMessage(
      totalWritten,
      allWrittenPaths,
      passes,
      partialPlanOnly,
      lastRunnable,
    );
    if (sliceLabel) {
      statusMessage = `Slice: **${sliceLabel}**. ${statusMessage}`;
    }
    if (oversized.oversized && oversized.message) {
      statusMessage = `${statusMessage}\n\n_${oversized.message}_`;
      onProgress?.(oversized.message, 'warn');
    }

    const ok = exit.ok && totalWritten > 0;
    if (!ok && totalWritten === 0) {
      const blocked =
        exit.blockedReason ||
        (lastCodeText ? goBlocked('APPLY_FAILED') : goBlocked('NO_FILE_BLOCKS'));
      onProgress?.(formatBlockedReasonLine(blocked), 'error');
      return {
        ok: false,
        statusMessage: formatBlockedReasonLine(blocked),
        codeText: lastCodeText,
        totalWritten: 0,
        sliceLabel,
        oversizedWarning: oversized.message,
        blockedReason: blocked,
        productRouteCount: depth.productRoutes.length,
      };
    }
    if (!exit.ok && exit.blockedReason) {
      onProgress?.(formatBlockedReasonLine(exit.blockedReason), totalWritten > 0 ? 'warn' : 'error');
    } else if (depth.authOnly && (!sliceLabel || /foundation/i.test(String(sliceLabel)))) {
      onProgress?.(
        'Auth routes landed; Home/practice/parent screens from the plan are still missing — next slice should add those routes.',
        'warn',
      );
      if (totalWritten > 0) onProgress?.(statusMessage, 'success');
    } else if (exit.ok && totalWritten > 0) {
      if (exit.warnRunnable) {
        onProgress?.(
          'Foundation routes landed — add package.json / dev scripts so the app is runnable (soft warning).',
          'warn',
        );
      }
      onProgress?.(statusMessage, 'success');
    }

    reportGoApplyTelemetry({ writtenPaths: allWrittenPaths, sliceLabel: sliceLabel || undefined });

    if (ok && !isGoSessionAborted(projectName)) {
      // Do not await — artifact sync used to freeze chat after files landed.
      // Client must still refresh mind map and open Plan (server hydrate does not dispatch UI events).
      void afterFilesAppliedArtifacts(userNote, projectName, onProgress);
      const writtenForFinalUi = allWrittenPaths.slice();
      const sliceForFinalUi = sliceLabel;
      queueMicrotask(() => {
        void triggerUiStudioBetaAfterFilesApplied({
          writtenPaths: writtenForFinalUi,
          projectName,
          onProgress,
          sliceLabel: sliceForFinalUi,
        }).catch((e) => {
          console.warn('[nebulaGrokCodingPipeline] background post-apply UI:', e);
        });
      });
    }

    return {
      ok,
      statusMessage,
      codeText: lastCodeText,
      totalWritten,
      sliceLabel,
      oversizedWarning: oversized.message,
      blockedReason: exit.blockedReason || undefined,
      productRouteCount: depth.productRoutes.length,
    };
  } catch (e) {
    const blocked = classifyGoFailure({
      error: e instanceof Error ? e.message : 'Go Code request failed',
    });
    onProgress?.(formatBlockedReasonLine(blocked), blocked.code === 'MASTER_PLAN_INCOMPLETE' ? 'warn' : 'error');
    return {
      ok: false,
      statusMessage: formatBlockedReasonLine(blocked),
      totalWritten: 0,
      blockedReason: blocked,
    };
  } finally {
    clearCodingLocks(projectName);
  }
}

/**
 * After `/api/grok/chat`: apply app file blocks from the coding handoff, or run Go Code when START_CODING fired.
 * Phase 7.5: architecture-only ```file:``` (ui-brief / research) must NOT count as coding success —
 * those land in Stage A before mockup; Foundation Go must still run.
 */
export async function handlePostGrokCodingTurn(options: {
  assistantContent: string;
  planningPhase: string;
  userId: string;
  projectName: string;
  userNote?: string;
  onProgress?: GrokActivityProgressFn;
  productRoutesOnDisk?: boolean;
}): Promise<{
  ran: boolean;
  ok?: boolean;
  statusMessage?: string;
  writtenCount?: number;
  writtenPaths?: string[];
  sliceLabel?: string | null;
  blockedReason?: GoBlockedReason;
  productRouteCount?: number;
}> {
  const { assistantContent, planningPhase, userId, projectName, userNote, onProgress } = options;
  const productRoutesOnDisk = options.productRoutesOnDisk === true;
  let launchGoAfterThinHandoff = false;

  const appCodeBlocks = filterGrokContentToAppCodeFiles(assistantContent);
  if (appCodeBlocks) {
    onProgress?.('Applying app file blocks from Grok coding handoff', 'info');
    const apply = await applyGeneratedFiles(appCodeBlocks, {
      userNote,
      projectName,
      onProgress,
      skipPostSync: true,
    });
    if (apply.ok) {
      const sliceLabel = parseGoSliceLabel(userNote) || parseGoSliceLabel(appCodeBlocks) || 'Foundation';
      const exit = assessFoundationGoExit({
        totalWritten: apply.writtenCount,
        writtenPaths: apply.writtenPaths,
        sliceLabel,
        runnableRoot: apply.runnableRoot,
        partialPlanOnly: isPlanOnlyApply(apply.writtenPaths),
      });
      if (exit.ok) {
        void afterFilesAppliedArtifacts(userNote, projectName, onProgress);
        const writtenForFinalUi = apply.writtenPaths.slice();
        const sliceForFinalUi = sliceLabel;
        queueMicrotask(() => {
          void triggerUiStudioBetaAfterFilesApplied({
            writtenPaths: writtenForFinalUi,
            projectName,
            onProgress,
            sliceLabel: sliceForFinalUi,
          }).catch((e) => {
            console.warn('[nebulaGrokCodingPipeline] background post-apply UI:', e);
          });
        });
        return {
          ran: true,
          ok: true,
          statusMessage: apply.message,
          writtenCount: apply.writtenCount,
          writtenPaths: apply.writtenPaths,
          sliceLabel,
          productRouteCount: assessApplyRouteDepth(apply.writtenPaths).productRoutes.length,
        };
      }
      onProgress?.(
        'Chat handoff was not a product shell — launching Foundation Go (index.html alone is not done)',
        'warn',
      );
      launchGoAfterThinHandoff = true;
    } else {
      onProgress?.(
        `Chat file apply did not land (${apply.message || 'empty'}). Launching Foundation Go…`,
        'warn',
      );
      launchGoAfterThinHandoff = true;
    }
  }

  if (hasOnlyArchitectureFileBlocks(assistantContent)) {
    onProgress?.(
      'Architecture docs already applied before mockup — launching Foundation coding (not treating ui-brief as app code)',
      'info',
    );
  }

  const planning = planningPhase.trim();
  // Only START_CODING / explicit coding tags launch Go — never ANSWER_Qn (tab approval ≠ implement).
  const wantsCoding =
    launchGoAfterThinHandoff || isCodingIntent(planning) || isCodingIntent(assistantContent);

  if (!wantsCoding) {
    return { ran: false };
  }

  const researchBlock = await blockGoIfResearchIncomplete(projectName, onProgress);
  if (researchBlock) {
    onProgress?.(formatBlockedReasonLine(researchBlock), 'error');
    return {
      ran: true,
      ok: false,
      statusMessage: formatBlockedReasonLine(researchBlock),
      blockedReason: researchBlock,
    };
  }

  const nextSlice = userNoteRequestsNextSlice(userNote);
  const nextLabel = nextSlice
    ? resolveNextContinueSlice({
        projectKey: projectName,
        productRoutesOnDisk,
      })
    : null;
  const instruction = nextLabel
    ? buildAutopilotSliceInstruction(nextLabel)
    : (userNote || FOUNDATION_SLICE_INSTRUCTION).slice(0, 2000);
  if (nextSlice && !productRoutesOnDisk) {
    onProgress?.(FOUNDATION_RETRY_ACTIVITY, 'warn');
  }
  onProgress?.(
    nextSlice && productRoutesOnDisk && nextLabel
      ? `START_CODING detected — launching Go Code for ${nextLabel}`
      : 'START_CODING detected — launching Go Code pipeline',
    'info',
  );
  const go = await runGoCodeAndApply({
    userId,
    projectName,
    userNote: instruction,
    onProgress,
    messages: [
      {
        role: 'user',
        content: instruction,
      },
    ],
  });
  // Artifact sync + UI Studio Beta already run inside runGoCodeAndApply on success.
  return {
    ran: true,
    ok: go.ok,
    statusMessage: go.statusMessage,
    writtenCount: go.totalWritten,
    writtenPaths: undefined,
    sliceLabel: go.sliceLabel ?? 'Foundation',
    blockedReason: go.blockedReason,
    productRouteCount: go.productRouteCount,
  };
}
