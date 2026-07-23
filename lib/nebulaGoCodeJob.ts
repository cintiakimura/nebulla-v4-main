import {
  expireStaleGoCodePending,
  readGoCodeLastResult,
  readGoCodePending,
  writeGoCodeLastResult,
  writeGoCodePending,
} from "./nebulaGoCodePending";

export const GO_CODE_JOB_TIMEOUT_MS = 600_000;

const activeJobs = new Set<string>();

export function isGoCodeJobActive(workspaceRoot: string): boolean {
  return activeJobs.has(workspaceRoot);
}

export type GoCodeJobOptions = {
  workspaceRoot: string;
  apiKey: string;
  codeModel: string;
  codeMessages: { role: string; content: string }[];
  preCodingSummary: string;
  projectDisplayName?: string;
};

/**
 * Run Grok Code off the HTTP thread (Render ~30s gateway limit).
 * Writes nebulla-ide/go-code-pending.json immediately with status running.
 */
export function scheduleGoCodeJob(opts: GoCodeJobOptions): boolean {
  const { workspaceRoot } = opts;
  if (activeJobs.has(workspaceRoot)) return false;

  writeGoCodePending(workspaceRoot, {
    status: "running",
    startedAt: Date.now(),
    preCodingSummary: opts.preCodingSummary,
    projectDisplayName: opts.projectDisplayName,
  });

  activeJobs.add(workspaceRoot);
  void (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GO_CODE_JOB_TIMEOUT_MS);
    try {
      const codeRes = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${opts.apiKey}`,
        },
        body: JSON.stringify({
          model: opts.codeModel,
          messages: opts.codeMessages,
          stream: false,
        }),
        signal: controller.signal,
      });

      if (!codeRes.ok) {
        const errText = await codeRes.text();
        const errState = {
          status: "error" as const,
          startedAt: readGoCodePending(workspaceRoot)?.startedAt ?? Date.now(),
          preCodingSummary: opts.preCodingSummary,
          codeError: errText.slice(0, 800),
          codeModel: opts.codeModel,
          projectDisplayName: opts.projectDisplayName,
          conversationLogged: false,
          consumed: false,
        };
        writeGoCodePending(workspaceRoot, errState);
        writeGoCodeLastResult(workspaceRoot, errState);
        return;
      }

      const codeData = (await codeRes.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const codeText = codeData.choices?.[0]?.message?.content?.trim() || "";

      const doneState = {
        status: (codeText ? "done" : "error") as "done" | "error",
        startedAt: readGoCodePending(workspaceRoot)?.startedAt ?? Date.now(),
        preCodingSummary: opts.preCodingSummary,
        codeText: codeText || undefined,
        codeModel: opts.codeModel,
        projectDisplayName: opts.projectDisplayName,
        codeError: codeText ? undefined : "Grok Code returned empty output.",
        conversationLogged: false,
        consumed: false,
      };
      writeGoCodePending(workspaceRoot, doneState);
      // Durable backup — survives missed one-shot polls until consume/apply.
      writeGoCodeLastResult(workspaceRoot, doneState);
    } catch (e) {
      const aborted = (e as { name?: string })?.name === "AbortError";
      const errState = {
        status: "error" as const,
        startedAt: readGoCodePending(workspaceRoot)?.startedAt ?? Date.now(),
        preCodingSummary: opts.preCodingSummary,
        codeError: aborted
          ? "Grok Code timed out after 10 minutes. Try Go again with a narrower focus."
          : e instanceof Error
            ? e.message
            : "Grok Code failed",
        codeModel: opts.codeModel,
        projectDisplayName: opts.projectDisplayName,
        conversationLogged: false,
        consumed: false,
      };
      writeGoCodePending(workspaceRoot, errState);
      writeGoCodeLastResult(workspaceRoot, errState);
    } finally {
      clearTimeout(timer);
      activeJobs.delete(workspaceRoot);
    }
  })();

  return true;
}

export function goCodePendingToPollResponse(
  pending: ReturnType<typeof readGoCodePending>,
  jobActive: boolean,
  workspaceRoot?: string,
): Record<string, unknown> {
  if (workspaceRoot) {
    expireStaleGoCodePending(workspaceRoot, { jobActive });
    pending = readGoCodePending(workspaceRoot);
  }

  // Prefer in-progress / unfinished pending; fall back to durable last-result if unconsumed.
  if (!pending && workspaceRoot) {
    const last = readGoCodeLastResult(workspaceRoot);
    if (last && !last.consumed && (last.codeText || last.codeError)) {
      if (last.codeError && !last.codeText) {
        return {
          ok: false,
          pending: false,
          preCodingSummary: last.preCodingSummary,
          codeError: last.codeError || "Grok Code failed",
          summarySaved: Boolean(last.preCodingSummary),
          durable: true,
        };
      }
      return {
        ok: true,
        pending: false,
        summarySaved: true,
        preCodingSummary: last.preCodingSummary,
        codeModel: last.codeModel,
        choices: last.codeText ? [{ message: { content: last.codeText } }] : [],
        codeError: last.codeError,
        durable: true,
        awaitConsume: true,
      };
    }
  }

  if (!pending) {
    return {
      ok: true,
      pending: false,
      idle: true,
      hint: "No Go coding session on server — press Go to start, or the last job already finished.",
    };
  }
  if (pending.status === "running" || jobActive) {
    return {
      ok: true,
      pending: true,
      coding: true,
      preCodingSummary: pending.preCodingSummary,
      elapsedMs: Date.now() - pending.startedAt,
      hint: "Grok Code is still running on the server — keep polling.",
    };
  }
  if (pending.consumed) {
    return {
      ok: true,
      pending: false,
      idle: true,
      hint: "Go Code result already applied — press Go to start a new pass.",
    };
  }
  if (pending.status === "error") {
    return {
      ok: false,
      pending: false,
      preCodingSummary: pending.preCodingSummary,
      codeError: pending.codeError || "Grok Code failed",
      summarySaved: Boolean(pending.preCodingSummary),
      awaitConsume: true,
    };
  }
  return {
    ok: true,
    pending: false,
    summarySaved: true,
    preCodingSummary: pending.preCodingSummary,
    codeModel: pending.codeModel,
    choices: pending.codeText ? [{ message: { content: pending.codeText } }] : [],
    codeError: pending.codeError,
    awaitConsume: true,
  };
}
