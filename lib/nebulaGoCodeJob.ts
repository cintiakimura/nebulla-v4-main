import {
  expireStaleGoCodePending,
  GO_CODE_JOB_TIMEOUT_MS,
  readGoCodeLastResult,
  readGoCodePending,
  writeGoCodeLastResult,
  writeGoCodePending,
} from "./nebulaGoCodePending";
import { grokChatCompletionsExtras } from "./grokRequestPolicy";
import { classifyGoFailure, formatBlockedReasonLine, goBlocked } from "./goBlockedReason";

export { GO_CODE_JOB_TIMEOUT_MS };

const activeJobs = new Set<string>();

export function isGoCodeJobActive(workspaceRoot: string): boolean {
  return activeJobs.has(workspaceRoot);
}

function pollBlockedPayload(
  extra: Record<string, unknown>,
  codeError: string | undefined,
  blockedReason?: ReturnType<typeof classifyGoFailure>,
): Record<string, unknown> {
  const blocked = blockedReason || classifyGoFailure({ codeError, error: codeError });
  return {
    ...extra,
    ok: false,
    pending: false,
    codeError: blocked.message,
    blockedReason: blocked,
    error: formatBlockedReasonLine(blocked),
    code: blocked.code,
  };
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
 * Phase 5: preparing → running when the xAI fetch is actually scheduled.
 * Writes nebulla-ide/go-code-pending.json with status running.
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
    // Client UI stops polling at 3 min; let xAI finish so recover can apply late files.
    const GO_CODE_FETCH_TIMEOUT_MS = 300_000;
    const timer = setTimeout(() => controller.abort(), GO_CODE_FETCH_TIMEOUT_MS);
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
          ...grokChatCompletionsExtras("go", opts.codeModel),
        }),
        signal: controller.signal,
      });

      if (!codeRes.ok) {
        const errText = await codeRes.text();
        const blocked = classifyGoFailure({ httpStatus: codeRes.status, error: errText });
        const errState = {
          status: "error" as const,
          startedAt: readGoCodePending(workspaceRoot)?.startedAt ?? Date.now(),
          preCodingSummary: opts.preCodingSummary,
          codeError: blocked.message,
          blockedReason: blocked,
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

      const emptyBlocked = codeText ? undefined : goBlocked("GO_EMPTY_OUTPUT");
      const doneState = {
        status: (codeText ? "done" : "error") as "done" | "error",
        startedAt: readGoCodePending(workspaceRoot)?.startedAt ?? Date.now(),
        preCodingSummary: opts.preCodingSummary,
        codeText: codeText || undefined,
        codeModel: opts.codeModel,
        projectDisplayName: opts.projectDisplayName,
        codeError: emptyBlocked?.message,
        blockedReason: emptyBlocked,
        conversationLogged: false,
        consumed: false,
      };
      writeGoCodePending(workspaceRoot, doneState);
      // Durable backup — survives missed one-shot polls until consume/apply.
      writeGoCodeLastResult(workspaceRoot, doneState);
    } catch (e) {
      const aborted = (e as { name?: string })?.name === "AbortError";
      const blocked = aborted
        ? goBlocked("GO_TIMEOUT")
        : classifyGoFailure({ error: e instanceof Error ? e.message : "Grok Code failed" });
      const errState = {
        status: "error" as const,
        startedAt: readGoCodePending(workspaceRoot)?.startedAt ?? Date.now(),
        preCodingSummary: opts.preCodingSummary,
        codeError: blocked.message,
        blockedReason: blocked,
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
        return pollBlockedPayload(
          {
            preCodingSummary: last.preCodingSummary,
            summarySaved: Boolean(last.preCodingSummary),
            durable: true,
          },
          last.codeError,
          last.blockedReason,
        );
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
  // Terminal pending wins over a still-listed job — otherwise polls stay "coding" forever.
  if (pending.status === "preparing") {
    const elapsed = Date.now() - pending.startedAt;
    if (elapsed >= GO_CODE_JOB_TIMEOUT_MS) {
      const blocked = goBlocked("GO_TIMEOUT");
      return pollBlockedPayload(
        {
          preCodingSummary: pending.preCodingSummary,
          summarySaved: Boolean(pending.preCodingSummary),
        },
        blocked.message,
        blocked,
      );
    }
    // Phase 5: preparing is not coding — client must not say "Grok Code running".
    return {
      ok: true,
      pending: true,
      preparing: true,
      coding: false,
      preCodingSummary: pending.preCodingSummary,
      elapsedMs: elapsed,
      hint: "Preparing plan before Grok Code — job not scheduled yet.",
    };
  }
  if (pending.status === "error") {
    return pollBlockedPayload(
      {
        preCodingSummary: pending.preCodingSummary,
        summarySaved: Boolean(pending.preCodingSummary),
        awaitConsume: true,
      },
      pending.codeError,
      pending.blockedReason,
    );
  }
  if (pending.status === "running" || (jobActive && pending.status !== "done")) {
    const elapsed = Date.now() - pending.startedAt;
    if (elapsed >= GO_CODE_JOB_TIMEOUT_MS && !jobActive) {
      const blocked = goBlocked("GO_TIMEOUT");
      return pollBlockedPayload(
        {
          preCodingSummary: pending.preCodingSummary,
          summarySaved: Boolean(pending.preCodingSummary),
        },
        blocked.message,
        blocked,
      );
    }
    return {
      ok: true,
      pending: true,
      coding: true,
      preCodingSummary: pending.preCodingSummary,
      elapsedMs: elapsed,
      hint: "Foundation slice still running (up to ~3 min, no stream) — keep polling.",
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
