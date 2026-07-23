import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, FolderOpen, Github, Loader2, Mail, Plus } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { readResponseJson } from '../../lib/apiFetch';
import {
  bindGuestWorkspace,
  createAndSelectCloudProject,
  ensureCloudWorkspaceReady,
  fetchSessionUser,
  getWorkspaceModePreference,
  listCloudProjects,
  selectCloudProjectByName,
  setWorkspaceModePreference,
  type CloudProjectRow,
  type NebulaSessionUser,
  type WorkspaceReadyResult,
} from '../../lib/nebulaCloud';
import { fetchNebulaPublicConfig, type NebulaPublicConfig } from '../../lib/nebulaPublicConfig';
import { getBrowserProjectKey, getBrowserProjectName } from '../../lib/nebulaProjectApi';

export type WorkspaceContext = {
  projectName: string;
  projectKey: string;
  user: NebulaSessionUser | null;
  mode: 'cloud' | 'guest';
};

export function WorkspaceSetupGate({ onReady }: { onReady: (ctx: WorkspaceContext) => void }) {
  const [phase, setPhase] = useState<WorkspaceReadyResult>({ status: 'loading' });
  const [config, setConfig] = useState<NebulaPublicConfig>({});
  const [projects, setProjects] = useState<CloudProjectRow[]>([]);
  const [user, setUser] = useState<NebulaSessionUser | null>(null);
  const [newProjectName, setNewProjectName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stayLoggedIn, setStayLoggedIn] = useState(true);
  const [emailMode, setEmailMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signupProjectName, setSignupProjectName] = useState('');

  const finishReady = useCallback(
    (ctx: WorkspaceContext) => {
      onReady(ctx);
    },
    [onReady],
  );

  const runEnsure = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const cfg = await fetchNebulaPublicConfig();
      setConfig(cfg);
      const result = await ensureCloudWorkspaceReady();
      setPhase(result);

      if (result.status === 'ready') {
        if (result.mode === 'cloud') setWorkspaceModePreference('cloud');
        finishReady({
          projectName: result.projectName,
          projectKey: result.projectKey,
          user: result.user,
          mode: result.mode,
        });
        return;
      }
      if (result.status === 'needs_project') {
        setWorkspaceModePreference('cloud');
        setUser(result.user);
        setProjects(result.projects);
      }
      // Local / no Postgres: always continue as guest so development is unblocked.
      if (result.status === 'no_database') {
        setWorkspaceModePreference('guest');
        const g = bindGuestWorkspace();
        finishReady({
          projectName: g.projectName,
          projectKey: g.projectKey,
          user: null,
          mode: 'guest',
        });
        return;
      }
      // Only auto-enter guest when the user last chose guest.
      // Never silently drop a cloud login into guest — that felt like "logged out on refresh".
      if (result.status === 'needs_login') {
        if (getWorkspaceModePreference() === 'guest') {
          const g = bindGuestWorkspace();
          finishReady({
            projectName: g.projectName,
            projectKey: g.projectKey,
            user: null,
            mode: 'guest',
          });
          return;
        }
        // Show sign-in UI (Stay signed in checkbox applies on next login).
      }
      if (result.status === 'error') {
        setError(result.message);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Workspace setup failed');
      setPhase({ status: 'error', message: 'Workspace setup failed' });
    } finally {
      setBusy(false);
    }
  }, [finishReady]);

  useEffect(() => {
    void runEnsure();
  }, [runEnsure]);

  useEffect(() => {
    const onOAuth = (ev: MessageEvent) => {
      if (ev.data?.type === 'OAUTH_AUTH_SUCCESS') {
        void runEnsure();
      }
    };
    window.addEventListener('message', onOAuth);
    return () => window.removeEventListener('message', onOAuth);
  }, [runEnsure]);

  const openGitHubOAuth = () => {
    const q = stayLoggedIn ? 'remember=1' : 'remember=0';
    window.open(`/api/auth/github?${q}`, 'nebulla_github_oauth', 'width=520,height=720,scrollbars=yes');
  };

  const runAuthJson = async (path: string, body: object) => {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ ...body, remember: stayLoggedIn }),
    });
    const data = await readResponseJson<{ error?: string }>(res);
    return { res, data };
  };

  const submitEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config.cloudStorageReady) {
      setError('Sign-in requires DATABASE_URL on the server.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (emailMode === 'signup') {
        const { res, data } = await runAuthJson('/api/auth/register', {
          email: email.trim(),
          password,
          projectName: signupProjectName.trim() || 'Untitled Project',
        });
        if (!res.ok) {
          setError(typeof data.error === 'string' ? data.error : 'Could not create account.');
          return;
        }
      } else {
        const { res, data } = await runAuthJson('/api/auth/login', {
          email: email.trim(),
          password,
        });
        if (!res.ok) {
          setError(typeof data.error === 'string' ? data.error : 'Sign in failed.');
          return;
        }
      }
      setWorkspaceModePreference('cloud');
      await runEnsure();
    } catch {
      setError('Network error.');
    } finally {
      setBusy(false);
    }
  };

  const handleSelectProject = async (name: string) => {
    setBusy(true);
    setError(null);
    try {
      const ok = await selectCloudProjectByName(name);
      if (!ok) {
        setError('Could not switch to that project.');
        return;
      }
      const u = await fetchSessionUser();
      finishReady({
        projectName: getBrowserProjectName().trim() || name,
        projectKey: getBrowserProjectKey(),
        user: u,
        mode: 'cloud',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleCreateProject = async () => {
    const name = newProjectName.trim() || 'Untitled Project';
    setBusy(true);
    setError(null);
    try {
      const ok = await createAndSelectCloudProject(name);
      if (!ok) {
        setError('Could not create project. Are you signed in?');
        return;
      }
      const again = await ensureCloudWorkspaceReady();
      if (again.status === 'ready') {
        finishReady({
          projectName: again.projectName,
          projectKey: again.projectKey,
          user: again.user,
          mode: 'cloud',
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleGuestContinue = () => {
    setWorkspaceModePreference('guest');
    const g = bindGuestWorkspace();
    finishReady({
      projectName: g.projectName,
      projectKey: g.projectKey,
      user: null,
      mode: 'guest',
    });
  };

  const loadProjectsForPicker = async () => {
    const u = await fetchSessionUser();
    if (!u) return;
    setUser(u);
    setProjects(await listCloudProjects());
    setPhase({ status: 'needs_project', config, user: u, projects: await listCloudProjects() });
  };

  if (phase.status === 'ready') {
    return null;
  }

  const githubOk = Boolean(config.githubOAuthReady);
  const cloudOk = Boolean(config.cloudStorageReady);

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-[#020814]/95 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Workspace setup"
    >
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0a0e14] p-6 shadow-2xl shadow-black/50">
        <div className="mb-6 flex items-center gap-3">
          <Logo className="h-9 w-9 shrink-0" />
          <div>
            <h1 className="font-headline text-lg text-slate-50">Workspace required</h1>
            <p className="text-xs text-slate-500">Sign in and pick a project so Grok can write files.</p>
          </div>
        </div>

        {phase.status === 'loading' || busy ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Setting up workspace…
          </div>
        ) : null}

        {error ? (
          <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
            {error}
          </p>
        ) : null}

        {phase.status === 'no_database' ? (
          <div className="space-y-3 text-sm text-slate-400">
            <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-amber-100/95">
              Cloud features need <code className="text-cyan-200/90">DATABASE_URL</code>. Continuing as guest.
            </p>
            <p className="text-xs leading-relaxed text-slate-500">
              {config.databaseConnectionFailed
                ? 'Postgres did not connect — use Render’s External database URL, or remove DATABASE_URL for guest-only local work.'
                : 'Without a database, GitHub login and cloud projects cannot run. Local files still work in guest mode.'}
            </p>
            <button
              type="button"
              onClick={handleGuestContinue}
              className="w-full rounded-xl border border-white/15 py-2.5 text-sm text-slate-200 hover:bg-white/5"
            >
              Continue with local guest workspace
            </button>
          </div>
        ) : null}

        {phase.status === 'needs_login' ? (
          <div className="space-y-4">
            {(config.databaseConnectionFailed || !cloudOk) && (
              <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/95">
                Cloud features need <code className="text-cyan-200/90">DATABASE_URL</code>. Continuing as guest is
                available below.
              </p>
            )}
            {!githubOk && config.githubClientIdConfigured && !config.githubClientSecretConfigured ? (
              <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/95">
                GitHub login needs <code className="text-cyan-200/90">GITHUB_CLIENT_SECRET</code> in{' '}
                <code className="text-slate-400">.env</code> (CLIENT_ID alone is not enough).
              </p>
            ) : null}
            <p className="text-sm text-slate-400 leading-relaxed">
              Sign in with <strong className="font-normal text-slate-200">email</strong> or GitHub to save projects to
              the cloud. Grok receives your project name, workspace path, file index, and Master Plan on every message.
            </p>

            <form onSubmit={(e) => void submitEmailAuth(e)} className="space-y-3 rounded-xl border border-white/10 bg-black/25 p-4">
              <div className="flex rounded-lg border border-white/10 p-0.5 bg-black/25">
                <button
                  type="button"
                  onClick={() => {
                    setEmailMode('signin');
                    setError(null);
                  }}
                  className={`flex-1 py-2 text-xs rounded-md transition-colors ${
                    emailMode === 'signin' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEmailMode('signup');
                    setError(null);
                  }}
                  className={`flex-1 py-2 text-xs rounded-md transition-colors ${
                    emailMode === 'signup' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  Create account
                </button>
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Email</label>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={!cloudOk || busy}
                  className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-slate-100 disabled:opacity-50"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Password</label>
                <input
                  type="password"
                  autoComplete={emailMode === 'signup' ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={!cloudOk || busy}
                  className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-slate-100 disabled:opacity-50"
                  placeholder={emailMode === 'signup' ? '10+ chars, letters and numbers' : 'Your password'}
                />
              </div>
              {emailMode === 'signup' ? (
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">
                    First project name
                  </label>
                  <input
                    type="text"
                    value={signupProjectName}
                    onChange={(e) => setSignupProjectName(e.target.value)}
                    disabled={!cloudOk || busy}
                    className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-slate-100 disabled:opacity-50"
                    placeholder="Untitled Project"
                  />
                </div>
              ) : null}
              <button
                type="submit"
                disabled={!cloudOk || busy}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-500/40 bg-cyan-500/15 py-2.5 text-sm text-cyan-100 disabled:opacity-45"
              >
                <Mail className="h-4 w-4 shrink-0" aria-hidden />
                {busy ? 'Please wait…' : emailMode === 'signin' ? 'Sign in with email' : 'Create account & save project'}
              </button>
            </form>

            <div className="relative py-1">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-[#0a0e14] px-3 text-[10px] uppercase tracking-wider text-slate-500">Or</span>
              </div>
            </div>

            <button
              type="button"
              onClick={openGitHubOAuth}
              disabled={!cloudOk || !githubOk || busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-white py-3 text-[15px] font-medium text-[#0d1117] disabled:opacity-45"
            >
              <Github className="h-5 w-5" aria-hidden />
              Continue with GitHub
            </button>
            {!githubOk && cloudOk ? (
              <p className="text-xs text-amber-400/90">
                GitHub is optional — email sign-in above saves your project without GitHub.
              </p>
            ) : null}
            {!cloudOk ? (
              <p className="text-xs text-red-400/90">
                Cloud storage is unavailable until <code className="text-slate-400">DATABASE_URL</code> is configured on
                the server.
              </p>
            ) : null}
            <label className="flex items-center gap-2 text-xs text-slate-500">
              <input
                type="checkbox"
                checked={stayLoggedIn}
                onChange={(e) => setStayLoggedIn(e.target.checked)}
                className="rounded border-white/20"
              />
              Stay signed in
            </label>
            <button
              type="button"
              onClick={handleGuestContinue}
              className="w-full text-xs text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline"
            >
              Continue without account (local only — not saved to cloud)
            </button>
          </div>
        ) : null}

        {phase.status === 'needs_project' ? (
          <div className="space-y-4">
            {user ? (
              <p className="text-sm text-emerald-400/90 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
                Signed in as {user.displayName || user.email || 'user'}
              </p>
            ) : null}
            <p className="text-sm text-slate-400">Choose an active project for this IDE session:</p>
            <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-white/10 bg-black/30 p-1">
              {(projects.length > 0 ? projects : phase.projects).map(
                (p) => (
                  <li key={p.name}>
                    <button
                      type="button"
                      onClick={() => void handleSelectProject(p.name)}
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-200 hover:bg-white/10"
                    >
                      <FolderOpen className="h-4 w-4 shrink-0 text-cyan-400/80" aria-hidden />
                      <span className="truncate">{p.name}</span>
                    </button>
                  </li>
                ),
              )}
            </ul>
            <div className="flex gap-2">
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="New project name"
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-slate-100"
              />
              <button
                type="button"
                onClick={() => void handleCreateProject()}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-3 py-2 text-sm text-cyan-100"
              >
                <Plus className="h-4 w-4" aria-hidden />
                Create
              </button>
            </div>
            <button
              type="button"
              onClick={() => void loadProjectsForPicker()}
              className="text-xs text-slate-500 hover:text-slate-300"
            >
              Refresh project list
            </button>
          </div>
        ) : null}

        {phase.status === 'error' ? (
          <button
            type="button"
            onClick={() => void runEnsure()}
            className="mt-2 w-full rounded-xl border border-white/15 py-2.5 text-sm text-slate-200"
          >
            Retry
          </button>
        ) : null}
      </div>
    </div>
  );
}
