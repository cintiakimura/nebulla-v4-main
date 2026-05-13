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
