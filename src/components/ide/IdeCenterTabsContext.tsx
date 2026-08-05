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
  panelLabel,
  type CenterTab,
} from '../../lib/ideCenterTabs';
import type { UiStudioTab } from '../../lib/nebulaUiStudioEvents';
import { onRideCenterPaneOpened } from '../../lib/ideOnboardingRide';
import { useIdeWorkspace } from './IdeWorkspaceContext';
import { useLanguage } from '@/components/i18n/LanguageProvider';

function makeHomeTab(): CenterTab {
  return {
    id: panelTabId('projects'),
    kind: 'panel',
    pane: 'projects',
    label: panelLabel('projects'),
  };
}

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
  const { resolvedIdeLocale } = useLanguage();
  /** Default post-login view: My Projects (not empty editors / auto chat). */
  const [panelTabs, setPanelTabs] = useState<CenterTab[]>(() => [makeHomeTab()]);
  const [activeTabId, setActiveTabId] = useState<string | null>(() => makeHomeTab().id);
  const [uiStudioTab, setUiStudioTab] = useState<UiStudioTab>('design');

  // Refresh panel labels when IDE locale changes.
  useEffect(() => {
    setPanelTabs((prev) =>
      prev.map((tab) =>
        tab.pane ? { ...tab, label: panelLabel(tab.pane) } : tab,
      ),
    );
  }, [resolvedIdeLocale]);

  // Drop legacy full-screen Source Control / Search / DNS center tabs.
  useEffect(() => {
    const drop = new Set([panelTabId('source-control'), panelTabId('search'), panelTabId('dns')]);
    setPanelTabs((prev) => {
      const next = prev.filter(
        (t) => t.pane !== 'source-control' && t.pane !== 'search' && t.pane !== 'dns',
      );
      // If DNS was open, ensure Secrets is available.
      if (prev.some((t) => t.pane === 'dns') && !next.some((t) => t.pane === 'secrets')) {
        next.push({
          id: panelTabId('secrets'),
          kind: 'panel',
          pane: 'secrets',
          label: panelLabel('secrets'),
        });
      }
      return next;
    });
    setActiveTabId((id) => {
      if (id === panelTabId('dns')) return panelTabId('secrets');
      return id && drop.has(id) ? makeHomeTab().id : id;
    });
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
      // Search page removed — find/replace is the TopBar search icon only.
      if (pane === 'search') return;
      // DNS is not a side-nav page — open Secrets center pane; user picks DNS in the tab list.
      // Mind Map merges into Plan (Master Plan surface) — same SoT, toggle view.
      let targetPane: IdeCenterPane = pane === 'dns' ? 'secrets' : pane;
      if (targetPane === 'mind-map') {
        try {
          sessionStorage.setItem('nebula_plan_view', 'mind-map');
          window.dispatchEvent(new CustomEvent('nebula-plan-view', { detail: { view: 'mind-map' } }));
        } catch {
          /* ignore */
        }
        targetPane = 'master-plan';
      } else if (pane === 'master-plan') {
        try {
          sessionStorage.setItem('nebula_plan_view', 'plan');
          window.dispatchEvent(new CustomEvent('nebula-plan-view', { detail: { view: 'plan' } }));
        } catch {
          /* ignore */
        }
      }
      if (opts?.uiStudioTab) setUiStudioTab(opts.uiStudioTab);
      const id = panelTabId(targetPane);
      setPanelTabs((prev) => {
        if (prev.some((t) => t.id === id)) return prev;
        return [
          ...prev,
          { id, kind: 'panel', pane: targetPane, label: panelLabel(targetPane) },
        ];
      });
      setActiveTabId(id);
      onRideCenterPaneOpened(targetPane);
    },
    [],
  );

  const focusFile = useCallback(
    (path: string) => {
      const normalized = path.replace(/\\/g, '/');
      const id = fileTabId(normalized);
      // Opening a file makes Code the center primary (not My Projects).
      setActiveTabId(id);
      void openFile(normalized);
    },
    [openFile],
  );

  // If workspace activePath advances while Projects is still the selected center tab,
  // switch to the file tab so Code feels like the primary stage.
  useEffect(() => {
    if (!activePath) return;
    const fileId = fileTabId(activePath);
    if (!tabs.some((t) => t.path === activePath)) return;
    setActiveTabId((cur) => {
      if (cur === fileId) return cur;
      // Only auto-promote from Projects home — never steal Master Plan / UI Studio focus.
      if (cur === panelTabId('projects') || cur == null) return fileId;
      return cur;
    });
  }, [activePath, tabs]);

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
