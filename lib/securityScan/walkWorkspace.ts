import fs from "node:fs";
import path from "node:path";

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  ".git",
  ".next",
  ".nuxt",
  ".turbo",
  ".cache",
  "coverage",
  ".vercel",
  ".output",
  "out",
  "vendor",
  "__pycache__",
  ".venv",
  "venv",
]);

const TEXT_EXT = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".env",
  ".css",
  ".scss",
  ".html",
  ".htm",
  ".vue",
  ".svelte",
  ".py",
  ".go",
  ".rs",
  ".toml",
  ".yml",
  ".yaml",
  ".sql",
  ".prisma",
  ".txt",
  ".sh",
]);

const MAX_FILES_DEFAULT = 400;
const MAX_FILE_BYTES = 256 * 1024;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;

export type WalkedFile = {
  absPath: string;
  relPath: string;
  base: string;
  size: number;
};

export function walkWorkspaceFiles(
  workspaceRoot: string,
  options?: { maxFiles?: number },
): { files: WalkedFile[]; truncated: boolean; warnings: string[] } {
  const maxFiles = options?.maxFiles ?? MAX_FILES_DEFAULT;
  const files: WalkedFile[] = [];
  const warnings: string[] = [];
  let truncated = false;
  let totalBytes = 0;

  const root = path.resolve(workspaceRoot);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    return { files, truncated: false, warnings: ["Workspace folder is missing or not a directory."] };
  }

  const stack = [root];
  while (stack.length > 0) {
    if (files.length >= maxFiles || totalBytes >= MAX_TOTAL_BYTES) {
      truncated = true;
      break;
    }
    const dir = stack.pop()!;
    let ents: fs.Dirent[];
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of ents) {
      if (files.length >= maxFiles || totalBytes >= MAX_TOTAL_BYTES) {
        truncated = true;
        break;
      }
      const name = ent.name;
      if (name === "." || name === "..") continue;
      const full = path.join(dir, name);
      if (ent.isDirectory()) {
        if (SKIP_DIRS.has(name)) continue;
        if (name.startsWith(".") && name !== ".env" && !name.startsWith(".env.")) continue;
        stack.push(full);
        continue;
      }
      if (!ent.isFile()) continue;

      const relPath = path.relative(root, full).replace(/\\/g, "/");
      const base = path.basename(full);
      const ext = path.extname(base).toLowerCase();
      const isDotEnv = base === ".env" || base.startsWith(".env.");
      if (!isDotEnv && !TEXT_EXT.has(ext) && ext !== "") continue;

      let size = 0;
      try {
        size = fs.statSync(full).size;
      } catch {
        continue;
      }
      if (size <= 0 || size > MAX_FILE_BYTES) continue;
      totalBytes += size;
      files.push({ absPath: full, relPath, base, size });
    }
  }

  if (truncated) {
    warnings.push(
      `Scan capped at ${maxFiles} files / ${Math.round(MAX_TOTAL_BYTES / (1024 * 1024))}MB — results may be partial.`,
    );
  }
  return { files, truncated, warnings };
}

export function readFileTextLimited(absPath: string, maxBytes = MAX_FILE_BYTES): string | null {
  try {
    const buf = fs.readFileSync(absPath);
    if (buf.length > maxBytes) return buf.subarray(0, maxBytes).toString("utf8");
    return buf.toString("utf8");
  } catch {
    return null;
  }
}
