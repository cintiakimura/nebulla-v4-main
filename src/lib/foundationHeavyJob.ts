/**
 * Phase 5: one heavy Grok job at a time per project turn (client lock).
 * Server also refuses UI Gen while go-code-pending is preparing/running.
 */

const foundationGoKeys = new Set<string>();

function keyOf(projectName?: string): string {
  return (projectName || "").trim() || "default";
}

export function markFoundationGoInFlight(projectName: string, on: boolean): void {
  const key = keyOf(projectName);
  if (on) foundationGoKeys.add(key);
  else foundationGoKeys.delete(key);
}

export function isFoundationGoInFlight(projectName?: string): boolean {
  if (projectName != null && projectName !== "") {
    return foundationGoKeys.has(keyOf(projectName));
  }
  return foundationGoKeys.size > 0;
}
