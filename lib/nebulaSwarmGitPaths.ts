import { execFileSync } from "child_process";

/**
 * Paths changed in the working tree vs index and vs HEAD (best-effort).
 * Returns deduped relative paths; empty if not a git repo or git fails.
 */
export function getRecentlyChangedGitPaths(workspaceRoot: string, max = 20): string[] {
  const out = new Set<string>();
  const run = (args: string[]) => {
    try {
      const buf = execFileSync("git", ["-C", workspaceRoot, ...args], {
        encoding: "utf8",
        maxBuffer: 2_000_000,
        stdio: ["ignore", "pipe", "ignore"],
      });
      for (const line of buf.split("\n")) {
        const p = line.trim();
        if (p) out.add(p);
      }
    } catch {
      /* not a git repo or git missing */
    }
  };
  run(["diff", "--name-only"]);
  run(["diff", "--cached", "--name-only"]);
  return [...out].slice(0, max);
}
