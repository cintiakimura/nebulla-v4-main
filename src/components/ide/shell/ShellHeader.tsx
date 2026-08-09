import { useCallback, useEffect, useRef, useState } from 'react';
import { LayoutGrid, Loader2, Rocket, Settings } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { getBrowserProjectName } from '../../../lib/nebulaProjectApi';
import { sessionInitials } from '../../../lib/sessionInitials';
import { fetchSessionUser, type NebulaSessionUser } from '../../../lib/nebulaCloud';
import {
  fetchRunnableStatus,
  runWorkspaceDeployOrBuildCheck,
} from '../../../lib/workspaceDeployClient';
import { readStoredWorkspaceLiveUrl } from '../../../lib/workspaceLiveUrl';
import { tryGuidedOpenLiveUrlPopup } from '../../../lib/guidedFunnel';
import { useIdeShellNav } from './IdeShellNavContext';
import { cn } from '@/lib/utils';

export function ShellHeader({
  workspaceLabel,
  workspaceSetupBusy,
  onProjectNameCommit,
  onOpenAccount,
}: {
  workspaceLabel?: string;
  workspaceSetupBusy?: boolean;
  onProjectNameCommit?: (name: string) => void | Promise<void>;
  /** @deprecated Prefer goToSettings from nav — kept as alias for Settings. */
  onOpenAccount?: () => void;
}) {
  const { activeScreen, goToSettings, goToDashboard } = useIdeShellNav();
  const openSettings = () => {
    if (onOpenAccount) onOpenAccount();
    else goToSettings();
  };
  const [draftName, setDraftName] = useState(
    () => workspaceLabel?.trim() || getBrowserProjectName().trim() || '',
  );
  const [sessionUser, setSessionUser] = useState<NebulaSessionUser | null>(null);
  const [deployBusy, setDeployBusy] = useState(false);
  const [deployHint, setDeployHint] = useState<string | null>(null);
  const [runnableOk, setRunnableOk] = useState<boolean | null>(null);
  const [deployPulse, setDeployPulse] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const next = workspaceLabel?.trim() || getBrowserProjectName().trim() || '';
    setDraftName(next);
  }, [workspaceLabel]);

  useEffect(() => {
    let cancelled = false;
    void fetchSessionUser().then((u) => {
      if (!cancelled) setSessionUser(u);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void fetchRunnableStatus()
      .then((s) => setRunnableOk(Boolean(s.runnable || s.deployable)))
      .catch(() => setRunnableOk(null));
  }, []);

  const commitName = useCallback(() => {
    const trimmed = draftName.trim();
    if (!trimmed) {
      setDraftName(workspaceLabel?.trim() || getBrowserProjectName().trim() || '');
      return;
    }
    void onProjectNameCommit?.(trimmed);
  }, [draftName, onProjectNameCommit, workspaceLabel]);

  useEffect(() => {
    const onPulse = (ev: Event) => {
      const kind = (ev as CustomEvent<{ kind?: string }>).detail?.kind;
      if (kind !== 'deploy') return;
      setDeployPulse(true);
      window.setTimeout(() => setDeployPulse(false), 2400);
    };
    window.addEventListener('nebula-guided-pulse', onPulse);
    return () => window.removeEventListener('nebula-guided-pulse', onPulse);
  }, []);

  const runDeploy = useCallback(async () => {
    if (deployBusy) return;
    setDeployBusy(true);
    setDeployHint('Deploying…');
    try {
      const result = await runWorkspaceDeployOrBuildCheck({});
      if (!result.ok) {
        setDeployHint(result.error || 'Deploy failed');
        window.setTimeout(() => setDeployHint(null), 12000);
        return;
      }
      const url = (result.url || readStoredWorkspaceLiveUrl() || '').trim();
      if (url && /^https?:\/\//i.test(url)) {
        setDeployHint('Live URL ready');
        tryGuidedOpenLiveUrlPopup(url);
      } else {
        // Safe stub when deploy OK but no Render URL yet
        const stub = 'https://your-app.onrender.com';
        setDeployHint('Deploy OK — using placeholder URL');
        tryGuidedOpenLiveUrlPopup(stub);
      }
      window.setTimeout(() => setDeployHint(null), 12000);
    } catch {
      setDeployHint('Deploy failed');
      window.setTimeout(() => setDeployHint(null), 12000);
    } finally {
      setDeployBusy(false);
    }
  }, [deployBusy]);

  const initials = sessionInitials(sessionUser);

  return (
    <header className="ide-glass-chrome flex min-h-12 shrink-0 flex-col border-b border-border">
      <div className="flex min-h-12 items-center gap-2 px-3 py-1">
        <div className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            title="Projects"
            aria-label="Go to projects Dashboard"
            onClick={() => goToDashboard()}
            className="inline-flex items-center gap-2 rounded-md outline-none focus-visible:ring-1 focus-visible:ring-border"
          >
            <Logo className="h-10 w-10 max-h-[90%] shrink-0 object-contain opacity-95" />
            <span className="app-logotype hidden md:inline">Nebulla.beta</span>
          </button>
          <button
            type="button"
            title="Projects"
            aria-label="Projects"
            onClick={() => goToDashboard()}
            className="btn-secondary-surface inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-xs text-muted-foreground"
          >
            <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">Projects</span>
          </button>
          <input
            ref={nameInputRef}
            type="text"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={() => commitName()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitName();
                nameInputRef.current?.blur();
              }
              if (e.key === 'Escape') {
                setDraftName(workspaceLabel?.trim() || getBrowserProjectName().trim() || '');
                nameInputRef.current?.blur();
              }
            }}
            placeholder="Project name"
            aria-label="Project name"
            title="Project name"
            className="btn-secondary-surface type-title-sm hidden w-full min-w-0 max-w-[10rem] truncate rounded-md px-2 py-1 text-muted-foreground outline-none placeholder:text-muted-foreground/50 focus:text-foreground lg:block xl:max-w-[14rem]"
          />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {workspaceSetupBusy ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] text-muted-foreground"
              role="status"
            >
              <Loader2 className="h-3 w-3 animate-spin text-cyan-300/90" aria-hidden />
              <span className="hidden sm:inline">Setting up…</span>
            </span>
          ) : null}

          <button
            type="button"
            title={
              runnableOk === false
                ? 'Needs runnable root — run a coding slice first'
                : deployHint || 'Deploy / Build check'
            }
            aria-label="Deploy"
            disabled={deployBusy}
            onClick={() => void runDeploy()}
            className={cn(
              'btn-secondary-surface inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:text-foreground disabled:opacity-40',
              runnableOk === false && 'opacity-70',
              deployPulse && 'nebulla-guided-pulse',
            )}
          >
            {deployBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Rocket className="h-4 w-4" aria-hidden />
            )}
          </button>

          <button
            type="button"
            title="Settings"
            aria-label="Settings"
            aria-current={activeScreen === 'settings' ? 'page' : undefined}
            onClick={openSettings}
            className={cn(
              'inline-flex h-9 w-9 items-center justify-center rounded-md',
              activeScreen === 'settings'
                ? 'btn-cyan'
                : 'btn-secondary-surface text-muted-foreground hover:text-foreground',
            )}
          >
            <Settings className="h-4 w-4" aria-hidden />
          </button>

          <button
            type="button"
            title="Settings"
            aria-label="Open Settings"
            aria-current={activeScreen === 'settings' ? 'page' : undefined}
            onClick={openSettings}
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-full text-[11px]',
              activeScreen === 'settings'
                ? 'btn-cyan'
                : 'btn-secondary-surface text-foreground',
            )}
          >
            {initials || 'NB'}
          </button>
        </div>
      </div>
    </header>
  );
}
