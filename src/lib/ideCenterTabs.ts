import type { IdeCenterPane } from './ideCenterPanes';

export type CenterTabKind = 'file' | 'panel';

export type CenterTab = {
  id: string;
  kind: CenterTabKind;
  label: string;
  path?: string;
  pane?: IdeCenterPane;
};

export const PANEL_LABELS: Record<IdeCenterPane, string> = {
  code: 'Code',
  preview: 'App Preview',
  'master-plan': 'Master Plan',
  'mind-map': 'Mind map',
  'ui-studio': 'UI Studio',
  'source-control': 'Git',
  projects: 'Projects',
  secrets: 'Secrets',
  dns: 'DNS',
  search: 'Search',
};

export function fileTabId(path: string): string {
  return `file:${path.replace(/\\/g, '/')}`;
}

export function panelTabId(pane: IdeCenterPane): string {
  return `panel:${pane}`;
}

export function fileTabLabel(path: string): string {
  const p = path.replace(/\\/g, '/');
  return p.split('/').pop() || p;
}

import { withProjectQuery } from './nebulaProjectApi';

/** Full URL for opening live app preview in the system browser. */
export function getAppPreviewBrowserUrl(rev = Date.now()): string {
  const base = withProjectQuery('/api/app-preview/bootstrap');
  const sep = base.includes('?') ? '&' : '?';
  const path = `${base}${sep}_rev=${rev}`;
  if (typeof window !== 'undefined') {
    return `${window.location.origin}${path}`;
  }
  return path;
}
