import { useCallback, useEffect, useRef, useState } from 'react';
import {
  dispatchOpenCenterPanel,
  IdeCenterTabsProvider,
} from '@/components/ide/IdeCenterTabsContext';
import { WelcomeOnboardingModal } from '@/components/ide/WelcomeOnboardingModal';
import { IdeWorkspaceProvider } from '@/components/ide/IdeWorkspaceContext';
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
import { registerNebulaUiStudioBridge } from '../../lib/nebulaUiStudioEvents';
import { shouldShowWelcomeOnboarding } from '../../lib/nebulaWelcomeOnboarding';
import { cloudBlockedBannerMessage } from '../../lib/ideCloudStatus';
import { installOnboardingRideListeners } from '../../lib/ideOnboardingRide';
import { UI_SHELL_ONLY } from '../../lib/testingBranch';
import { IdeShellNavProvider, useIdeShellNav } from '@/components/ide/shell/IdeShellNavContext';
import { ShellHeader } from '@/components/ide/shell/ShellHeader';
import { ShellBottomNav } from '@/components/ide/shell/ShellBottomNav';
import { GuidedFunnelOverlays } from '@/components/ide/shell/GuidedFunnelOverlays';
import { BuildScreen } from '@/components/ide/shell/BuildScreen';
import { CodeScreen } from '@/components/ide/shell/CodeScreen';
import { PlanScreen } from '@/components/ide/shell/PlanScreen';
import { SettingsScreen } from '@/components/ide/shell/SettingsScreen';
import { DashboardScreen } from '@/components/ide/shell/DashboardScreen';
import {
  consumeForceDashboardOnce,
  consumeGuidedEnterBuild,
} from '../../lib/guidedFunnel';

export function NebullaIDE() {
  return (
    <IdeWorkspaceProvider>
      <IdeCenterTabsProvider>
        <IdeShellNavProvider>
          <NebullaIDEShell />
        </IdeShellNavProvider>
      </IdeCenterTabsProvider>
    </IdeWorkspaceProvider>
  );
}

function NebullaIDEShell() {
  const {
    activeScreen,
    goToSettings,
    goToBuild,
    goToCode,
    goToPlan,
    goToDashboard,
  } = useIdeShellNav();
  const [myServicesUser, setMyServicesUser] = useState<NebulaSessionUser | null>(null);
  const [workspaceCtx, setWorkspaceCtx] = useState<WorkspaceContext | null>(null);
  const [workspaceSetupBusy, setWorkspaceSetupBusy] = useState(true);
  const [workspaceProjectKey, setWorkspaceProjectKey] = useState(() => getBrowserProjectKey());
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
    document.title = 'Nebulla.beta — Workspace';
  }, []);

  /** T1 enter Build / T8 force Dashboard — one-shot on app mount. */
  useEffect(() => {
    if (consumeGuidedEnterBuild()) {
      goToBuild();
      return;
    }
    if (consumeForceDashboardOnce()) {
      goToDashboard();
    }
  }, [goToBuild, goToDashboard]);

  /** Guided nav events from funnel helpers (T2/T4/T7). */
  useEffect(() => {
    const onNav = (ev: Event) => {
      const screen = (ev as CustomEvent<{ screen?: string }>).detail?.screen;
      if (screen === 'build') goToBuild();
      else if (screen === 'code') goToCode();
      else if (screen === 'plan') goToPlan();
      else if (screen === 'dashboard') goToDashboard();
    };
    window.addEventListener('nebula-guided-nav', onNav);
    return () => window.removeEventListener('nebula-guided-nav', onNav);
  }, [goToBuild, goToCode, goToPlan, goToDashboard]);

  useEffect(() => installOnboardingRideListeners(), []);

  const handleWorkspaceReady = useCallback((ctx: WorkspaceContext) => {
    setWorkspaceSetupBusy(false);
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
    // UI redesign branch: skip Grok/cloud setup banners and BYOK welcome.
    if (UI_SHELL_ONLY) {
      setCloudBanner(null);
      setWelcomeOpen(false);
      return;
    }
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
    const openSecrets = () => {
      dispatchOpenCenterPanel('secrets');
    };
    const openProfile = () => {
      goToSettings();
    };
    window.addEventListener('nebula-open-my-services', openSecrets);
    window.addEventListener('nebula-open-user-profile', openProfile);
    return () => {
      window.removeEventListener('nebula-open-my-services', openSecrets);
      window.removeEventListener('nebula-open-user-profile', openProfile);
    };
  }, [goToSettings]);

  const handleSessionEnded = useCallback(() => {
    setMyServicesUser(null);
    setWorkspaceCtx(null);
    welcomeCheckedRef.current = false;
    window.location.assign('/');
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
        await fetch(withProjectQuery('/api/workspace/mind-map/sync-from-master-plan'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(
            withProjectBody({ projectName: getBrowserProjectName().trim() || 'Untitled Project' }),
          ),
        });
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
        dispatchOpenCenterPanel('ui-studio-beta', { uiStudioTab: opts?.tab ?? 'design' });
      },
      runV0Generate: (opts) => {
        dispatchOpenCenterPanel('ui-studio-beta', { uiStudioTab: 'design' });
        window.setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent('nebula-ui-studio-beta-run', {
              detail: { ...(opts ?? {}), autoTriggered: true },
            }),
          );
        }, 350);
      },
    });
  }, []);

  return (
    /* Wallpaper/glass come from AppShell — this is layout only */
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden text-foreground">
      {!workspaceCtx ? (
        <WorkspaceSetupGate
          onReady={handleWorkspaceReady}
          onSetupBusyChange={setWorkspaceSetupBusy}
        />
      ) : null}
      <WelcomeOnboardingModal
        open={welcomeOpen && Boolean(workspaceCtx)}
        user={myServicesUser ?? workspaceCtx?.user ?? null}
        onClose={() => setWelcomeOpen(false)}
      />
      {activeScreen !== 'dashboard' ? (
        <ShellHeader
          workspaceLabel={workspaceCtx?.projectName}
          workspaceSetupBusy={workspaceSetupBusy && !workspaceCtx}
          onProjectNameCommit={handleProjectNameCommit}
          onOpenAccount={() => goToSettings()}
        />
      ) : null}

      {!UI_SHELL_ONLY && cloudBanner && !cloudBannerDismissed && workspaceCtx ? (
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

      {/* Body + floating bottom nav. Workspace tabs stay mounted so Build↔Code↔Plan keeps UI state. */}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {activeScreen === 'dashboard' ? (
            <DashboardScreen onOpenAccount={() => goToSettings()} />
          ) : null}
          {activeScreen === 'settings' ? (
            <SettingsScreen onLoggedOut={handleSessionEnded} />
          ) : null}
          {(activeScreen === 'build' ||
            activeScreen === 'code' ||
            activeScreen === 'plan') && (
            <>
              {/* pb clears the floating capsule nav; each page owns its scroll */}
              <div
                className={
                  activeScreen === 'build'
                    ? 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden pb-16'
                    : 'hidden'
                }
                aria-hidden={activeScreen !== 'build'}
              >
                <BuildScreen />
              </div>
              <div
                className={
                  activeScreen === 'code'
                    ? 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden pb-16'
                    : 'hidden'
                }
                aria-hidden={activeScreen !== 'code'}
              >
                <CodeScreen />
              </div>
              <div
                className={
                  activeScreen === 'plan'
                    ? 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden pb-16'
                    : 'hidden'
                }
                aria-hidden={activeScreen !== 'plan'}
              >
                <PlanScreen />
              </div>
            </>
          )}
        </div>
        {/* Bottom menu: Build · Code · Plan only (hidden on Dashboard / Settings). */}
        <ShellBottomNav />
      </div>

      <GuidedFunnelOverlays />
    </div>
  );
}
