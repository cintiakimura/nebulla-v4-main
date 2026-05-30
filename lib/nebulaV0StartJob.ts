import { v0CreateChat, type V0FileEntry } from "./nebulaV0Client";
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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), V0_CREATE_TIMEOUT_MS);
    try {
      const v0Call = await v0CreateChat(opts.apiKey, opts.promptText, controller.signal);
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

      writeV0Pending(workspaceRoot, {
        chatId: v0Call.result.chatId,
        startedAt: Date.now(),
        projectDisplayName: opts.projectDisplayName,
        promptPreview: opts.promptText.slice(0, 500),
        starting: false,
      });

      if (v0Call.result.files.length > 0) {
        const applied = await opts.applyFiles(
          v0Call.result.files,
          v0Call.result.chatId,
          v0Call.result.demoUrl,
        );
        if (applied.ok === false) {
          const pending = readV0Pending(workspaceRoot);
          writeV0Pending(workspaceRoot, {
            chatId: v0Call.result.chatId,
            startedAt: pending?.startedAt ?? Date.now(),
            projectDisplayName: opts.projectDisplayName,
            promptPreview: opts.promptText.slice(0, 500),
            starting: false,
            startError: applied.error,
          });
        }
      }
    } catch (e) {
      const aborted = (e as { name?: string })?.name === "AbortError";
      writeV0Pending(workspaceRoot, {
        chatId: "",
        startedAt: Date.now(),
        projectDisplayName: opts.projectDisplayName,
        promptPreview: opts.promptText.slice(0, 500),
        starting: false,
        startError: aborted
          ? "v0 API is still processing (waited 10 min). Poll again — credits may already have been used; do not click Generate repeatedly."
          : e instanceof Error
            ? e.message
            : "v0 start failed",
      });
    } finally {
      clearTimeout(timer);
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
