/** Match `IdeWorkspaceContext` / server caps for swarm handoff snippets. */
export const IDE_SWARM_FOCUS_SNIPPET_MAX = 12_000;

export type IdeSwarmFocusPayload = {
  focusPaths?: string[];
  focusSnippets?: Record<string, string>;
};

/**
 * Same rules as the IDE workspace `useEffect` that sets `window.nebulaSwarmFocus*`
 * so Grok chat, Run and Test, and any server handoff see one consistent scope.
 */
export function buildIdeSwarmFocusFromEditor(
  activePath: string | null,
  content: string,
  loading: boolean,
): IdeSwarmFocusPayload {
  const out: IdeSwarmFocusPayload = {};
  if (activePath) {
    out.focusPaths = [activePath];
  }
  if (activePath && !loading) {
    const slice =
      content.length > IDE_SWARM_FOCUS_SNIPPET_MAX
        ? `${content.slice(0, IDE_SWARM_FOCUS_SNIPPET_MAX)}\n\n… [truncated]`
        : content;
    out.focusSnippets = { [activePath]: slice };
  }
  return out;
}

/** Keep legacy `window` hooks in sync (TopBar reads them too). */
export function syncWindowSwarmFocusFromPayload(payload: IdeSwarmFocusPayload): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as {
    nebulaSwarmFocusPaths?: string[];
    nebulaSwarmFocusSnippets?: Record<string, string>;
  };
  if (payload.focusPaths?.length) {
    w.nebulaSwarmFocusPaths = payload.focusPaths;
  } else {
    delete w.nebulaSwarmFocusPaths;
  }
  if (payload.focusSnippets && Object.keys(payload.focusSnippets).length > 0) {
    w.nebulaSwarmFocusSnippets = payload.focusSnippets;
  } else {
    delete w.nebulaSwarmFocusSnippets;
  }
}
