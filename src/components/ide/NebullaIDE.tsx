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
import { fetchNebulaPublicConfig } from '../../lib/nebulaPublicConfig';
import { getBrowserProjectKey, getBrowserProjectName, withProjectBody, withProjectQuery } from '../../lib/nebulaProjectApi';
import {
  WorkspaceSetupGate,
  type WorkspaceContext,
} from '@/components/ide/WorkspaceSetupGate';
import { navIdToCenterPane } from '../../lib/ideCenterPanes';
import { registerNebulaUiStudioBridge } from '../../lib/nebulaUiStudioEvents';
import { shouldShowWelcomeOnboarding } from '../../lib/nebulaWelcomeOnboarding';
import { cloudBlockedBannerMessage } from '../../lib/ideCloudStatus';
import { installOnboardingRideListeners } from '../../lib/ideOnboardingRide';
import { markUserJumpedPhase } from '../../lib/ideProjectPhase';

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

function readStoredSize(key: string | undefined, fallback: number, min: number, max: number): number {
  if (!key || typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  } catch {
    return fallback;
  }
}

function useDragResize(
  initial: number,
  min: number,
  max: number,
  direction: 'horizontal-right' | 'horizontal-left' | 'vertical',
  storageKey?: string,
) {
  const [size, setSize] = useState(() => readStoredSize(storageKey, initial, min, max));
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
        if (storageKey) {
          try {
            // Read latest size from startSize + last delta via closure — persist current state on next tick.
            setSize((current) => {
              try {
                localStorage.setItem(storageKey, String(current));
              } catch {
                /* ignore */
              }
              return current;
            });
          } catch {
            /* ignore */
          }
        }
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [size, min, max, direction, storageKey],
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

type IdeShellStage = 'code' | 'projects' | 'plan' | 'ui-studio' | 'other';

function shellStageFromCenterTab(tab: { kind?: string; pane?: string } | null): IdeShellStage {
  if (!tab) return 'other';
  if (tab.kind === 'file') return 'code';
  if (tab.pane === 'projects') return 'projects';
  if (tab.pane === 'master-plan' || tab.pane === 'mind-map') return 'plan';
  if (tab.pane === 'ui-studio' || tab.pane === 'ui-studio-beta') return 'ui-studio';
  return 'other';
}

function NebullaIDEShell() {
  const { activeNavId, openPanel, activeTab } = useIdeCenterTabs();
  const explorer = useDragResize(
    EXPLORER_DEFAULT,
    EXPLORER_MIN,
    EXPLORER_MAX,
    'horizontal-right',
    'nebulla_ide_explorer_w',
  );
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [leftSidebarView, setLeftSidebarView] = useState<IdeLeftSidebarView>('explorer');
  const chat = useDragResize(CHAT_DEFAULT, CHAT_MIN, CHAT_MAX, 'horizontal-left', 'nebulla_ide_chat_w');
  const terminal = useDragResize(
    TERMINAL_DEFAULT,
    TERMINAL_MIN,
    TERMINAL_MAX,
    'vertical',
    'nebulla_ide_terminal_h',
  );
  const [terminalCollapsed, setTerminalCollapsed] = useState(true);
  const [securityAlertCount, setSecurityAlertCount] = useState(0);
  const prevShellStageRef = useRef<IdeShellStage | null>(null);

  // Apply chrome defaults only on stage transition — never fight user resizes continuously.
  useEffect(() => {
    const stage = shellStageFromCenterTab(activeTab);
    if (prevShellStageRef.current === stage) return;
    prevShellStageRef.current = stage;
    setTerminalCollapsed(true);
    if (stage === 'code') {
      setLeftSidebarOpen(true);
      setLeftSidebarView('explorer');
    } else if (stage === 'plan' || stage === 'ui-studio') {
      setLeftSidebarOpen(false);
    }
    // projects / other: keep explorer preference; only collapse terminal
  }, [activeTab]);

  useEffect(() => installOnboardingRideListeners(), []);

  useEffect(() => {
    const refreshBadge = async () => {
      try {
        const res = await fetch(withProjectQuery('/api/security-scan/latest'));
        if (!res.ok) {
          setSecurityAlertCount(0);
          return;
        }
        const data = await res.json();
        const findings = Array.isArray(data?.findings) ? data.findings : [];
        let dismissed = new Set<string>();
        try {
          const raw = localStorage.getItem('nebulla_security_scan_dismissed_v1');
          const map = raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
          dismissed = new Set(map[String(data.projectKey || '')] || []);
        } catch {
          /* ignore */
        }
        const n = findings.filter(
          (f: { id?: string; severity?: string }) =>
            f?.id &&
            !dismissed.has(f.id) &&
            (f.severity === 'critical' || f.severity === 'high'),
        ).length;
        setSecurityAlertCount(n);
      } catch {
        setSecurityAlertCount(0);
      }
    };
    void refreshBadge();
    const onUpdate = () => void refreshBadge();
    window.addEventListener('nebula-security-scan-updated', onUpdate);
    return () => window.removeEventListener('nebula-security-scan-updated', onUpdate);
  }, []);

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

  const [profileOpen, setProfileOpen] = useState(false);
  const [myServicesUser, setMyServicesUser] = useState<NebulaSessionUser | null>(null);
  const [workspaceCtx, setWorkspaceCtx] = useState<WorkspaceContext | null>(null);
  const [workspaceProjectKey, setWorkspaceProjectKey] = useState(() => getBrowserProjectKey());
  const [accountProjectName, setAccountProjectName] = useState(
    () => getBrowserProjectName().trim() || 'Untitled project',
  );
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [cloudBanner, setCloudBanner] = useState<string | null>(null);
  const [cloudBannerDismissed, setCloudBannerDismissed] = useState(false);
  const welcomeCheckedRef = useRef(false);

  const refreshMyServicesContext = useCallback(async () => {
    const [cfg, u] = await Promise.all([fetchNebulaPublicConfig(), fetchSessionUser()]);
    setMyServicesUser(u);
    return { cfg, u };
  }, []);

  useEffect(() => {
    const name = workspaceCtx?.projectName?.trim() || getBrowserProjectName().trim();
    if (name) setAccountProjectName(name);
  }, [workspaceCtx?.projectName, workspaceProjectKey]);

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
    if (!profileOpen) return;
    void refreshMyServicesContext();
  }, [profileOpen, refreshMyServicesContext]);

  useEffect(() => {
    const openSecrets = () => {
      setProfileOpen(false);
      dispatchOpenCenterPanel('secrets');
    };
    const openProfile = () => {
      setProfileOpen(true);
    };
    window.addEventListener('nebula-open-my-services', openSecrets);
    window.addEventListener('nebula-open-user-profile', openProfile);
    return () => {
      window.removeEventListener('nebula-open-my-services', openSecrets);
      window.removeEventListener('nebula-open-user-profile', openProfile);
    };
  }, []);

  const handleSessionEnded = useCallback(() => {
    setProfileOpen(false);
    setMyServicesUser(null);
    setWorkspaceCtx(null);
    welcomeCheckedRef.current = false;
    // Public marketing home (not the IDE gate).
    window.location.assign('/');
  }, []);

  const handleAccountProjectNameChange = useCallback(
    (name: string) => {
      setAccountProjectName(name);
      void handleProjectNameCommit(name);
    },
    [handleProjectNameCommit],
  );

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
        // Legacy v0 Studio disabled — always open UI Studio Beta.
        dispatchOpenCenterPanel('ui-studio-beta', { uiStudioTab: opts?.tab ?? 'design' });
      },
      runV0Generate: (opts) => {
        dispatchOpenCenterPanel('ui-studio-beta', { uiStudioTab: 'design' });
        window.setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent('nebula-ui-studio-beta-run', { detail: { ...(opts ?? {}), autoTriggered: true } }),
          );
        }, 350);
      },
    });
  }, []);

  const selectNavItem = useCallback(
    (id: string) => {
      // Settings gear → Account (profile + project settings). Keys live under Secrets.
      if (id === 'project-settings') {
        setProfileOpen(true);
        return;
      }
      if (id === 'explorer') {
        markUserJumpedPhase();
        toggleLeftSidebar('explorer');
        return;
      }
      if (id === 'source-control') {
        markUserJumpedPhase();
        toggleLeftSidebar('source-control');
        return;
      }
      markUserJumpedPhase();
      const pane = navIdToCenterPane(id);
      if (pane !== 'code') openPanel(pane);
    },
    [openPanel, toggleLeftSidebar],
  );

  const navActiveItem = profileOpen
    ? 'project-settings'
    : leftSidebarOpen && (leftSidebarView === 'explorer' || leftSidebarView === 'source-control')
      ? leftSidebarView
      : activeNavId === 'source-control'
        ? 'explorer'
        : activeNavId;

  return (
    <div className="nebulla-ide-shell flex h-screen flex-col overflow-hidden text-foreground">
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
          aria-label="Account"
        >
          <UserProfilePage
            onClose={() => setProfileOpen(false)}
            onLoggedOut={handleSessionEnded}
            onAccountDeleted={handleSessionEnded}
            onRequestSignIn={handleSessionEnded}
            projectName={accountProjectName}
            onProjectNameChange={handleAccountProjectNameChange}
            activeProjectKey={workspaceProjectKey}
          />
        </div>
      ) : null}

      <TopBar
        workspaceLabel={workspaceCtx?.projectName}
        onProjectNameCommit={handleProjectNameCommit}
        onSwitchWorkspace={() => setWorkspaceCtx(null)}
        onOpenAccount={() => setProfileOpen(true)}
        onLoggedOut={handleSessionEnded}
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
        <VerticalNav
          activeItem={navActiveItem}
          onSelectItem={selectNavItem}
          securityAlertCount={securityAlertCount}
        />

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
