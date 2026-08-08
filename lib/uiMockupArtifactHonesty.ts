/**
 * Artifact honesty for UI Studio Beta mockups (recovery Phase 7.4).
 * Shared by client gate + server status.
 */

export type StudioPreviewLike = {
  pages?: Record<string, unknown> | null;
} | null | undefined;

/** True when the Studio canvas can show a real generated model (not Waiting / IDE shell). */
export function isLoadableStudioModel(model: StudioPreviewLike): boolean {
  if (!model || typeof model !== "object") return false;
  const pages = model.pages;
  if (!pages || typeof pages !== "object") return false;
  if (Object.keys(pages).length === 0) return false;
  const text = JSON.stringify(model);
  if (/Waiting for UI generation/i.test(text)) return false;
  if (/Nebulla Workspace|Cosmic Night|0vgenerated-v2|inspired by 0vgenerated|Open Explorer/i.test(text)) {
    return false;
  }
  // Hex pair alone is not enough — real app palettes may use dark + teal/cyan.
  // Only reject when Cosmic Night IDE chrome strings are also present.
  if (
    /#080A14/i.test(text) &&
    /#00D4D4/i.test(text) &&
    /Nebulla|Cosmic Night|Workspace|Open Explorer/i.test(text)
  ) {
    return false;
  }
  return true;
}
