/**
 * Workshop floor — Go/Build only. Grok + workspace files + tsc. No MCP, no Talk.
 */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { inspectRunnableSkeleton } from "./runnableAppSkeleton";
import { WORKSHOP_EXAM_MAX_RETRIES, workshopExamDecision } from "./workshopExamPolicy";

export { WORKSHOP_EXAM_MAX_RETRIES, workshopExamDecision };
export type { ExamDecision } from "./workshopExamPolicy";

export const WORKSHOP_EXAM_TIMEOUT_MS = 60_000;

export type WorkshopExamResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
};

const WRITE_DENY = /(^|\/)\.git(\/|$)|(^|\/)\.cursor(\/|$)|(^|\/)node_modules(\/|$)/i;
const SKIP_DIR = new Set([
  "node_modules",
  ".git",
  ".cursor",
  "dist",
  "build",
  ".next",
  "coverage",
  "nebulla-ide",
  "nebula-project",
  "nebulla-project",
  "nebula-ui-studio",
]);

function resolveUnderRoot(root: string, rel: string): string | null {
  const cleaned = String(rel || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/^\.\//, "");
  if (!cleaned || cleaned.includes("..") || WRITE_DENY.test(cleaned)) return null;
  const base = path.resolve(root);
  const target = path.resolve(base, cleaned);
  if (!target.startsWith(base)) return null;
  return target;
}

function walkProductFiles(absDir: string, relDir: string, acc: string[]): void {
  let ents: fs.Dirent[] = [];
  try {
    ents = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of ents) {
    const name = ent.name;
    if (name.startsWith(".") && name !== ".env.example") continue;
    if (SKIP_DIR.has(name)) continue;
    const rel = relDir ? `${relDir}/${name}` : name;
    const abs = path.join(absDir, name);
    if (ent.isDirectory()) {
      walkProductFiles(abs, rel, acc);
      continue;
    }
    if (!ent.isFile()) continue;
    if (/^(app|src|pages|components)\//i.test(rel) || /^(app|src|pages|components)$/i.test(relDir)) {
      acc.push(rel.replace(/\\/g, "/"));
    }
  }
}

/** Existing product files under app/ src/ pages/ components/. */
export function listPaths(root: string): string[] {
  const base = path.resolve(root);
  const acc: string[] = [];
  if (!fs.existsSync(base)) return acc;
  walkProductFiles(base, "", acc);
  acc.sort((a, b) => a.localeCompare(b));
  return acc.slice(0, 400);
}

export function formatWorkshopFileList(paths: string[]): string {
  const list = paths.length ? paths.map((p) => `- ${p}`).join("\n") : "(no app/src files on disk yet)";
  return `## Existing app/src files\n${list}`.slice(0, 8000);
}

export function readPath(root: string, rel: string): string | null {
  const target = resolveUnderRoot(root, rel);
  if (!target) return null;
  try {
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) return null;
    return fs.readFileSync(target, "utf8");
  } catch {
    return null;
  }
}

/** Same path gates as POST /api/files/apply-generated (deny git/cursor/node_modules / ..). */
export function writePath(
  root: string,
  rel: string,
  content: string,
): { ok: boolean; relativePath?: string; skipped?: string } {
  const cleaned = String(rel || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/^\.\//, "");
  const target = resolveUnderRoot(root, cleaned);
  if (!target) return { ok: false, skipped: cleaned || rel };
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, String(content ?? "").replace(/\r\n/g, "\n"), "utf8");
    return { ok: true, relativePath: cleaned };
  } catch {
    return { ok: false, skipped: cleaned };
  }
}

function runTsc(
  bin: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, {
      cwd,
      env: { ...process.env, CI: "1", FORCE_COLOR: "0" },
      shell: process.platform === "win32",
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
    }, timeoutMs);
    child.stdout?.on("data", (d) => {
      stdout += String(d);
      if (stdout.length > 40_000) stdout = stdout.slice(-40_000);
    });
    child.stderr?.on("data", (d) => {
      stderr += String(d);
      if (stderr.length > 40_000) stderr = stderr.slice(-40_000);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: 1, stdout, stderr: `${stderr}\n${err.message}`, timedOut });
    });
  });
}

function resolveTscBin(appRoot: string): { bin: string; args: string[] } | null {
  const unix = path.join(appRoot, "node_modules", ".bin", "tsc");
  const win = path.join(appRoot, "node_modules", ".bin", "tsc.cmd");
  const tsjs = path.join(appRoot, "node_modules", "typescript", "bin", "tsc");
  if (process.platform === "win32" && fs.existsSync(win)) {
    return { bin: win, args: ["--noEmit", "--pretty", "false"] };
  }
  if (fs.existsSync(unix)) return { bin: unix, args: ["--noEmit", "--pretty", "false"] };
  if (fs.existsSync(tsjs)) {
    return { bin: process.execPath, args: [tsjs, "--noEmit", "--pretty", "false"] };
  }
  return null;
}

/** tsc --noEmit in the product workspace. 60s cap. */
export async function runExam(root: string): Promise<WorkshopExamResult> {
  const status = inspectRunnableSkeleton(path.resolve(root));
  const cwd = status.appRoot || path.resolve(root);
  const bin = resolveTscBin(cwd);
  if (!bin) {
    return {
      ok: false,
      stdout: "",
      stderr: "tsc not found in product node_modules (typescript). Install deps in the workspace, then retry Go.",
    };
  }
  const ran = await runTsc(bin.bin, bin.args, cwd, WORKSHOP_EXAM_TIMEOUT_MS);
  const stderr = ran.timedOut
    ? `${ran.stderr}\ntsc --noEmit timed out after ${WORKSHOP_EXAM_TIMEOUT_MS / 1000}s`.trim()
    : ran.stderr;
  return {
    ok: !ran.timedOut && ran.code === 0,
    stdout: ran.stdout,
    stderr,
  };
}

export function formatExamRepairUserMessage(packet: string, stderr: string, fileList: string): string {
  return [
    packet.trim(),
    "",
    fileList.trim(),
    "",
    "## tsc --noEmit failed — fix only these errors",
    String(stderr || "").trim().slice(0, 6000) || "(no stderr)",
    "",
    "Output file: blocks only. No user-facing questions. Not a chat turn.",
  ].join("\n");
}
