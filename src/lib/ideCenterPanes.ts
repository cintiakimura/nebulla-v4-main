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

/** Six primary center tabs (workflow + Master Plan sections). Always visible. */
export const IDE_CENTER_PRIMARY_TABS: { id: IdeCenterPane; label: string }[] = [
  { id: 'code', label: 'Code' },
  { id: 'preview', label: 'App preview' },
  { id: 'master-plan', label: 'Master Plan' },
  { id: 'mind-map', label: 'Mind map' },
  { id: 'ui-studio', label: 'UI Studio' },
  { id: 'source-control', label: 'Git' },
];

/** Open from the left nav only — not duplicated in the six-tab bar. */
export const IDE_CENTER_NAV_ONLY_PANES: IdeCenterPane[] = ['projects', 'secrets', 'dns', 'search'];

const NAV_ONLY_LABELS: Record<(typeof IDE_CENTER_NAV_ONLY_PANES)[number], string> = {
  projects: 'Projects',
  secrets: 'Secrets',
  dns: 'DNS',
  search: 'Search',
};

export const IDE_CENTER_PANE_TABS: { id: IdeCenterPane; label: string }[] = [
  ...IDE_CENTER_PRIMARY_TABS,
  ...IDE_CENTER_NAV_ONLY_PANES.map((id) => ({ id, label: NAV_ONLY_LABELS[id] })),
];

export function isPrimaryCenterPane(pane: IdeCenterPane): boolean {
  return IDE_CENTER_PRIMARY_TABS.some((t) => t.id === pane);
}

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
