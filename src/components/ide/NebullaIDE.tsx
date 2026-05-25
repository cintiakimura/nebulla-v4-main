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
import { ExplorerPanel } from '@/components/ExplorerPanel';
import { IdeWorkspaceProvider, useIdeWorkspace } from '@/components/ide/IdeWorkspaceContext';
import {
  ensureCloudWorkspaceReady,
  fetchSessionUser,
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
  const { focusFile } = useIdeCenterTabs();
  return (
    <ExplorerPanel projectKey={projectKey} onOpenFile={(path) => focusFile(path)} />
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
      runV0Generate: () => {
        window.dispatchEvent(new Event('nebula-ui-studio-run-v0'));
      },
    });
  }, []);

  const selectNavItem = useCallback(
    (id: string) => {
      if (id === 'project-settings') {
        setMyServicesOpen(true);
        return;
      }
      if (id === 'explorer') return;
      const pane = navIdToCenterPane(id);
      if (pane !== 'code') openPanel(pane);
    },
    [openPanel],
  );

  return (
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
        onOpenSourceControl={() => openPanel('source-control')}
      />

      <div className="flex flex-1 overflow-hidden">
        <VerticalNav
          onOpenMyServices={() => setMyServicesOpen(true)}
          activeItem={activeNavId}
          onSelectItem={selectNavItem}
        />

        <div className="surface-active tonal-seam-r hidden shrink-0 overflow-hidden md:block" style={{ width: explorer.size }}>
          <IdeExplorerSidebar projectKey={workspaceProjectKey} />
        </div>

        <ResizeHandle onMouseDown={explorer.onMouseDown} orientation="horizontal" />

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <IdeCenterWorkspace />
          </div>

          <ResizeHandle onMouseDown={terminal.onMouseDown} orientation="vertical" />

          <div className="shrink-0 overflow-hidden" style={{ height: terminal.size }}>
            <TerminalPanel />
          </div>
        </div>

        <ResizeHandle onMouseDown={chat.onMouseDown} orientation="horizontal" />

        <div
          className="surface-active tonal-seam-l hidden h-full min-h-0 shrink-0 overflow-hidden md:flex md:flex-col"
          style={{ width: chat.size, minWidth: 280, maxWidth: 420 }}
        >
          <AIChat />
        </div>
      </div>
    </div>
  );
}
