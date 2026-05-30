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
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

export function goCodeElapsedMs(pending: GoCodePendingState | null | undefined): number {
  if (!pending) return 0;
  return Math.max(0, Date.now() - pending.startedAt);
}
