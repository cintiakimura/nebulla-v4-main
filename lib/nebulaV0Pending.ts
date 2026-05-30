import fs from "fs";
import path from "path";
import { hasRealV0ApiGeneration } from "./nebulaUiStudioPipeline";

export type V0PendingState = {
  chatId: string;
  startedAt: number;
  projectDisplayName?: string;
  promptPreview?: string;
  /** v0 API create in flight — chatId may be empty until the job finishes. */
  starting?: boolean;
  startError?: string;
  /** Poll-time stale recoveries — cap to avoid infinite re-kick loops. */
  recoveryCount?: number;
};

const REL = path.join("nebulla-ide", "v0-pending.json");

/** After this, pending with no files is treated as abandoned (Render restarts, stale poll loops). */
export const V0_PENDING_MAX_AGE_MS = 20 * 60 * 1000;
/** Grok-coded app exists — drop stale v0 resume state so UI shows Generate v0. */
export const V0_PENDING_GROK_APP_CLEAR_MS = 2 * 60 * 1000;
/** chatId tracked but v0 files never landed. */
export const V0_PENDING_CHAT_ABANDON_MS = 12 * 60 * 1000;

export function v0PendingAbs(workspaceRoot: string): string {
  return path.join(workspaceRoot, REL);
}

export function readV0Pending(workspaceRoot: string): V0PendingState | null {
  const abs = v0PendingAbs(workspaceRoot);
  if (!fs.existsSync(abs)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(abs, "utf8")) as V0PendingState;
    if (typeof raw.chatId !== "string") return null;
    const chatId = raw.chatId.trim();
    const starting = raw.starting === true;
    if (!chatId && !starting) return null;
    return {
      chatId,
      startedAt: typeof raw.startedAt === "number" ? raw.startedAt : Date.now(),
      projectDisplayName:
        typeof raw.projectDisplayName === "string" ? raw.projectDisplayName : undefined,
      promptPreview: typeof raw.promptPreview === "string" ? raw.promptPreview : undefined,
      starting,
      startError: typeof raw.startError === "string" ? raw.startError : undefined,
      recoveryCount: typeof raw.recoveryCount === "number" ? raw.recoveryCount : undefined,
    };
  } catch {
    return null;
  }
}

export function writeV0Pending(workspaceRoot: string, state: V0PendingState): void {
  const abs = v0PendingAbs(workspaceRoot);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(state, null, 2), "utf8");
}

export function clearV0Pending(workspaceRoot: string): void {
  const abs = v0PendingAbs(workspaceRoot);
  try {
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
  } catch {
    /* ignore */
  }
}

function workspaceHasGrokAppScaffold(workspaceRoot: string): boolean {
  const candidates = [
    path.join(workspaceRoot, "app", "layout.tsx"),
    path.join(workspaceRoot, "app", "page.tsx"),
    path.join(workspaceRoot, "src", "App.tsx"),
  ];
  return candidates.some((p) => fs.existsSync(p));
}

/**
 * Drop abandoned v0-pending.json so UI stops resume-only polling.
 * Returns true if pending was cleared.
 */
export function expireStaleV0Pending(
  workspaceRoot: string,
  opts?: { jobActive?: boolean },
): boolean {
  const pending = readV0Pending(workspaceRoot);
  if (!pending) return false;
  if (opts?.jobActive) return false;

  if (hasRealV0ApiGeneration(workspaceRoot)) {
    clearV0Pending(workspaceRoot);
    return true;
  }

  const age = Date.now() - pending.startedAt;
  const grokAppReady = workspaceHasGrokAppScaffold(workspaceRoot);
  const tooOld = age > V0_PENDING_MAX_AGE_MS;
  const stuckStarting = pending.starting && !pending.chatId.trim();
  const tooManyRecoveries = (pending.recoveryCount ?? 0) >= 3;
  const chatId = pending.chatId.trim();

  if (tooOld || tooManyRecoveries || (grokAppReady && stuckStarting)) {
    clearV0Pending(workspaceRoot);
    return true;
  }

  if (grokAppReady && stuckStarting && age > 5 * 60 * 1000) {
    clearV0Pending(workspaceRoot);
    return true;
  }

  // Grok Code finished first — stale v0 resume blocks manual Generate v0.
  if (grokAppReady && age > V0_PENDING_GROK_APP_CLEAR_MS) {
    clearV0Pending(workspaceRoot);
    return true;
  }

  if (chatId && age > V0_PENDING_CHAT_ABANDON_MS) {
    clearV0Pending(workspaceRoot);
    return true;
  }

  return false;
}

export function bumpV0PendingRecovery(workspaceRoot: string): void {
  const pending = readV0Pending(workspaceRoot);
  if (!pending) return;
  writeV0Pending(workspaceRoot, {
    ...pending,
    recoveryCount: (pending.recoveryCount ?? 0) + 1,
  });
}
