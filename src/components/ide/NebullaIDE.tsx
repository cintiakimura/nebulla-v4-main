import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { AIChat } from '@/components/ide/AIChat';
import { IdeCenterWorkspace } from '@/components/ide/IdeCenterWorkspace';
import {
  dispatchOpenCenterPanel,
  IdeCenterTabsProvider,
  useIdeCenterTabs,
} from '@/components/ide/IdeCenterTabsContext';
import { TerminalPanel } from '@/components/ide/TerminalPanel';
import { TopBar } from '@/components/ide/TopBar';
import { VerticalNav } from '@/components/ide/VerticalNav';
import { MyServicesOnboarding } from '@/components/MyServicesOnboarding';
import { UserProfilePage } from '@/components/UserProfilePage';
import { WelcomeOnboardingModal } from '@/components/ide/WelcomeOnboardingModal';
import { FileExplorer } from '@/components/ide/FileExplorer';
import { SourceControlPanel } from '@/components/SourceControlPanel';
import { IdeWorkspaceProvider, useIdeWorkspace } from '@/components/ide/IdeWorkspaceContext';
import {
  NEBULA_OPEN_LEFT_SIDEBAR,
  type IdeLeftSidebarView,
} from '../../lib/ideLeftSidebar';
import {
  ensureCloudWorkspaceReady,
  fetchSessionUser,
  renameActiveProjectDisplayName,
  type NebulaSessionUser,
} from '../../lib/nebulaCloud';
import { fetchNebulaPublicConfig, type NebulaPublicConfig } from '../../lib/nebulaPublicConfig';
import { getBrowserProjectKey, getBrowserProjectName, withProjectBody, withProjectQuery } from '../../lib/nebulaProjectApi';
import {
  WorkspaceSetupGate,
  type WorkspaceContext,
} from '@/components/ide/WorkspaceSetupGate';
import { navIdToCenterPane } from '../../lib/ideCenterPanes';
import { registerNebulaUiStudioBridge } from '../../lib/nebulaUiStudioEvents';
import { shouldShowWelcomeOnboarding } from '../../lib/nebulaWelcomeOnboarding';
import { cloudBlockedBannerMessage } from '../../lib/ideCloudStatus';

const EXPLORER_MIN = 160;
const EXPLORER_MAX = 480;
const EXPLORER_DEFAULT = 224;

const CHAT_MIN = 240;
const CHAT_MAX = 560;
const CHAT_DEFAULT = 320;

const TERMINAL_MIN = 80;
const TERMINAL_MAX = 560;
const TERMINAL_DEFAULT = 220;

function IdeExplorerSidebar() {
  return <FileExplorer />;
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

export function NebullaIDE() {
  return (
    <IdeWorkspaceProvider>
      <IdeCenterTabsProvider>
        <NebullaIDEShell />
      </IdeCenterTabsProvider>
    </IdeWorkspaceProvider>
  );
}

function NebullaIDEShell() {
  const { activeNavId, openPanel } = useIdeCenterTabs();
  const explorer = useDragResize(EXPLORER_DEFAULT, EXPLORER_MIN, EXPLORER_MAX, 'horizontal-right');
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [leftSidebarView, setLeftSidebarView] = useState<IdeLeftSidebarView>('explorer');
  const chat = useDragResize(CHAT_DEFAULT, CHAT_MIN, CHAT_MAX, 'horizontal-left');
  const terminal = useDragResize(TERMINAL_DEFAULT, TERMINAL_MIN, TERMINAL_MAX, 'vertical');
  const [terminalCollapsed, setTerminalCollapsed] = useState(false);

  /** Same view again collapses; different view switches content and stays open. */
  const toggleLeftSidebar = useCallback(
    (view: IdeLeftSidebarView) => {
      if (leftSidebarOpen && leftSidebarView === view) {
        setLeftSidebarOpen(false);
        return;
      }
      setLeftSidebarView(view);
      setLeftSidebarOpen(true);
    },
    [leftSidebarOpen, leftSidebarView],
  );

  /** Open (or switch to) a left sidebar view without toggling closed. */
  const openLeftSidebar = useCallback((view: IdeLeftSidebarView) => {
    setLeftSidebarView(view);
    setLeftSidebarOpen(true);
  }, []);

  const [myServicesOpen, setMyServicesOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [myServicesUser, setMyServicesUser] = useState<NebulaSessionUser | null>(null);
  const [myServicesConfig, setMyServicesConfig] = useState<NebulaPublicConfig>({});
  const [workspaceCtx, setWorkspaceCtx] = useState<WorkspaceContext | null>(null);
  const [workspaceProjectKey, setWorkspaceProjectKey] = useState(() => getBrowserProjectKey());
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [cloudBanner, setCloudBanner] = useState<string | null>(null);
  const [cloudBannerDismissed, setCloudBannerDismissed] = useState(false);
  const welcomeCheckedRef = useRef(false);

  const refreshMyServicesContext = useCallback(async () => {
    const [cfg, u] = await Promise.all([fetchNebulaPublicConfig(), fetchSessionUser()]);
    setMyServicesConfig(cfg);
    setMyServicesUser(u);
    return { cfg, u };
  }, []);

  useEffect(() => {
    document.title = 'Nebulla.beta — Workspace';
  }, []);

  useEffect(() => {
    const onOpen = (ev: Event) => {
      const detail = (ev as CustomEvent<{ view?: IdeLeftSidebarView }>).detail;
      const view = detail?.view === 'source-control' ? 'source-control' : 'explorer';
      openLeftSidebar(view);
    };
    window.addEventListener(NEBULA_OPEN_LEFT_SIDEBAR, onOpen);
    return () => window.removeEventListener(NEBULA_OPEN_LEFT_SIDEBAR, onOpen);
  }, [openLeftSidebar]);

  const handleWorkspaceReady = useCallback((ctx: WorkspaceContext) => {
    setWorkspaceCtx(ctx);
    setWorkspaceProjectKey(ctx.projectKey);
    setCloudBannerDismissed(false);
  }, []);

  const handleProjectNameCommit = useCallback(
    async (name: string) => {
      const mode = workspaceCtx?.mode ?? 'guest';
      const result = await renameActiveProjectDisplayName(name, mode);
      setWorkspaceCtx((prev) =>
        prev
          ? { ...prev, projectName: result.projectName, projectKey: result.projectKey }
          : prev,
      );
      setWorkspaceProjectKey(result.projectKey);
    },
    [workspaceCtx?.mode],
  );

  /** After WorkspaceSetupGate: optional first-time welcome (non-blocking). */
  useEffect(() => {
    if (!workspaceCtx || welcomeCheckedRef.current) return;
    welcomeCheckedRef.current = true;
    const projectKey = workspaceCtx.projectKey || getBrowserProjectKey();
    void (async () => {
      const { cfg, u } = await refreshMyServicesContext();
      const banner = cloudBlockedBannerMessage(cfg);
      if (banner && (workspaceCtx.mode === 'guest' || !cfg.cloudStorageReady)) {
        setCloudBanner(banner);
      } else {
        setCloudBanner(null);
      }
      const show = shouldShowWelcomeOnboarding({
        projectKey,
        hasServerMainAiKey: Boolean(cfg.hasMainAiApiKey),
      });
      if (show) {
        setMyServicesUser(u);
        setWelcomeOpen(true);
        dispatchOpenCenterPanel('projects');
      }
    })();
  }, [workspaceCtx, refreshMyServicesContext]);

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
    if (!myServicesOpen && !profileOpen) return;
    void refreshMyServicesContext();
  }, [myServicesOpen, profileOpen, refreshMyServicesContext]);

  useEffect(() => {
    const openMyServices = () => {
      setProfileOpen(false);
      setMyServicesOpen(true);
    };
    const openProfile = () => {
      setMyServicesOpen(false);
      setProfileOpen(true);
    };
    window.addEventListener('nebula-open-my-services', openMyServices);
    window.addEventListener('nebula-open-user-profile', openProfile);
    return () => {
      window.removeEventListener('nebula-open-my-services', openMyServices);
      window.removeEventListener('nebula-open-user-profile', openProfile);
    };
  }, []);

  const handleSessionEnded = useCallback(() => {
    setProfileOpen(false);
    setMyServicesOpen(false);
    setMyServicesUser(null);
    setWorkspaceCtx(null);
    welcomeCheckedRef.current = false;
  }, []);

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
    const w = window as Window & { syncMindMapFromMasterPlan?: () => Promise<void> };
    w.syncMindMapFromMasterPlan = async () => {
      try {
        await fetch(
          withProjectQuery('/api/workspace/mind-map/sync-from-master-plan'),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(
              withProjectBody({ projectName: getBrowserProjectName().trim() || 'Untitled Project' }),
            ),
          },
        );
        window.dispatchEvent(new CustomEvent('nebula-mind-map-updated'));
        window.dispatchEvent(new CustomEvent('nebula-files-applied'));
      } catch {
        /* ignore */
      }
    };
    return () => {
      delete w.syncMindMapFromMasterPlan;
    };
  }, []);

  useEffect(() => {
    return registerNebulaUiStudioBridge({
      openUiStudio: (opts) => {
        dispatchOpenCenterPanel('ui-studio', { uiStudioTab: opts?.tab ?? 'design' });
      },
      runV0Generate: (opts) => {
        dispatchOpenCenterPanel('ui-studio', { uiStudioTab: 'design' });
        // Dedicated exec event — do not re-dispatch RUN_V0 (bridge listens to that).
        // Delay so IdeVisualEditor can mount before handling resume/generate.
        window.setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent('nebula-ui-studio-run-v0-exec', { detail: opts ?? {} }),
          );
        }, 350);
      },
    });
  }, []);

  const selectNavItem = useCallback(
    (id: string) => {
      // Settings gear = workspace onboarding (GitHub + API keys). Profile is NB in the top bar.
      if (id === 'project-settings') {
        setProfileOpen(false);
        setMyServicesOpen(true);
        return;
      }
      if (id === 'explorer') {
        toggleLeftSidebar('explorer');
        return;
      }
      if (id === 'source-control') {
        toggleLeftSidebar('source-control');
        return;
      }
      const pane = navIdToCenterPane(id);
      if (pane !== 'code') openPanel(pane);
    },
    [openPanel, toggleLeftSidebar],
  );

  const navActiveItem = myServicesOpen
    ? 'project-settings'
    : leftSidebarOpen && (leftSidebarView === 'explorer' || leftSidebarView === 'source-control')
      ? leftSidebarView
      : activeNavId === 'source-control'
        ? 'explorer'
        : activeNavId;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {!workspaceCtx ? <WorkspaceSetupGate onReady={handleWorkspaceReady} /> : null}
      <WelcomeOnboardingModal
        open={welcomeOpen && Boolean(workspaceCtx)}
        user={myServicesUser ?? workspaceCtx?.user ?? null}
        onClose={() => setWelcomeOpen(false)}
      />
      {profileOpen ? (
        <div
          className="fixed inset-0 z-[200] flex flex-col overflow-hidden"
          role="dialog"
          aria-modal="true"
          aria-label="User profile"
        >
          <UserProfilePage
            onClose={() => setProfileOpen(false)}
            onLoggedOut={handleSessionEnded}
            onAccountDeleted={handleSessionEnded}
            onOpenOnboarding={() => {
              setProfileOpen(false);
              setMyServicesOpen(true);
            }}
          />
        </div>
      ) : null}
      {myServicesOpen ? (
        <div
          className="fixed inset-0 z-[200] flex flex-col overflow-hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Onboarding"
        >
          <MyServicesOnboarding
            user={myServicesUser}
            config={myServicesConfig}
            onClose={() => setMyServicesOpen(false)}
          />
        </div>
      ) : null}

      <TopBar
        workspaceLabel={workspaceCtx?.projectName}
        onProjectNameCommit={handleProjectNameCommit}
        onSwitchWorkspace={() => setWorkspaceCtx(null)}
        onOpenAccount={() => {
          setMyServicesOpen(false);
          setProfileOpen(true);
        }}
      />

      {cloudBanner && !cloudBannerDismissed && workspaceCtx ? (
        <div
          className="flex shrink-0 items-start gap-3 border-b border-amber-500/25 bg-amber-500/10 px-4 py-2.5 text-xs leading-relaxed text-amber-50/95 sm:items-center sm:text-[13px]"
          role="status"
        >
          <p className="min-w-0 flex-1">{cloudBanner}</p>
          <button
            type="button"
            onClick={() => setCloudBannerDismissed(true)}
            className="shrink-0 rounded-md border border-amber-500/30 px-2 py-1 text-[11px] text-amber-100/90 hover:bg-amber-500/15"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="flex flex-1 overflow-hidden">
        <VerticalNav activeItem={navActiveItem} onSelectItem={selectNavItem} />

        {leftSidebarOpen ? (
          <>
            <div
              className="surface-active hidden shrink-0 overflow-hidden border-r border-border md:block"
              style={{ width: explorer.size }}
            >
              {leftSidebarView === 'source-control' ? (
                <SourceControlPanel
                  projectKey={workspaceProjectKey}
                  projectName={workspaceCtx?.projectName || getBrowserProjectName()}
                  compact
                />
              ) : (
                <IdeExplorerSidebar />
              )}
            </div>

            <ResizeHandle onMouseDown={explorer.onMouseDown} orientation="horizontal" />
          </>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <IdeCenterWorkspace />
          </div>

          {!terminalCollapsed ? (
            <ResizeHandle onMouseDown={terminal.onMouseDown} orientation="vertical" />
          ) : null}

          <div
            className="shrink-0 overflow-hidden"
            style={{ height: terminalCollapsed ? 32 : terminal.size }}
          >
            <TerminalPanel
              collapsed={terminalCollapsed}
              onToggleCollapse={() => setTerminalCollapsed((c) => !c)}
            />
          </div>
        </div>

        <ResizeHandle onMouseDown={chat.onMouseDown} orientation="horizontal" />

        <div
          className="surface-active flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-l border-border"
          style={{ width: chat.size, minWidth: 280, maxWidth: 420 }}
        >
          <AIChat />
        </div>
      </div>
    </div>
  );
}
