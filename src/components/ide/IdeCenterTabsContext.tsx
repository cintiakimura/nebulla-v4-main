import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  centerPaneToNavId,
  type IdeCenterPane,
} from '../../lib/ideCenterPanes';
import {
  fileTabId,
  fileTabLabel,
  panelTabId,
  PANEL_LABELS,
  type CenterTab,
} from '../../lib/ideCenterTabs';
import type { UiStudioTab } from '../../lib/nebulaUiStudioEvents';
import { useIdeWorkspace } from './IdeWorkspaceContext';

const DEFAULT_HOME_TAB: CenterTab = {
  id: panelTabId('projects'),
  kind: 'panel',
  pane: 'projects',
  label: PANEL_LABELS.projects,
};

type IdeCenterTabsValue = {
  openTabs: CenterTab[];
  activeTabId: string | null;
  activeTab: CenterTab | null;
  uiStudioTab: UiStudioTab;
  setUiStudioTab: (tab: UiStudioTab) => void;
  openPanel: (pane: IdeCenterPane, opts?: { uiStudioTab?: UiStudioTab }) => void;
  focusFile: (path: string) => void;
  activateTab: (tabId: string) => void;
  closeTab: (tabId: string) => void;
  activeNavId: string;
};

const IdeCenterTabsContext = createContext<IdeCenterTabsValue | null>(null);

export function useIdeCenterTabs(): IdeCenterTabsValue {
  const ctx = useContext(IdeCenterTabsContext);
  if (!ctx) throw new Error('useIdeCenterTabs must be used within IdeCenterTabsProvider');
  return ctx;
}

export function IdeCenterTabsProvider({ children }: { children: ReactNode }) {
  const { tabs, activePath, setActivePath, openFile, closeTab: closeFileTab } = useIdeWorkspace();
  /** Default post-login view: My Projects (not empty editors / auto chat). */
  const [panelTabs, setPanelTabs] = useState<CenterTab[]>(() => [DEFAULT_HOME_TAB]);
  const [activeTabId, setActiveTabId] = useState<string | null>(() => DEFAULT_HOME_TAB.id);
  const [uiStudioTab, setUiStudioTab] = useState<UiStudioTab>('design');

  // Drop legacy full-screen Source Control center tabs (moved to left sidebar).
  useEffect(() => {
    const scId = panelTabId('source-control');
    setPanelTabs((prev) => prev.filter((t) => t.pane !== 'source-control'));
    setActiveTabId((id) => (id === scId ? DEFAULT_HOME_TAB.id : id));
  }, []);

  const fileCenterTabs = useMemo<CenterTab[]>(() => {
    const seen = new Set<string>();
    const out: CenterTab[] = [];
    for (const t of tabs) {
      const id = fileTabId(t.path);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        id,
        kind: 'file' as const,
        label: fileTabLabel(t.path),
        path: t.path,
      });
    }
    return out;
  }, [tabs]);

  const openTabs = useMemo(() => [...panelTabs, ...fileCenterTabs], [panelTabs, fileCenterTabs]);

  const activeTab = useMemo(
    () => openTabs.find((t) => t.id === activeTabId) ?? null,
    [openTabs, activeTabId],
  );

  const activeNavId = useMemo(() => {
    if (activeTab?.kind === 'panel' && activeTab.pane) {
      return centerPaneToNavId(activeTab.pane);
    }
    return 'explorer';
  }, [activeTab]);

  const openPanel = useCallback(
    (pane: IdeCenterPane, opts?: { uiStudioTab?: UiStudioTab }) => {
      if (pane === 'code') return;
      // Source Control is a collapsible left sidebar (like Explorer), not a center pane.
      if (pane === 'source-control') {
        try {
          window.dispatchEvent(
            new CustomEvent('nebula-open-left-sidebar', { detail: { view: 'source-control' } }),
          );
        } catch {
          /* ignore */
        }
        return;
      }
      if (opts?.uiStudioTab) setUiStudioTab(opts.uiStudioTab);
      const id = panelTabId(pane);
      setPanelTabs((prev) => {
        if (prev.some((t) => t.id === id)) return prev;
        return [...prev, { id, kind: 'panel', pane, label: PANEL_LABELS[pane] ?? pane }];
      });
      setActiveTabId(id);
    },
    [],
  );

  const focusFile = useCallback(
    (path: string) => {
      const normalized = path.replace(/\\/g, '/');
      const id = fileTabId(normalized);
      setActiveTabId(id);
      void openFile(normalized);
    },
    [openFile],
  );

  const activateTab = useCallback(
    (tabId: string) => {
      setActiveTabId(tabId);
      const tab = openTabs.find((t) => t.id === tabId);
      if (tab?.kind === 'file' && tab.path) {
        setActivePath(tab.path);
      }
    },
    [openTabs, setActivePath],
  );

  const closeTab = useCallback(
    (tabId: string) => {
      const tab = openTabs.find((t) => t.id === tabId);
      if (!tab) return;

      if (tab.kind === 'file' && tab.path) {
        if (!closeFileTab(tab.path)) return;
        setActiveTabId((cur) => {
          if (cur !== tabId) return cur;
          const remainingPanels = panelTabs;
          const remainingFiles = tabs.filter((t) => t.path !== tab.path);
          if (remainingFiles.length > 0) {
            return fileTabId(remainingFiles[remainingFiles.length - 1].path);
          }
          return remainingPanels[remainingPanels.length - 1]?.id ?? null;
        });
        return;
      }

      setPanelTabs((prev) => prev.filter((t) => t.id !== tabId));
      setActiveTabId((cur) => {
        if (cur !== tabId) return cur;
        const remainingPanels = panelTabs.filter((t) => t.id !== tabId);
        if (remainingPanels.length > 0) {
          return remainingPanels[remainingPanels.length - 1].id;
        }
        if (tabs.length > 0) {
          const pick = tabs[tabs.length - 1];
          setActivePath(pick.path);
          return fileTabId(pick.path);
        }
        return null;
      });
    },
    [openTabs, panelTabs, tabs, closeFileTab, setActivePath],
  );

  useEffect(() => {
    const onFocusFile = (ev: Event) => {
      const path = (ev as CustomEvent<{ path?: string }>).detail?.path;
      if (path) focusFile(path);
    };
    const onOpenPanel = (ev: Event) => {
      const detail = (ev as CustomEvent<{ pane?: IdeCenterPane; tab?: UiStudioTab }>).detail;
      if (detail?.pane) openPanel(detail.pane, { uiStudioTab: detail.tab });
    };
    const onPreview = () => openPanel('preview');
    const onMasterPlan = () => openPanel('master-plan');
    const onMindMap = () => openPanel('mind-map');
    const onFilesApplied = () => openPanel('preview');
    const onUiStudio = (ev: Event) => {
      const tab = (ev as CustomEvent<{ tab?: UiStudioTab }>).detail?.tab;
      openPanel('ui-studio', { uiStudioTab: tab ?? 'design' });
    };

    window.addEventListener('nebula-center-focus-file', onFocusFile);
    window.addEventListener('nebula-center-open-panel', onOpenPanel);
    window.addEventListener('nebula-open-app-preview', onPreview);
    window.addEventListener('nebula-open-master-plan', onMasterPlan);
    window.addEventListener('nebula-open-mind-map', onMindMap);
    window.addEventListener('nebula-files-applied', onFilesApplied);
    window.addEventListener('nebula-open-ui-studio', onUiStudio);
    return () => {
      window.removeEventListener('nebula-center-focus-file', onFocusFile);
      window.removeEventListener('nebula-center-open-panel', onOpenPanel);
      window.removeEventListener('nebula-open-app-preview', onPreview);
      window.removeEventListener('nebula-open-master-plan', onMasterPlan);
      window.removeEventListener('nebula-open-mind-map', onMindMap);
      window.removeEventListener('nebula-files-applied', onFilesApplied);
      window.removeEventListener('nebula-open-ui-studio', onUiStudio);
    };
  }, [focusFile, openPanel]);

  const value = useMemo(
    () => ({
      openTabs,
      activeTabId,
      activeTab,
      uiStudioTab,
      setUiStudioTab,
      openPanel,
      focusFile,
      activateTab,
      closeTab,
      activeNavId,
    }),
    [
      openTabs,
      activeTabId,
      activeTab,
      uiStudioTab,
      openPanel,
      focusFile,
      activateTab,
      closeTab,
      activeNavId,
    ],
  );

  return <IdeCenterTabsContext.Provider value={value}>{children}</IdeCenterTabsContext.Provider>;
}

/** Open a side-panel view in the center tab strip (from nav, chat, etc.). */
export function dispatchOpenCenterPanel(
  pane: IdeCenterPane,
  opts?: { uiStudioTab?: UiStudioTab },
): void {
  window.dispatchEvent(
    new CustomEvent('nebula-center-open-panel', { detail: { pane, tab: opts?.uiStudioTab } }),
  );
}
