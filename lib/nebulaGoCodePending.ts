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
  /** Conversation log append happens once while result remains durable. */
  conversationLogged?: boolean;
  /** Set when client acknowledges apply/consume — safe to clear. */
  consumed?: boolean;
};

export type GoCodeLastResult = {
  finishedAt: number;
  preCodingSummary?: string;
  codeText?: string;
  codeError?: string;
  codeModel?: string;
  projectDisplayName?: string;
  consumed?: boolean;
};

const REL = path.join("nebulla-ide", "go-code-pending.json");
const LAST_REL = path.join("nebulla-ide", "go-code-last-result.json");

export function goCodePendingPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, REL);
}

export function goCodeLastResultPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, LAST_REL);
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

export function readGoCodeLastResult(workspaceRoot: string): GoCodeLastResult | null {
  const p = goCodeLastResultPath(workspaceRoot);
  if (!fs.existsSync(p)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf8")) as GoCodeLastResult;
    if (!raw || typeof raw !== "object") return null;
    return raw;
  } catch {
    return null;
  }
}

/** Durable copy of the latest finished Go Code output (survives missed polls). */
export function writeGoCodeLastResult(
  workspaceRoot: string,
  state: Pick<
    GoCodePendingState,
    "preCodingSummary" | "codeText" | "codeError" | "codeModel" | "projectDisplayName"
  >,
): void {
  const p = goCodeLastResultPath(workspaceRoot);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const payload: GoCodeLastResult = {
    finishedAt: Date.now(),
    preCodingSummary: state.preCodingSummary,
    codeText: state.codeText,
    codeError: state.codeError,
    codeModel: state.codeModel,
    projectDisplayName: state.projectDisplayName,
    consumed: false,
  };
  fs.writeFileSync(p, JSON.stringify(payload, null, 2), "utf8");
}

export function clearGoCodeLastResult(workspaceRoot: string): void {
  const p = goCodeLastResultPath(workspaceRoot);
  try {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch {
    /* ignore */
  }
}

/**
 * Mark result consumed after successful apply (or explicit client ack).
 * Clears pending; keeps last-result marked consumed so idle polls stay clean.
 */
export function consumeGoCodeResult(workspaceRoot: string): boolean {
  const pending = readGoCodePending(workspaceRoot);
  const last = readGoCodeLastResult(workspaceRoot);
  let changed = false;

  if (pending && (pending.status === "done" || pending.status === "error")) {
    clearGoCodePending(workspaceRoot);
    changed = true;
  }

  if (last && !last.consumed) {
    const p = goCodeLastResultPath(workspaceRoot);
    fs.writeFileSync(
      p,
      JSON.stringify({ ...last, consumed: true }, null, 2),
      "utf8",
    );
    changed = true;
  }

  return changed;
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
