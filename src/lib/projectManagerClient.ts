/**
 * Silent control-plane hook: Render workspace backfill, encrypted Grok override sync, usage snapshot.
 * Never throws to callers — failures stay in network console only.
 */
export async function fireSilentProjectManager(opts: {
  projectName?: string;
  grokApiKey?: string;
  syncAllProjects?: boolean;
}): Promise<void> {
  try {
    await fetch("/api/control-plane/project-manager/run", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectName: opts.projectName?.trim() || undefined,
        grokApiKey: opts.grokApiKey?.trim() || undefined,
        syncAllProjects: Boolean(opts.syncAllProjects),
      }),
    });
  } catch {
    /* silent */
  }
}
