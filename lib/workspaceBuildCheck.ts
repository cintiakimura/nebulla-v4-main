/**
 * Controlled workspace build check (npm install + npm run build).
 * Does not redeploy the Nebulla platform Render service.
 */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import {
  ensureRunnableSkeleton,
  inspectRunnableSkeleton,
  type RunnableSkeletonStatus,
} from "./runnableAppSkeleton";

export type WorkspaceBuildCheckResult = {
  ok: boolean;
  mode: "build_check";
  runnable: boolean;
  appRootRel: string;
  framework: string;
  status: RunnableSkeletonStatus;
  installOk?: boolean;
  buildOk?: boolean;
  logSnippet?: string;
  error?: string;
  /** No public customer URL yet — honest next step. */
  url: string | null;
  nextStep: string;
};

function runCommand(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
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
      if (stdout.length > 80_000) stdout = stdout.slice(-80_000);
    });
    child.stderr?.on("data", (d) => {
      stderr += String(d);
      if (stderr.length > 80_000) stderr = stderr.slice(-80_000);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        code: 1,
        stdout,
        stderr: `${stderr}\n${err.message}`,
        timedOut,
      });
    });
  });
}

function snippet(stdout: string, stderr: string, max = 1200): string {
  const combined = `${stderr}\n${stdout}`.trim();
  return combined.slice(-max);
}

export async function runWorkspaceBuildCheck(
  workspaceRoot: string,
  options?: { projectName?: string; skipInstall?: boolean; timeoutMs?: number },
): Promise<WorkspaceBuildCheckResult> {
  const root = path.resolve(workspaceRoot);
  if (!fs.existsSync(root)) {
    return {
      ok: false,
      mode: "build_check",
      runnable: false,
      appRootRel: ".",
      framework: "unknown",
      status: inspectRunnableSkeleton(root),
      url: null,
      error: "Workspace root missing",
      nextStep: "Apply a coding slice so product files exist, then retry Deploy / Build check.",
    };
  }

  const status = ensureRunnableSkeleton(root, { projectName: options?.projectName });
  if (!status.runnable) {
    return {
      ok: false,
      mode: "build_check",
      runnable: false,
      appRootRel: status.appRootRel,
      framework: status.framework,
      status,
      url: null,
      error: `Not runnable — missing: ${status.missing.join(", ") || "unknown"}`,
      nextStep:
        "Open Explorer and ensure package.json has scripts.dev/build/start plus framework entry (app/page.tsx). Re-run Go or ask Agent to emit the skeleton.",
    };
  }

  const timeoutMs = options?.timeoutMs ?? 180_000;
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  let installOk = true;
  let log = "";

  if (!options?.skipInstall) {
    const install = await runCommand(npmCmd, ["install", "--no-fund", "--no-audit"], root, timeoutMs);
    log += snippet(install.stdout, install.stderr);
    if (install.timedOut || install.code !== 0) {
      return {
        ok: false,
        mode: "build_check",
        runnable: true,
        appRootRel: status.appRootRel,
        framework: status.framework,
        status,
        installOk: false,
        buildOk: false,
        logSnippet: log,
        url: null,
        error: install.timedOut ? "npm install timed out" : "npm install failed",
        nextStep: "Fix package.json dependencies, then retry Build check. Or run npm install locally.",
      };
    }
  }

  const build = await runCommand(npmCmd, ["run", "build"], root, timeoutMs);
  log = `${log}\n${snippet(build.stdout, build.stderr)}`.trim();
  const buildOk = !build.timedOut && build.code === 0;

  return {
    ok: buildOk,
    mode: "build_check",
    runnable: true,
    appRootRel: status.appRootRel,
    framework: status.framework,
    status,
    installOk,
    buildOk,
    logSnippet: log.slice(-1200),
    url: null,
    error: buildOk ? undefined : build.timedOut ? "npm run build timed out" : "npm run build failed",
    nextStep: buildOk
      ? "Build succeeded. Public per-project hosting is not wired yet — download/push this workspace and deploy to Render/Vercel, or run npm run start locally. Nebulla Deploy currently means Build check."
      : "Read the build log snippet, fix TypeScript/import errors in Explorer, then retry Deploy / Build check.",
  };
}
