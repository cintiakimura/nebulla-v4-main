import { useCallback, useEffect, useRef, useState } from 'react';
import { IdeVisualEditor } from '@/components/ide/IdeVisualEditor';
import { cn } from '@/lib/utils';
import { AIChat } from '@/components/ide/AIChat';
import { CodeEditor } from '@/components/ide/CodeEditor';
import { TerminalPanel } from '@/components/ide/TerminalPanel';
import { TopBar } from '@/components/ide/TopBar';
import { VerticalNav } from '@/components/ide/VerticalNav';
import { MyServicesOnboarding } from '@/components/MyServicesOnboarding';
import { MasterPlan } from '@/components/MasterPlan';
import { SourceControlPanel } from '@/components/SourceControlPanel';
import { AppPreviewPanel } from '@/components/AppPreviewPanel';
import { ExplorerPanel } from '@/components/ExplorerPanel';
import { IdeDashboardEmbed } from '@/components/ide/IdeDashboardEmbed';
import { IdeWorkspaceProvider, useIdeWorkspace } from '@/components/ide/IdeWorkspaceContext';
import { MindMapIdeRoute } from '@/components/ide/MindMapIdeRoute';
import {
  ensureCloudWorkspaceReady,
  fetchSessionUser,
  type NebulaSessionUser,
} from '../../lib/nebulaCloud';
import { fetchNebulaPublicConfig, type NebulaPublicConfig } from '../../lib/nebulaPublicConfig';
import { getBrowserProjectKey, getBrowserProjectName } from '../../lib/nebulaProjectApi';
import {
  WorkspaceSetupGate,
  type WorkspaceContext,
} from '@/components/ide/WorkspaceSetupGate';
import { UiStudioMockupPanel } from '@/components/ide/UiStudioMockupPanel';
import {
  registerNebulaUiStudioBridge,
  type UiStudioTab,
} from '../../lib/nebulaUiStudioEvents';

const EXPLORER_MIN = 160;
const EXPLORER_MAX = 480;
const EXPLORER_DEFAULT = 224;

const CHAT_MIN = 240;
const CHAT_MAX = 560;
const CHAT_DEFAULT = 320;

const TERMINAL_MIN = 80;
const TERMINAL_MAX = 560;
const TERMINAL_DEFAULT = 192;

function IdeExplorerSidebar({ projectKey }: { projectKey: string }) {
  const { openFile } = useIdeWorkspace();
  return (
    <ExplorerPanel projectKey={projectKey} onOpenFile={(path) => void openFile(path)} />
  );
}

function IdeSearchView({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="tonal-seam-b flex h-10 shrink-0 items-center border-b border-white/5 px-3">
        <button type="button" className="type-label-sm text-muted-foreground hover:text-foreground" onClick={onBack}>
          ← Explorer
        </button>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <h2 className="font-headline text-lg text-foreground">Search</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Use the file tree and chat to navigate the workspace. A global search palette can ship with the workspace index API.
        </p>
        <button type="button" className="btn-primary-cta rounded-md px-4 py-2 text-sm" onClick={onBack}>
          Back to Explorer
        </button>
      </div>
    </div>
  );
}

function useDragResize(
  initial: number,
  min: number,
  max: number,
  direction: 'horizontal-right' | 'horizontal-left' | 'vertical',
) {
  const [size, setSize] = useState(initial);
  const dragging = useRef(false);
  const startPos = useRef(0);
  const startSize = useRef(initial);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      startPos.current = direction === 'vertical' ? e.clientY : e.clientX;
      startSize.current = size;

      const onMove = (ev: MouseEvent) => {
        if (!dragging.current) return;
        const delta =
          direction === 'vertical'
            ? ev.clientY - startPos.current
            : direction === 'horizontal-right'
              ? ev.clientX - startPos.current
              : startPos.current - ev.clientX;
        const next = Math.min(max, Math.max(min, startSize.current + delta));
        setSize(next);
      };

      const onUp = () => {
        dragging.current = false;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [size, min, max, direction],
  );

  return { size, onMouseDown };
}

function ResizeHandle({
  onMouseDown,
  orientation,
}: {
  onMouseDown: (e: React.MouseEvent) => void;
  orientation: 'vertical' | 'horizontal';
}) {
  return (
    <div
      role="separator"
      onMouseDown={onMouseDown}
      className={cn(
        'relative',
        orientation === 'horizontal' ? 'ide-resize-hit' : 'ide-resize-hit-row',
      )}
    >
      <div
        className={cn(
          'absolute',
          orientation === 'horizontal'
            ? 'inset-y-0 -left-1 -right-1'
            : 'inset-x-0 -top-1 -bottom-1',
        )}
      />
    </div>
  );
}

function IdeMainByNav({
  navId,
  onSelectNav,
}: {
  navId: string;
  onSelectNav: (id: string) => void;
}) {
  const projectName = getBrowserProjectName().trim() || 'Untitled project';

  if (navId === 'master-plan') {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <MasterPlan projectKey={getBrowserProjectKey()} onClose={() => onSelectNav('explorer')} />
      </div>
    );
  }

  if (navId === 'source-control') {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <SourceControlPanel projectName={projectName} />
      </div>
    );
  }

  if (navId === 'mind-map') {
    return <MindMapIdeRoute />;
  }

  if (navId === 'projects') {
    return <IdeDashboardEmbed initialTab="projects" />;
  }

  if (navId === 'secrets') {
    return <IdeDashboardEmbed initialTab="secrets" />;
  }

  if (navId === 'dns') {
    return <IdeDashboardEmbed initialTab="dns" />;
  }

  if (navId === 'search') {
    return <IdeSearchView onBack={() => onSelectNav('explorer')} />;
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="tonal-seam-b flex h-10 shrink-0 items-center border-b border-white/5 px-3">
        <button
          type="button"
          className="type-label-sm text-muted-foreground hover:text-foreground"
          onClick={() => onSelectNav('explorer')}
        >
          ← Explorer
        </button>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
        <p className="text-sm text-muted-foreground">Unknown panel.</p>
        <button
          type="button"
          className="btn-secondary-surface mt-4 rounded-md px-3 py-1.5 text-sm"
          onClick={() => onSelectNav('explorer')}
        >
          Explorer
        </button>
      </div>
    </div>
  );
}

export function NebullaIDE() {
  const [navId, setNavId] = useState('explorer');
  const [uiStudioTab, setUiStudioTab] = useState<UiStudioTab>('design');
  const explorer = useDragResize(EXPLORER_DEFAULT, EXPLORER_MIN, EXPLORER_MAX, 'horizontal-right');
  const chat = useDragResize(CHAT_DEFAULT, CHAT_MIN, CHAT_MAX, 'horizontal-left');
  const terminal = useDragResize(TERMINAL_DEFAULT, TERMINAL_MIN, TERMINAL_MAX, 'vertical');

  const [myServicesOpen, setMyServicesOpen] = useState(false);
  const [myServicesUser, setMyServicesUser] = useState<NebulaSessionUser | null>(null);
  const [myServicesConfig, setMyServicesConfig] = useState<NebulaPublicConfig>({});
  const [workspaceCtx, setWorkspaceCtx] = useState<WorkspaceContext | null>(null);
  const [workspaceProjectKey, setWorkspaceProjectKey] = useState(() => getBrowserProjectKey());

  const refreshMyServicesContext = useCallback(async () => {
    const [cfg, u] = await Promise.all([fetchNebulaPublicConfig(), fetchSessionUser()]);
    setMyServicesConfig(cfg);
    setMyServicesUser(u);
  }, []);

  useEffect(() => {
    document.title = 'Nebulla.beta — Workspace';
  }, []);

  const handleWorkspaceReady = useCallback((ctx: WorkspaceContext) => {
    setWorkspaceCtx(ctx);
    setWorkspaceProjectKey(ctx.projectKey);
  }, []);

  useEffect(() => {
    const onWorkspaceSync = () => setWorkspaceProjectKey(getBrowserProjectKey());
    window.addEventListener('nebula-workspace-context-synced', onWorkspaceSync);
    window.addEventListener('nebula-files-applied', onWorkspaceSync);
    return () => {
      window.removeEventListener('nebula-workspace-context-synced', onWorkspaceSync);
      window.removeEventListener('nebula-files-applied', onWorkspaceSync);
    };
  }, []);

  useEffect(() => {
    if (!myServicesOpen) return;
    void refreshMyServicesContext();
  }, [myServicesOpen, refreshMyServicesContext]);

  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      if (ev.data?.type !== 'OAUTH_AUTH_SUCCESS') return;
      void (async () => {
        const ready = await ensureCloudWorkspaceReady();
        if (ready.status === 'ready') {
          handleWorkspaceReady({
            projectName: ready.projectName,
            projectKey: ready.projectKey,
            user: ready.user,
            mode: ready.mode,
          });
        }
        void refreshMyServicesContext();
      })();
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [handleWorkspaceReady, refreshMyServicesContext]);

  useEffect(() => {
    return registerNebulaUiStudioBridge({
      openUiStudio: (opts) => {
        setNavId('visual-ui-editor');
        setUiStudioTab(opts?.tab ?? 'design');
      },
      runV0Generate: () => {
        window.dispatchEvent(new Event('nebula-ui-studio-run-v0'));
      },
    });
  }, []);

  useEffect(() => {
    if (navId === 'visual-ui-editor' && uiStudioTab !== 'mockups' && uiStudioTab !== 'preview') {
      setUiStudioTab('design');
    }
  }, [navId, uiStudioTab]);

  const selectNavItem = useCallback((id: string) => {
    if (id === 'project-settings') {
      setMyServicesOpen(true);
      setNavId('explorer');
      return;
    }
    setNavId(id);
  }, []);

  return (
    <IdeWorkspaceProvider>
      <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {!workspaceCtx ? <WorkspaceSetupGate onReady={handleWorkspaceReady} /> : null}
      {myServicesOpen ? (
        <div
          className="fixed inset-0 z-[200] flex flex-col overflow-hidden"
          role="dialog"
          aria-modal="true"
          aria-label="My services"
        >
          <MyServicesOnboarding
            user={myServicesUser}
            config={myServicesConfig}
            onClose={() => setMyServicesOpen(false)}
          />
        </div>
      ) : null}

      <TopBar
        workspaceLabel={
          workspaceCtx
            ? `${workspaceCtx.projectName}${workspaceCtx.mode === 'guest' ? ' (local)' : ''}`
            : undefined
        }
        onSwitchWorkspace={() => setWorkspaceCtx(null)}
        onOpenAccount={() => setMyServicesOpen(true)}
        onOpenSourceControl={() => setNavId('source-control')}
      />

      <div className="flex flex-1 overflow-hidden">
        <VerticalNav
          onOpenMyServices={() => setMyServicesOpen(true)}
          activeItem={navId}
          onSelectItem={selectNavItem}
        />

        {navId === 'visual-ui-editor' ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <div className="tonal-seam-b flex shrink-0 gap-1 border-b border-white/5 px-2 py-1.5">
              <button
                type="button"
                onClick={() => setUiStudioTab('design')}
                className={cn(
                  'type-label-sm rounded-md px-3 py-1.5 transition-colors',
                  uiStudioTab === 'design'
                    ? 'active-tab-sheen text-primary'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                )}
              >
                Visual editor
              </button>
              <button
                type="button"
                onClick={() => setUiStudioTab('mockups')}
                className={cn(
                  'type-label-sm rounded-md px-3 py-1.5 transition-colors',
                  uiStudioTab === 'mockups'
                    ? 'active-tab-sheen text-primary'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                )}
              >
                Mockups
              </button>
              <button
                type="button"
                onClick={() => setUiStudioTab('preview')}
                className={cn(
                  'type-label-sm rounded-md px-3 py-1.5 transition-colors',
                  uiStudioTab === 'preview'
                    ? 'active-tab-sheen text-primary'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                )}
              >
                Preview
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              {uiStudioTab === 'design' ? (
                <IdeVisualEditor onLock={() => setNavId('explorer')} projectDisplayName={getBrowserProjectName()} />
              ) : uiStudioTab === 'mockups' ? (
                <UiStudioMockupPanel />
              ) : (
                <AppPreviewPanel
                  pages={[
                    {
                      id: 'preview-root',
                      type: 'pageNode',
                      position: { x: 0, y: 0 },
                      data: { label: getBrowserProjectName().trim() || 'Workspace' },
                    },
                  ]}
                  onOpenSourceControl={() => setNavId('source-control')}
                />
              )}
            </div>
          </div>
        ) : navId === 'explorer' ? (
          <>
            <div className="surface-active tonal-seam-r hidden shrink-0 overflow-hidden md:block" style={{ width: explorer.size }}>
              <IdeExplorerSidebar projectKey={workspaceProjectKey} />
            </div>

            <ResizeHandle onMouseDown={explorer.onMouseDown} orientation="horizontal" />

            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
              <div className="flex-1 overflow-hidden">
                <CodeEditor />
              </div>

              <ResizeHandle onMouseDown={terminal.onMouseDown} orientation="vertical" />

              <div className="shrink-0 overflow-hidden" style={{ height: terminal.size }}>
                <TerminalPanel />
              </div>
            </div>

            <ResizeHandle onMouseDown={chat.onMouseDown} orientation="horizontal" />

            <div className="surface-active tonal-seam-l hidden shrink-0 overflow-hidden lg:block" style={{ width: chat.size }}>
              <AIChat />
            </div>
          </>
        ) : (
          <IdeMainByNav navId={navId} onSelectNav={setNavId} />
        )}
      </div>
    </div>
    </IdeWorkspaceProvider>
  );
}
