import { v0CreateChat, v0WaitForChatGeneration, type V0FileEntry } from "./nebulaV0Client";
import {
  V0_START_STALE_MS,
  clearV0Pending,
  readV0Pending,
  writeV0Pending,
  type V0PendingState,
} from "./nebulaV0Pending";

export type V0ApplyFilesResult =
  | { ok: true; written: string[]; skipped?: string[]; demoUrl?: string }
  | { ok: false; error: string };

export type V0StartJobOptions = {
  workspaceRoot: string;
  apiKey: string;
  promptText: string;
  projectDisplayName?: string;
  applyFiles: (
    files: V0FileEntry[],
    chatId: string,
    demoUrl?: string,
  ) => V0ApplyFilesResult | Promise<V0ApplyFilesResult>;
};

export { V0_START_STALE_MS } from "./nebulaV0Pending";

/** Hard cap on v0 POST /chats — v0-pro can be slow; background job is not HTTP-bound. */
export const V0_CREATE_TIMEOUT_MS = 600_000;
/** Server-side wait after chatId exists (v0-pro often returns pending first). */
export const V0_GENERATION_WAIT_MS = 30 * 60 * 1000;
export const V0_GENERATION_POLL_MS = 2500;

const activeJobs = new Set<string>();

export function isV0StartJobActive(workspaceRoot: string): boolean {
  return activeJobs.has(workspaceRoot);
}

export function isV0StartStale(pending: V0PendingState | null | undefined): boolean {
  if (!pending?.starting || pending.chatId.trim()) return false;
  return Date.now() - pending.startedAt > V0_START_STALE_MS;
}

export function v0StartElapsedMs(pending: V0PendingState | null | undefined): number {
  if (!pending) return 0;
  return Math.max(0, Date.now() - pending.startedAt);
}

/**
 * Kick off v0 chat creation without blocking the HTTP response (Render ~30s gateway limit).
 * Writes `v0-pending.json` with `starting: true` immediately so `/v0-poll` never 400s mid-flight.
 */
export function scheduleV0CreateChatJob(opts: V0StartJobOptions): boolean {
  const { workspaceRoot } = opts;
  if (activeJobs.has(workspaceRoot)) return false;

  activeJobs.add(workspaceRoot);
  void (async () => {
    try {
      const v0Call = await v0CreateChat(opts.apiKey, opts.promptText);
      if (v0Call.ok === false) {
        writeV0Pending(workspaceRoot, {
          chatId: "",
          startedAt: Date.now(),
          projectDisplayName: opts.projectDisplayName,
          promptPreview: opts.promptText.slice(0, 500),
          starting: false,
          startError: v0Call.error,
        });
        return;
      }

      const chatId = v0Call.result.chatId;
      writeV0Pending(workspaceRoot, {
        chatId,
        startedAt: Date.now(),
        projectDisplayName: opts.projectDisplayName,
        promptPreview: opts.promptText.slice(0, 500),
        starting: false,
      });

      let files = v0Call.result.files;
      let demoUrl = v0Call.result.demoUrl;

      // Release poll path — client /v0-poll can fetch files while we wait below.
      activeJobs.delete(workspaceRoot);

      if (files.length === 0) {
        const wait = await v0WaitForChatGeneration(opts.apiKey, chatId, {
          maxAttempts: Math.ceil(V0_GENERATION_WAIT_MS / V0_GENERATION_POLL_MS),
          intervalMs: V0_GENERATION_POLL_MS,
        });
        if (wait.ok === false) {
          writeV0Pending(workspaceRoot, {
            chatId,
            startedAt: Date.now(),
            projectDisplayName: opts.projectDisplayName,
            promptPreview: opts.promptText.slice(0, 500),
            starting: false,
            startError: wait.error,
          });
          return;
        }
        files = wait.files;
        demoUrl = wait.demoUrl ?? demoUrl;
      }

      if (files.length > 0) {
        const applied = await opts.applyFiles(files, chatId, demoUrl);
        if (applied.ok === false) {
          const pending = readV0Pending(workspaceRoot);
          writeV0Pending(workspaceRoot, {
            chatId,
            startedAt: pending?.startedAt ?? Date.now(),
            projectDisplayName: opts.projectDisplayName,
            promptPreview: opts.promptText.slice(0, 500),
            starting: false,
            startError: applied.error,
          });
        }
      }
    } catch (e) {
      const pending = readV0Pending(workspaceRoot);
      const chatId = pending?.chatId?.trim() || "";
      writeV0Pending(workspaceRoot, {
        chatId,
        startedAt: pending?.startedAt ?? Date.now(),
        projectDisplayName: opts.projectDisplayName,
        promptPreview: opts.promptText.slice(0, 500),
        starting: false,
        startError:
          e instanceof Error
            ? e.message
            : "v0 start failed",
      });
    } finally {
      activeJobs.delete(workspaceRoot);
    }
  })();

  return true;
}

/** Clear a failed start marker so the user can retry Generate. */
export function clearV0StartFailure(workspaceRoot: string): void {
  const pending = readV0Pending(workspaceRoot);
  if (pending?.startError) clearV0Pending(workspaceRoot);
}
