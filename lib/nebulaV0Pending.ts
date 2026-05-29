import fs from "fs";
import path from "path";

export type V0PendingState = {
  chatId: string;
  startedAt: number;
  projectDisplayName?: string;
  promptPreview?: string;
};

const REL = path.join("nebulla-ide", "v0-pending.json");

export function v0PendingAbs(workspaceRoot: string): string {
  return path.join(workspaceRoot, REL);
}

export function readV0Pending(workspaceRoot: string): V0PendingState | null {
  const abs = v0PendingAbs(workspaceRoot);
  if (!fs.existsSync(abs)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(abs, "utf8")) as V0PendingState;
    if (typeof raw.chatId !== "string" || !raw.chatId.trim()) return null;
    return {
      chatId: raw.chatId.trim(),
      startedAt: typeof raw.startedAt === "number" ? raw.startedAt : Date.now(),
      projectDisplayName:
        typeof raw.projectDisplayName === "string" ? raw.projectDisplayName : undefined,
      promptPreview: typeof raw.promptPreview === "string" ? raw.promptPreview : undefined,
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
