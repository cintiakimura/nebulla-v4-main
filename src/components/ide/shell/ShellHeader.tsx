import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Github, GitCommit, Loader2, Rocket, Settings } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { getBrowserProjectName } from '../../../lib/nebulaProjectApi';
import { sessionInitials } from '../../../lib/sessionInitials';
import { fetchSessionUser, type NebulaSessionUser } from '../../../lib/nebulaCloud';
import { fetchNebulaPublicConfig } from '../../../lib/nebulaPublicConfig';
import {
  fetchRunnableStatus,
  runWorkspaceDeployOrBuildCheck,
} from '../../../lib/workspaceDeployClient';
import { readStoredWorkspaceLiveUrl } from '../../../lib/workspaceLiveUrl';
import { tryGuidedOpenLiveUrlPopup } from '../../../lib/guidedFunnel';
import { downloadTechnicalDocumentation } from '../../../lib/technicalDocumentationDownload';
import { useIdeShellNav } from './IdeShellNavContext';
import { cn } from '@/lib/utils';

const SETTINGS_SECTION_KEY = 'nebula_shell_settings_section_v1';

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
  const [githubOAuthReady, setGithubOAuthReady] = useState(false);
  const [deployBusy, setDeployBusy] = useState(false);
  const [deployHint, setDeployHint] = useState<string | null>(null);
  const [runnableOk, setRunnableOk] = useState<boolean | null>(null);
  const [deployPulse, setDeployPulse] = useState(false);
  const [gitPulse, setGitPulse] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportHint, setExportHint] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const onPlan = activeScreen === 'plan';
  const onCode = activeScreen === 'code';

  useEffect(() => {
    const next = workspaceLabel?.trim() || getBrowserProjectName().trim() || '';
    setDraftName(next);
  }, [workspaceLabel]);

  useEffect(() => {
    const onSync = (ev: Event) => {
      const name = (ev as CustomEvent<{ projectName?: string }>).detail?.projectName?.trim();
      setDraftName(name || getBrowserProjectName().trim() || '');
    };
    window.addEventListener('nebula-workspace-context-synced', onSync);
    return () => window.removeEventListener('nebula-workspace-context-synced', onSync);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([fetchSessionUser(), fetchNebulaPublicConfig()]).then(([u, cfg]) => {
      if (cancelled) return;
      setSessionUser(u);
      setGithubOAuthReady(Boolean(cfg.githubOAuthReady));
    });
    const onOAuth = (ev: MessageEvent) => {
      if (ev.data?.type !== 'OAUTH_AUTH_SUCCESS') return;
      void fetchSessionUser().then((u) => {
        if (!cancelled) setSessionUser(u);
      });
    };
    window.addEventListener('message', onOAuth);
    return () => {
      cancelled = true;
      window.removeEventListener('message', onOAuth);
    };
  }, []);

  useEffect(() => {
    void fetchRunnableStatus()
      .then((s) => setRunnableOk(Boolean(s.runnable || s.deployable)))
      .catch(() => setRunnableOk(null));
  }, []);

  useEffect(() => {
    const onPulse = (ev: Event) => {
      const kind = (ev as CustomEvent<{ kind?: string }>).detail?.kind;
      if (kind === 'deploy') {
        setDeployPulse(true);
        window.setTimeout(() => setDeployPulse(false), 2400);
      }
      if (kind === 'git') {
        setGitPulse(true);
        window.setTimeout(() => setGitPulse(false), 2400);
      }
    };
    window.addEventListener('nebula-guided-pulse', onPulse);
    return () => window.removeEventListener('nebula-guided-pulse', onPulse);
  }, []);

  const commitName = useCallback(() => {
    const trimmed = draftName.trim();
    if (!trimmed) {
      setDraftName(workspaceLabel?.trim() || getBrowserProjectName().trim() || '');
      return;
    }
    void onProjectNameCommit?.(trimmed);
  }, [draftName, onProjectNameCommit, workspaceLabel]);

  const openGitHub = useCallback(() => {
    const connected = sessionUser?.provider === 'github';
    if (!connected && githubOAuthReady) {
      window.open('/api/auth/github?remember=1', 'nebulla_github_oauth', 'width=520,height=720,scrollbars=yes');
      return;
    }
    try {
      localStorage.setItem(SETTINGS_SECTION_KEY, 'github');
    } catch {
      /* ignore */
    }
    if (onOpenAccount) onOpenAccount();
    else goToSettings();
  }, [githubOAuthReady, goToSettings, onOpenAccount, sessionUser?.provider]);

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

  const runExportDocs = useCallback(async () => {
    if (exportBusy) return;
    setExportBusy(true);
    setExportHint(null);
    try {
      const result = await downloadTechnicalDocumentation();
      setExportHint(result.ok ? 'Exported' : result.error || 'Export failed');
      window.setTimeout(() => setExportHint(null), 4000);
    } finally {
      setExportBusy(false);
    }
  }, [exportBusy]);

  const initials = sessionInitials(sessionUser);
  const githubConnected = sessionUser?.provider === 'github';

  return (
    <header className="ide-glass-chrome flex h-14 shrink-0 flex-col border-b border-border">
      <div className="flex h-14 items-center gap-3 px-3 md:px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <button
            type="button"
            title="Dashboard"
            aria-label="Go to projects Dashboard"
            onClick={() => goToDashboard()}
            className="inline-flex shrink-0 items-center gap-2.5 rounded-md outline-none focus-visible:ring-1 focus-visible:ring-border"
          >
            <Logo className="h-10 w-10 shrink-0 object-contain md:h-11 md:w-11" />
            <span className="app-logotype text-[15px] tracking-[0.03em] md:text-base">Nebulla.beta</span>
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
            className="btn-secondary-surface type-body-dense min-w-0 max-w-[9rem] truncate rounded-md px-2.5 py-1.5 text-foreground outline-none placeholder:text-muted-foreground/50 sm:max-w-[12rem] md:max-w-[16rem]"
          />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {workspaceSetupBusy ? (
            <span
              className="type-micro inline-flex items-center gap-1.5 rounded-md px-2 py-1"
              role="status"
            >
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              <span className="hidden sm:inline">Setting up…</span>
            </span>
          ) : null}

          {onPlan ? (
            <button
              type="button"
              title={exportHint || 'Export technical documentation'}
              aria-label="Export docs"
              disabled={exportBusy}
              onClick={() => void runExportDocs()}
              className="btn-cyan inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs disabled:opacity-45"
            >
              {exportBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Download className="h-3.5 w-3.5" aria-hidden />
              )}
              <span className="hidden sm:inline">Export docs</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                title={githubConnected ? 'GitHub connected — open Settings' : 'Connect GitHub'}
                aria-label="GitHub"
                onClick={openGitHub}
                className={cn(
                  'btn-secondary-surface btn-icon',
                  githubConnected ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Github className="h-4 w-4" aria-hidden />
              </button>

              {onCode ? (
                <button
                  type="button"
                  title="Commit"
                  aria-label="Commit"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('nebula-open-commit'));
                  }}
                  className={cn(
                    'btn-secondary-surface btn-icon text-muted-foreground hover:text-foreground',
                    gitPulse && 'nebulla-guided-pulse',
                  )}
                >
                  <GitCommit className="h-4 w-4" aria-hidden />
                </button>
              ) : null}

              <button
                type="button"
                title={
                  runnableOk === false
                    ? 'Needs runnable root — run a coding slice first'
                    : deployHint || 'Deploy'
                }
                aria-label="Deploy"
                disabled={deployBusy}
                onClick={() => void runDeploy()}
                className={cn(
                  'btn-secondary-surface btn-icon text-muted-foreground hover:text-foreground disabled:opacity-40',
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
            </>
          )}

          <button
            type="button"
            title="Settings"
            aria-label="Settings"
            aria-current={activeScreen === 'settings' ? 'page' : undefined}
            onClick={openSettings}
            className={cn(
              'btn-icon',
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
              'flex h-8 w-8 items-center justify-center rounded-full text-[11px]',
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
