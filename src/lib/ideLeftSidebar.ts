/** Left activity sidebar (Explorer / Source Control) — toggleable, not a center pane. */

export type IdeLeftSidebarView = 'explorer' | 'source-control';

export const NEBULA_OPEN_LEFT_SIDEBAR = 'nebula-open-left-sidebar';

export function dispatchOpenLeftSidebar(view: IdeLeftSidebarView): void {
  try {
    window.dispatchEvent(new CustomEvent(NEBULA_OPEN_LEFT_SIDEBAR, { detail: { view } }));
  } catch {
    /* ignore */
  }
}
