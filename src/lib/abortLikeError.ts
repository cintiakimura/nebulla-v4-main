/**
 * Browser AbortError / timeout — never show Chrome's
 * "signal is aborted without reason" as a hard coding stop.
 */

export type AbortHonestyKind = "timeout" | "user_stop" | "superseded" | "unknown";

export const ABORT_HONESTY_LINES: Record<AbortHonestyKind, string> = {
  timeout: "Stopped: the request timed out. Coding did not finish.",
  user_stop: "Stopped — you cancelled coding.",
  superseded: "Stopped: a newer coding pass replaced this one.",
  unknown: "Stopped: the coding request was cancelled.",
};

export function isAbortLikeError(e: unknown): boolean {
  if (!e) return false;
  if (typeof DOMException !== "undefined" && e instanceof DOMException) {
    if (e.name === "AbortError" || e.name === "TimeoutError") return true;
  }
  if (e instanceof Error) {
    return e.name === "AbortError" || e.name === "TimeoutError" || isAbortLikeMessage(e.message);
  }
  return isAbortLikeMessage(String(e));
}

export function isAbortLikeMessage(message?: string | null): boolean {
  return /aborted|abort|timed out|timeout|without reason/i.test(String(message || ""));
}

export function classifyAbortHonesty(
  e: unknown,
  hints?: { userStopped?: boolean; timeout?: boolean; superseded?: boolean },
): AbortHonestyKind {
  if (hints?.userStopped) return "user_stop";
  if (hints?.superseded) return "superseded";
  if (hints?.timeout) return "timeout";
  const msg = e instanceof Error ? e.message : String(e || "");
  const name = e instanceof Error ? e.name : "";
  if (name === "TimeoutError" || /timed out|timeout/i.test(msg)) return "timeout";
  if (/you cancelled|user (stop|cancel)|coding cancelled/i.test(msg)) return "user_stop";
  if (/supersed|replac(?:ed|e) this/i.test(msg)) return "superseded";
  if (name === "AbortError" || /signal is aborted|without reason/i.test(msg)) return "unknown";
  if (isAbortLikeMessage(msg)) return "unknown";
  return "unknown";
}

export function abortHonestyUserLine(
  e: unknown,
  hints?: { userStopped?: boolean; timeout?: boolean; superseded?: boolean },
): string {
  return ABORT_HONESTY_LINES[classifyAbortHonesty(e, hints)];
}

/** AbortController.abort() with a reason so Chrome does not say "without reason". */
export function abortWithTimeoutReason(ac: AbortController, message: string): void {
  try {
    if (typeof DOMException !== "undefined") {
      ac.abort(new DOMException(message, "TimeoutError"));
      return;
    }
  } catch {
    /* older abort() is 0-arg only */
  }
  try {
    ac.abort();
  } catch {
    /* ignore */
  }
}

export function abortWithUserStopReason(ac: AbortController): void {
  abortWithTimeoutReason(ac, ABORT_HONESTY_LINES.user_stop);
}
