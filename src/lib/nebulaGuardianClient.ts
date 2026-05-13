/**
 * Silent client-side reporter for Nebula Guardian (no UI).
 * Only runs when VITE_GUARDIAN_REPORT_KEY matches server GUARDIAN_REPORT_KEY.
 */

export function installNebulaGuardianClient(): void {
  const key = import.meta.env.VITE_GUARDIAN_REPORT_KEY as string | undefined;
  if (typeof key !== "string" || key.length < 8) return;

  const send = (message: string, stack?: string) => {
    void fetch("/api/guardian/report", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Guardian-Key": key,
      },
      body: JSON.stringify({
        message,
        stack,
        url: typeof window !== "undefined" ? window.location.href : "",
      }),
    }).catch(() => {
      /* never surface to users */
    });
  };

  window.addEventListener("error", (e) => {
    const err = e.error;
    const stack = err instanceof Error ? err.stack : undefined;
    send(e.message || "Error", stack);
  });

  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    if (r instanceof Error) {
      send(r.message, r.stack);
    } else {
      send(String(r));
    }
  });
}
