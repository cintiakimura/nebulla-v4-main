import type { Request } from "express";

/** Safe segment for on-disk cloud project folders (Render / server). */
export function sanitizeProjectKey(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  const cleaned = s.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  return cleaned || "default";
}

export function getProjectKeyFromRequest(req: Request): string {
  const h = req.headers["x-nebula-project-key"];
  const fromHeader = typeof h === "string" ? h.trim() : "";
  const q = req.query?.projectKey;
  const fromQuery = typeof q === "string" ? q.trim() : "";
  const b = (req.body as { projectKey?: unknown } | undefined)?.projectKey;
  const fromBody = typeof b === "string" ? b.trim() : "";
  return sanitizeProjectKey(fromHeader || fromQuery || fromBody || "default");
}

/**
 * Chip / `projectName` is a label only. Disk + preview always follow the request
 * workspace key when the client sent one (including after rename to LoafLocal).
 */
export function resolveWorkspaceKeyPreferringRequest(opts: {
  projectKey?: string;
  projectName?: string;
  ownedWorkspaceIdForName?: string | null;
  latestOwnedWorkspaceId?: string | null;
}): string {
  const requested = sanitizeProjectKey(opts.projectKey || "");
  if (requested && requested !== "default") return requested;
  const byName = sanitizeProjectKey(opts.ownedWorkspaceIdForName || "");
  if (byName && byName !== "default") return byName;
  const latest = sanitizeProjectKey(opts.latestOwnedWorkspaceId || "");
  if (latest && latest !== "default") return latest;
  return requested || "default";
}
