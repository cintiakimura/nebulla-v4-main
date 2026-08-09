import { useCallback, useEffect, useRef, useState } from 'react';
import { GitBranch, LayoutDashboard, Loader2, Rocket } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { IdeStatusStrip } from '@/components/ide/IdeStatusStrip';
import { getBrowserProjectName } from '../../../lib/nebulaProjectApi';
import { sessionInitials } from '../../../lib/sessionInitials';
import { fetchSessionUser, type NebulaSessionUser } from '../../../lib/nebulaCloud';
import {
  fetchRunnableStatus,
  runWorkspaceDeployOrBuildCheck,
} from '../../../lib/workspaceDeployClient';
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
  onOpenAccount?: () => void;
}) {
  const { activeScreen, goToDashboard, goToBuild } = useIdeShellNav();
  const [draftName, setDraftName] = useState(
    () => workspaceLabel?.trim() || getBrowserProjectName().trim() || '',
  );
  const [sessionUser, setSessionUser] = useState<NebulaSessionUser | null>(null);
  const [deployBusy, setDeployBusy] = useState(false);
  const [deployHint, setDeployHint] = useState<string | null>(null);
  const [runnableOk, setRunnableOk] = useState<boolean | null>(null);
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

  const runDeploy = useCallback(async () => {
    if (deployBusy) return;
    setDeployBusy(true);
    setDeployHint('Build check…');
    try {
      const result = await runWorkspaceDeployOrBuildCheck({});
      setDeployHint(result.ok ? 'Build check OK' : result.error || 'Build check failed');
      window.setTimeout(() => setDeployHint(null), 12000);
    } catch {
      setDeployHint('Build check failed');
      window.setTimeout(() => setDeployHint(null), 12000);
    } finally {
      setDeployBusy(false);
    }
  }, [deployBusy]);

  const initials = sessionInitials(sessionUser);
  const isStart = activeScreen === 'start';

  return (
    <header className="ide-glass-chrome flex min-h-12 shrink-0 flex-col border-b border-border">
      <div className="flex min-h-12 items-center gap-2 px-3 py-1">
        <div className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
          <Logo
            className={cn(
              'max-h-[90%] shrink-0 object-contain opacity-95',
              isStart ? 'h-12 w-12' : 'h-10 w-10',
            )}
          />
          <span
            className={cn(
              'app-logotype',
              isStart
                ? 'inline text-[1.35rem] tracking-[0.06rem] leading-none'
                : 'hidden md:inline',
            )}
          >
            Nebulla.beta
          </span>
          {!isStart ? (
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
          ) : null}
        </div>

        {!isStart ? <IdeStatusStrip variant="header" /> : null}

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {!isStart && workspaceSetupBusy ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] text-muted-foreground"
              role="status"
            >
              <Loader2 className="h-3 w-3 animate-spin text-cyan-300/90" aria-hidden />
              <span className="hidden sm:inline">Setting up…</span>
            </span>
          ) : null}

          {!isStart && activeScreen === 'build' ? (
            <button
              type="button"
              title="Open Dashboard"
              aria-label="Open Dashboard"
              onClick={() => goToDashboard()}
              className="btn-secondary-surface inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
            >
              <LayoutDashboard className="h-4 w-4" aria-hidden />
            </button>
          ) : null}

          {!isStart && activeScreen === 'dashboard' ? (
            <button
              type="button"
              title="Back to Build"
              aria-label="Back to Build"
              onClick={() => goToBuild()}
              className="btn-cyan hidden h-9 items-center rounded-md px-3 text-xs sm:inline-flex"
            >
              Back to Build
            </button>
          ) : null}

          {!isStart ? (
            <>
              <button
                type="button"
                title="Source control"
                aria-label="Source control"
                onClick={() => goToDashboard('files')}
                className="btn-secondary-surface inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
              >
                <GitBranch className="h-4 w-4" aria-hidden />
              </button>

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
                )}
              >
                {deployBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Rocket className="h-4 w-4" aria-hidden />
                )}
              </button>
            </>
          ) : null}

          <button
            type="button"
            title="Account"
            aria-label="Account"
            onClick={() => onOpenAccount?.()}
            className="btn-secondary-surface flex h-9 w-9 items-center justify-center rounded-full text-[11px] text-foreground"
          >
            {initials || 'NB'}
          </button>
        </div>
      </div>
    </header>
  );
}
