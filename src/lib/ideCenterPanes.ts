/** Center workspace views — always toggled from the tab bar beside Code / App preview. */
export type IdeCenterPane =
  | 'code'
  | 'preview'
  | 'master-plan'
  | 'mind-map'
  | 'ui-studio'
  | 'ui-studio-beta'
  | 'source-control'
  | 'projects'
  | 'secrets'
  | 'dns'
  | 'search'; // legacy pane id — redirected away; find/replace lives in TopBar icon only

/** Primary center tabs (workflow + Master Plan). Source Control lives in the left sidebar. */
export const IDE_CENTER_PRIMARY_TABS: { id: IdeCenterPane; label: string }[] = [
  { id: 'code', label: 'Code' },
  { id: 'preview', label: 'App preview' },
  { id: 'master-plan', label: 'Master Plan' },
  { id: 'mind-map', label: 'Mind map' },
  { id: 'ui-studio', label: 'UI Studio' },
  { id: 'ui-studio-beta', label: 'UI Studio Beta' },
];

/** Open from the left nav only. DNS is a tab inside Secrets dashboard, not a side-nav page. */
export const IDE_CENTER_NAV_ONLY_PANES: IdeCenterPane[] = ['projects', 'secrets'];

const NAV_ONLY_LABELS: Record<(typeof IDE_CENTER_NAV_ONLY_PANES)[number], string> = {
  projects: 'My Projects',
  secrets: 'Secrets',
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
    // Source Control is a left sidebar now — never restore it as a full center takeover.
    if (raw === 'source-control') return 'projects';
    // Search page removed — find/replace is the TopBar search icon only.
    if (raw === 'search') return 'projects';
    // DNS page disabled — content lives under Secrets.
    if (raw === 'dns') return 'secrets';
    if (raw && IDE_CENTER_PANE_TABS.some((t) => t.id === raw)) return raw as IdeCenterPane;
  } catch {
    /* ignore */
  }
  return 'projects';
}

export function storeCenterPane(pane: IdeCenterPane): void {
  try {
    localStorage.setItem(CENTER_PANE_LS, pane);
  } catch {
    /* ignore */
  }
}

export function navIdToCenterPane(navId: string): IdeCenterPane {
  if (navId === 'explorer' || navId === 'source-control') return 'code';
  if (navId === 'visual-ui-editor') return 'ui-studio';
  if (navId === 'dns') return 'secrets';
  if (IDE_CENTER_PANE_TABS.some((t) => t.id === navId)) return navId as IdeCenterPane;
  return 'code';
}

export function centerPaneToNavId(pane: IdeCenterPane): string {
  if (pane === 'code') return 'explorer';
  if (pane === 'ui-studio') return 'visual-ui-editor';
  return pane;
}
