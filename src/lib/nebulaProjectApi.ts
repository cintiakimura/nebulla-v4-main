/** Active browser project key for API calls (cloud workspace on server). */
let currentProjectKey = "default";

/** DB project name (must match `nebula_projects.name` when logged in) for per-project disk / Render workspace. */
let currentProjectName = "";

export function setBrowserProjectKey(key: string): void {
  const cleaned = String(key || "default")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 64);
  currentProjectKey = cleaned || "default";
}

export function getBrowserProjectKey(): string {
  return currentProjectKey;
}

export function setBrowserProjectName(name: string): void {
  currentProjectName = String(name || "").trim();
}

export function getBrowserProjectName(): string {
  return currentProjectName;
}

function projectQueryParams(): string {
  const parts = [`projectKey=${encodeURIComponent(currentProjectKey)}`];
  if (currentProjectName) {
    parts.push(`projectName=${encodeURIComponent(currentProjectName)}`);
  }
  return parts.join("&");
}

/** Append `projectKey` (and `projectName` when set) for GET requests. */
export function withProjectQuery(url: string): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}${projectQueryParams()}`;
}

export function withProjectBody<T extends Record<string, unknown>>(body: T): T & { projectKey: string } & { projectName?: string } {
  const out = { ...body, projectKey: currentProjectKey } as T & { projectKey: string } & { projectName?: string };
  if (currentProjectName) {
    out.projectName = currentProjectName;
  }
  return out;
}
