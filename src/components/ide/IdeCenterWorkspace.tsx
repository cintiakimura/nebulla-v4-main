import { useCallback, useEffect } from 'react';
import type { Node as FlowNode } from '@xyflow/react';
import {
  BookMarked,
  Code2,
  GitBranch,
  Globe,
  KeyRound,
  LayoutGrid,
  MonitorPlay,
  Network,
  Palette,
  Search,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AppPreviewPanel } from '../AppPreviewPanel';
import { MasterPlan } from '../MasterPlan';
import { SourceControlPanel } from '../SourceControlPanel';
import { IdeDashboardEmbed } from './IdeDashboardEmbed';
import { IdeVisualEditor } from './IdeVisualEditor';
import { UiStudioMockupPanel } from './UiStudioMockupPanel';
import { MindMapIdeRoute } from './MindMapIdeRoute';
import { CodeEditor } from './CodeEditor';
import {
  IDE_CENTER_PANE_TABS,
  type IdeCenterPane,
  readStoredCenterPane,
  storeCenterPane,
} from '../../lib/ideCenterPanes';
import { getBrowserProjectKey, getBrowserProjectName } from '../../lib/nebulaProjectApi';
import type { UiStudioTab } from '../../lib/nebulaUiStudioEvents';

const PANE_ICONS: Partial<Record<IdeCenterPane, React.ReactNode>> = {
  code: <Code2 className="h-3.5 w-3.5 shrink-0" aria-hidden />,
  preview: <MonitorPlay className="h-3.5 w-3.5 shrink-0" aria-hidden />,
  'master-plan': <BookMarked className="h-3.5 w-3.5 shrink-0" aria-hidden />,
  'mind-map': <Network className="h-3.5 w-3.5 shrink-0" aria-hidden />,
  'ui-studio': <Palette className="h-3.5 w-3.5 shrink-0" aria-hidden />,
  'source-control': <GitBranch className="h-3.5 w-3.5 shrink-0" aria-hidden />,
  projects: <LayoutGrid className="h-3.5 w-3.5 shrink-0" aria-hidden />,
  secrets: <KeyRound className="h-3.5 w-3.5 shrink-0" aria-hidden />,
  dns: <Globe className="h-3.5 w-3.5 shrink-0" aria-hidden />,
  search: <Search className="h-3.5 w-3.5 shrink-0" aria-hidden />,
};

export function IdeCenterWorkspace({
  activePane,
  onSelectPane,
  uiStudioTab,
  onUiStudioTabChange,
}: {
  activePane: IdeCenterPane;
  onSelectPane: (pane: IdeCenterPane) => void;
  uiStudioTab: UiStudioTab;
  onUiStudioTabChange: (tab: UiStudioTab) => void;
}) {
  const selectPane = useCallback(
    (next: IdeCenterPane) => {
      storeCenterPane(next);
      onSelectPane(next);
    },
    [onSelectPane],
  );

  useEffect(() => {
    const onPreview = () => selectPane('preview');
    const onFilesApplied = () => selectPane('preview');
    const onMasterPlan = () => selectPane('master-plan');
    const onUiStudio = (ev: Event) => {
      const tab = (ev as CustomEvent<{ tab?: UiStudioTab }>).detail?.tab;
      if (tab) onUiStudioTabChange(tab);
      selectPane('ui-studio');
    };
    window.addEventListener('nebula-open-app-preview', onPreview);
    window.addEventListener('nebula-files-applied', onFilesApplied);
    window.addEventListener('nebula-open-master-plan', onMasterPlan);
    window.addEventListener('nebula-open-ui-studio', onUiStudio);
    return () => {
      window.removeEventListener('nebula-open-app-preview', onPreview);
      window.removeEventListener('nebula-files-applied', onFilesApplied);
      window.removeEventListener('nebula-open-master-plan', onMasterPlan);
      window.removeEventListener('nebula-open-ui-studio', onUiStudio);
    };
  }, [selectPane, onUiStudioTabChange]);

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

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="surface-active tonal-seam-b flex h-9 shrink-0 items-center gap-0.5 overflow-x-auto px-1.5">
        {IDE_CENTER_PANE_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => selectPane(tab.id)}
            className={cn(
              'type-label-sm flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 transition-colors',
              activePane === tab.id
                ? 'active-tab-sheen text-primary'
                : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
            )}
          >
            {PANE_ICONS[tab.id]}
            {tab.label}
          </button>
        ))}
      </div>

      {activePane === 'ui-studio' ? (
        <div className="tonal-seam-b flex shrink-0 gap-1 border-b border-white/5 px-2 py-1">
          {(['design', 'mockups', 'preview'] as const).map((sub) => (
            <button
              key={sub}
              type="button"
              onClick={() => onUiStudioTabChange(sub)}
              className={cn(
                'type-label-sm rounded-md px-2.5 py-1 capitalize transition-colors',
                uiStudioTab === sub
                  ? 'bg-secondary text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {sub === 'design' ? 'Visual editor' : sub}
            </button>
          ))}
        </div>
      ) : null}

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <PaneLayer visible={activePane === 'code'}>
          <CodeEditor hidePreviewButton />
        </PaneLayer>
        <PaneLayer visible={activePane === 'preview'}>
          <AppPreviewPanel
            pages={previewPages}
            onOpenSourceControl={() => selectPane('source-control')}
            defaultPanelOpen
            embeddedInDock
          />
        </PaneLayer>
        <PaneLayer visible={activePane === 'master-plan'}>
          <MasterPlan projectKey={projectKey} onClose={() => selectPane('code')} />
        </PaneLayer>
        <PaneLayer visible={activePane === 'mind-map'}>
          <MindMapIdeRoute />
        </PaneLayer>
        <PaneLayer visible={activePane === 'ui-studio'}>
          {uiStudioTab === 'design' ? (
            <IdeVisualEditor onLock={() => selectPane('code')} projectDisplayName={projectName} />
          ) : uiStudioTab === 'mockups' ? (
            <UiStudioMockupPanel />
          ) : (
            <AppPreviewPanel
              pages={previewPages}
              onOpenSourceControl={() => selectPane('source-control')}
              defaultPanelOpen
              embeddedInDock
            />
          )}
        </PaneLayer>
        <PaneLayer visible={activePane === 'source-control'}>
          <SourceControlPanel projectName={projectName} />
        </PaneLayer>
        <PaneLayer visible={activePane === 'projects'}>
          <IdeDashboardEmbed initialTab="projects" />
        </PaneLayer>
        <PaneLayer visible={activePane === 'secrets'}>
          <IdeDashboardEmbed initialTab="secrets" />
        </PaneLayer>
        <PaneLayer visible={activePane === 'dns'}>
          <IdeDashboardEmbed initialTab="dns" />
        </PaneLayer>
        <PaneLayer visible={activePane === 'search'}>
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <h2 className="font-headline text-lg text-foreground">Search</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              Use the file tree and chat to navigate the workspace. Global search will index project files in a future
              release.
            </p>
          </div>
        </PaneLayer>
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
