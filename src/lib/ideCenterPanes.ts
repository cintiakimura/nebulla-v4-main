/** Center workspace views — always toggled from the tab bar beside Code / App preview. */
export type IdeCenterPane =
  | 'code'
  | 'preview'
  | 'master-plan'
  | 'mind-map'
  | 'ui-studio'
  | 'source-control'
  | 'projects'
  | 'secrets'
  | 'dns'
  | 'search';

export const IDE_CENTER_PANE_TABS: { id: IdeCenterPane; label: string }[] = [
  { id: 'code', label: 'Code' },
  { id: 'preview', label: 'App preview' },
  { id: 'master-plan', label: 'Master Plan' },
  { id: 'mind-map', label: 'Mind map' },
  { id: 'ui-studio', label: 'UI Studio' },
  { id: 'source-control', label: 'Git' },
  { id: 'projects', label: 'Projects' },
  { id: 'secrets', label: 'Secrets' },
  { id: 'dns', label: 'DNS' },
  { id: 'search', label: 'Search' },
];

const CENTER_PANE_LS = 'nebulla_ide_center_pane_v2';

export function readStoredCenterPane(): IdeCenterPane {
  try {
    const raw = localStorage.getItem(CENTER_PANE_LS);
    if (raw && IDE_CENTER_PANE_TABS.some((t) => t.id === raw)) return raw as IdeCenterPane;
  } catch {
    /* ignore */
  }
  return 'code';
}

export function storeCenterPane(pane: IdeCenterPane): void {
  try {
    localStorage.setItem(CENTER_PANE_LS, pane);
  } catch {
    /* ignore */
  }
}

export function navIdToCenterPane(navId: string): IdeCenterPane {
  if (navId === 'explorer') return 'code';
  if (navId === 'visual-ui-editor') return 'ui-studio';
  if (IDE_CENTER_PANE_TABS.some((t) => t.id === navId)) return navId as IdeCenterPane;
  return 'code';
}

export function centerPaneToNavId(pane: IdeCenterPane): string {
  if (pane === 'code') return 'explorer';
  if (pane === 'ui-studio') return 'visual-ui-editor';
  return pane;
}
