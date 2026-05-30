import fs from "fs";
import path from "path";

export type GoCodePendingState = {
  status: "running" | "done" | "error";
  startedAt: number;
  preCodingSummary?: string;
  codeText?: string;
  codeError?: string;
  codeModel?: string;
  projectDisplayName?: string;
};

const REL = path.join("nebulla-ide", "go-code-pending.json");

export function goCodePendingPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, REL);
}

export function readGoCodePending(workspaceRoot: string): GoCodePendingState | null {
  const p = goCodePendingPath(workspaceRoot);
  if (!fs.existsSync(p)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf8")) as GoCodePendingState;
    if (!raw || typeof raw !== "object") return null;
    return raw;
  } catch {
    return null;
  }
}

export function writeGoCodePending(workspaceRoot: string, state: GoCodePendingState): void {
  const p = goCodePendingPath(workspaceRoot);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(state, null, 2), "utf8");
}

export function clearGoCodePending(workspaceRoot: string): void {
  const p = goCodePendingPath(workspaceRoot);
  try {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch {
    /* ignore */
  }
}

/** After this, any go-code-pending row is dropped (stale poll loops). */
export const GO_CODE_PENDING_MAX_AGE_MS = 20 * 60 * 1000;

/**
 * Drop or fail abandoned go-code-pending.json so clients stop polling.
 * Returns true if the file was removed.
 */
export function expireStaleGoCodePending(
  workspaceRoot: string,
  opts?: { jobActive?: boolean },
): boolean {
  const pending = readGoCodePending(workspaceRoot);
  if (!pending) return false;

  const age = Date.now() - pending.startedAt;
  if (age > GO_CODE_PENDING_MAX_AGE_MS) {
    clearGoCodePending(workspaceRoot);
    return true;
  }

  if (pending.status === "running" && !opts?.jobActive && age > 11 * 60 * 1000) {
    writeGoCodePending(workspaceRoot, {
      ...pending,
      status: "error",
      codeError: "Grok Code session expired on the server. Press Go once to retry.",
    });
    return false;
  }

  return false;
}

export function goCodeElapsedMs(pending: GoCodePendingState | null | undefined): number {
  if (!pending) return 0;
  return Math.max(0, Date.now() - pending.startedAt);
}
