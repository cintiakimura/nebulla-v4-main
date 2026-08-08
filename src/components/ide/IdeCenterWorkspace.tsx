import type { Node as FlowNode } from '@xyflow/react';
import {
  BookMarked,
  Circle,
  ExternalLink,
  KeyRound,
  LayoutGrid,
  Loader2,
  MonitorPlay,
  Network,
  Palette,
  Shield,
  X,
} from 'lucide-react';
import { lazy, Suspense } from 'react';
import { cn } from '@/lib/utils';
import { AppPreviewPanel } from '../AppPreviewPanel';
import { dispatchOpenLeftSidebar } from '../../lib/ideLeftSidebar';
import { IdeDashboardEmbed } from './IdeDashboardEmbed';
import { MyProjectsHome } from './MyProjectsHome';
import { IdeUiStudioBeta } from './IdeUiStudioBeta';
import { IdePlanPage } from './IdePlanPage';
import { IdeSecurityScan } from './IdeSecurityScan';
import { useIdeCenterTabs } from './IdeCenterTabsContext';
import { useIdeWorkspace } from './IdeWorkspaceContext';
import type { IdeCenterPane } from '../../lib/ideCenterPanes';
import { getAppPreviewBrowserUrl, panelTabId } from '../../lib/ideCenterTabs';
import { getBrowserProjectKey, getBrowserProjectName } from '../../lib/nebulaProjectApi';

/** Route-level lazy: keep Monaco off My Projects / Plan first paint. */
const IdeFileEditor = lazy(() =>
  import('./IdeFileEditor').then((m) => ({ default: m.IdeFileEditor })),
);

const PANEL_ICONS: Partial<Record<IdeCenterPane, React.ReactNode>> = {
  preview: <MonitorPlay className="h-3 w-3 shrink-0 opacity-70" aria-hidden />,
  'master-plan': <BookMarked className="h-3 w-3 shrink-0 opacity-70" aria-hidden />,
  'mind-map': <Network className="h-3 w-3 shrink-0 opacity-70" aria-hidden />,
  'ui-studio': <Palette className="h-3 w-3 shrink-0 opacity-70" aria-hidden />,
  'ui-studio-beta': <Palette className="h-3 w-3 shrink-0 opacity-70" aria-hidden />,
  projects: <LayoutGrid className="h-3 w-3 shrink-0 opacity-70" aria-hidden />,
  secrets: <KeyRound className="h-3 w-3 shrink-0 opacity-70" aria-hidden />,
  security: <Shield className="h-3 w-3 shrink-0 opacity-70" aria-hidden />,
};

export function IdeCenterWorkspace() {
  const {
    openTabs,
    activeTabId,
    activeTab,
    activateTab,
    closeTab,
  } = useIdeCenterTabs();
  const { tabs: fileTabs, activePath } = useIdeWorkspace();

  const projectName = getBrowserProjectName().trim() || 'Untitled project';
  const projectKey = getBrowserProjectKey();

  const previewPages: FlowNode[] = [
    {
      id: 'preview-root',
      type: 'pageNode',
      position: { x: 0, y: 0 },
      data: { label: projectName },
    },
  ];

  const activePane = activeTab?.kind === 'panel' ? activeTab.pane : null;
  const showFileEditor = activeTab?.kind === 'file';
  const dirtyByPath = new Map(fileTabs.map((t) => [t.path, t.dirty]));
  const loadingByPath = new Map(fileTabs.map((t) => [t.path, t.loading]));

  const openInBrowser = () => {
    window.open(getAppPreviewBrowserUrl(), '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-transparent">
      {openTabs.length > 0 ? (
        <div className="surface-active flex h-9 shrink-0 items-stretch overflow-hidden border-b border-border">
          <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto border-l border-border">
            {openTabs.map((tab) => {
              const active = tab.id === activeTabId;
              const isFile = tab.kind === 'file';
              const dirty = isFile && tab.path ? dirtyByPath.get(tab.path) : false;
              const loading = isFile && tab.path ? loadingByPath.get(tab.path) : false;
              return (
                <div
                  key={tab.id}
                  className={cn(
                    'group flex h-9 max-w-[220px] shrink-0 items-center gap-1 border-r border-border px-2.5',
                    active
                      ? 'bg-background text-foreground shadow-[inset_0_2px_0_0_var(--primary)]'
                      : 'bg-black text-muted-foreground hover:bg-[#111111] hover:text-foreground',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => activateTab(tab.id)}
                    className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-left text-xs font-normal"
                    title={isFile ? tab.path : tab.label}
                  >
                    {!isFile ? PANEL_ICONS[tab.pane!] : null}
                    {dirty ? <Circle className="h-1.5 w-1.5 shrink-0 fill-primary text-primary" /> : null}
                    {loading ? (
                      <Loader2 className="h-3 w-3 shrink-0 animate-spin opacity-70" />
                    ) : null}
                    <span className="truncate">{tab.label}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Close ${tab.label}`}
                    onClick={() => closeTab(tab.id)}
                    className="rounded p-0.5 opacity-0 transition-opacity hover:bg-[#111111] group-hover:opacity-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>
          {activePane === 'preview' ? (
            <button
              type="button"
              onClick={openInBrowser}
              title="Open app preview in your browser"
              className="btn-secondary-surface type-label-sm mr-2 flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Open in Browser</span>
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {openTabs.length === 0 && !activePath ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
            <p className="font-headline text-sm text-foreground">No editors open</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Open a file from the explorer, or pick Plan, App preview, or UI Studio from the side bar.
            </p>
          </div>
        ) : (
          <>
            {/* Mount Code editor only when file tabs exist — avoids Monaco on Projects-only home. */}
            {fileTabs.length > 0 || showFileEditor ? (
              <PaneLayer visible={showFileEditor}>
                <Suspense
                  fallback={
                    <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span className="type-label-sm">Loading editor…</span>
                    </div>
                  }
                >
                  <IdeFileEditor active={showFileEditor} />
                </Suspense>
              </PaneLayer>
            ) : null}
            <PaneLayer visible={activePane === 'preview'}>
              <AppPreviewPanel
                pages={previewPages}
                onOpenSourceControl={() => dispatchOpenLeftSidebar('source-control')}
                defaultPanelOpen
                embeddedInDock
                hideChrome
              />
            </PaneLayer>
            {/* Unmount Plan/Mind Map when hidden — React Flow otherwise paints over App Preview / Studio. */}
            <PaneLayer visible={activePane === 'master-plan' || activePane === 'mind-map'}>
              {activePane === 'master-plan' || activePane === 'mind-map' ? (
                <IdePlanPage onClose={() => closeTab(panelTabId('master-plan'))} />
              ) : null}
            </PaneLayer>
            {/* Legacy v0 Studio disabled — any stale ui-studio pane renders Beta. */}
            <PaneLayer visible={activePane === 'ui-studio' || activePane === 'ui-studio-beta'}>
              {activePane === 'ui-studio' || activePane === 'ui-studio-beta' ? (
                <IdeUiStudioBeta
                  onLock={() => activeTabId && closeTab(activeTabId)}
                  projectDisplayName={projectName}
                />
              ) : null}
            </PaneLayer>
            <PaneLayer visible={activePane === 'projects'}>
              <MyProjectsHome />
            </PaneLayer>
            <PaneLayer visible={activePane === 'secrets'}>
              <IdeDashboardEmbed initialTab="secrets" />
            </PaneLayer>
            <PaneLayer visible={activePane === 'security'}>
              <IdeSecurityScan />
            </PaneLayer>
          </>
        )}
      </div>
    </div>
  );
}

function PaneLayer({ visible, children }: { visible: boolean; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'absolute inset-0 flex flex-col overflow-hidden',
        visible ? 'z-10' : 'pointer-events-none invisible z-0',
      )}
      aria-hidden={!visible}
    >
      {children}
    </div>
  );
}
