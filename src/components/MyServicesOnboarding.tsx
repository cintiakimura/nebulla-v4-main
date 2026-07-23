import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, Github, KeyRound, Loader2, Sparkles, X } from 'lucide-react';
import { Logo } from './Logo';
import {
  ensureCloudWorkspaceReady,
  fetchSessionUser,
  listCloudProjects,
  type NebulaSessionUser,
} from '../lib/nebulaCloud';
import { getBrowserProjectName } from '../lib/nebulaProjectApi';
import type { NebulaPublicConfig } from '../lib/nebulaPublicConfig';
import { formatGithubConnectionStatus } from '../lib/githubDisplay';
import { getBrowserProjectKey } from '../lib/nebulaProjectApi';
import { getProjectSecretValue, upsertProjectSecret } from '../lib/nebulaSecretHelpers';
import { getStoredV0ApiKey, setStoredV0ApiKey } from '../lib/v0Key';
import { fireSilentProjectManager } from '../lib/projectManagerClient';

const V0_ENV_NAME = 'V0_API_KEY';
const V0_KEYS_URL = 'https://v0.dev/chat/settings/keys';

function SecretNote() {
  return (
    <p className="text-[11px] text-slate-500 leading-relaxed border-t border-white/5 pt-3 mt-1">
      Grok and related AI use your keys from the{' '}
      <span className="text-slate-400">server .env</span> only — they are not collected in this UI. v0 and other
      integrations can still use <span className="text-slate-400">My Projects → Secrets</span> in this browser when
      configured.
    </p>
  );
}

export function MyServicesOnboarding({
  user,
  config,
  onClose,
}: {
  user: NebulaSessionUser | null;
  config: NebulaPublicConfig;
  onClose: () => void;
}) {
  const projectKey = getBrowserProjectKey();
  const cloudOk = Boolean(config.cloudStorageReady);
  const githubOk = Boolean(config.githubOAuthReady);
  const githubConnected = user?.provider === 'github';

  const [stayLoggedIn, setStayLoggedIn] = useState(true);
  const [v0Input, setV0Input] = useState('');
  const [v0Busy, setV0Busy] = useState(false);
  const [v0Msg, setV0Msg] = useState<string | null>(null);
  const [activeCloudProject, setActiveCloudProject] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const u = await fetchSessionUser();
      if (!u) {
        setActiveCloudProject(null);
        return;
      }
      await ensureCloudWorkspaceReady();
      setActiveCloudProject(getBrowserProjectName().trim() || null);
      const rows = await listCloudProjects();
      if (rows.length > 0 && !getBrowserProjectName().trim()) {
        setActiveCloudProject(rows[0].name);
      }
    })();
  }, [user?.uid]);

  useEffect(() => {
    const onOAuth = (ev: MessageEvent) => {
      if (ev.data?.type !== 'OAUTH_AUTH_SUCCESS') return;
      void (async () => {
        await ensureCloudWorkspaceReady();
        setActiveCloudProject(getBrowserProjectName().trim() || null);
      })();
    };
    window.addEventListener('message', onOAuth);
    return () => window.removeEventListener('message', onOAuth);
  }, []);

  const openGitHubOAuth = useCallback(() => {
    const q = stayLoggedIn ? 'remember=1' : 'remember=0';
    window.open(`/api/auth/github?${q}`, 'nebulla_github_oauth', 'width=520,height=720,scrollbars=yes');
  }, [stayLoggedIn]);

  const saveV0 = useCallback(() => {
    setV0Msg(null);
    const v = v0Input.trim();
    if (!v) {
      setV0Msg('Paste your v0 API key first.');
      return;
    }
    setV0Busy(true);
    try {
      upsertProjectSecret(projectKey, V0_ENV_NAME, v, 'api_key');
      setStoredV0ApiKey(v);
      setV0Input('');
      setV0Msg('Saved. V0_API_KEY is in Secrets for UI generation.');
      window.dispatchEvent(new CustomEvent('nebula-v0-key-updated'));
    } catch {
      setV0Msg('Could not save. Check browser storage permissions.');
    } finally {
      setV0Busy(false);
    }
  }, [projectKey, v0Input]);

  const v0OnFile = Boolean(getProjectSecretValue(projectKey, V0_ENV_NAME) ?? getStoredV0ApiKey());

  const handleContinue = useCallback(async () => {
    await fireSilentProjectManager({
      syncAllProjects: true,
    });
    onClose();
  }, [onClose]);

  return (
    <div className="min-h-screen bg-[#020814] text-slate-100 flex flex-col font-body relative overflow-x-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        aria-hidden
        style={{
          backgroundImage:
            'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(94, 168, 255, 0.22), transparent), radial-gradient(ellipse 60% 40% at 100% 0%, rgba(56, 189, 248, 0.08), transparent)',
        }}
      />

      <header className="relative z-10 shrink-0 border-b border-white/10 px-5 py-4 md:px-8 flex items-center justify-between bg-[#0a0e14]/85 backdrop-blur-md">
        <div className="flex items-center gap-3 min-w-0">
          <Logo className="w-9 h-9 shrink-0" />
          <div className="min-w-0">
            <p className="font-headline text-lg text-slate-100 tracking-tight truncate">Settings</p>
            <p className="text-xs text-slate-500 truncate">Connect GitHub and your API keys</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Sparkles className="w-5 h-5 text-cyan-400/70 hidden sm:block" aria-hidden />
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-slate-400 hover:bg-white/5 hover:text-slate-200 transition-colors"
            title="Close"
            aria-label="Close Settings"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </header>

      <main className="relative z-10 flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-5 py-10 md:py-14 md:px-8 flex flex-col gap-10 pb-28">
          <div className="space-y-2">
            <h1 className="text-2xl md:text-3xl font-headline font-normal text-slate-50 tracking-tight">
              Welcome — wire up your workspace
            </h1>
            <p className="text-sm text-slate-400 leading-relaxed">
              A quick, friendly setup. You can change v0 and other secrets anytime under My Projects → Secrets, or reopen
              Account (NB).
            </p>
          </div>

          {/* 1. GitHub */}
          <section className="rounded-2xl border border-white/10 bg-[#121a25]/75 backdrop-blur-sm shadow-xl shadow-black/30 p-6 md:p-8 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-headline text-base text-slate-100 flex items-center gap-2">
                  <Github className="w-5 h-5 text-slate-300 shrink-0" aria-hidden />
                  GitHub connection
                </h2>
                <p className="text-sm text-slate-500 mt-1">Link GitHub for the smoothest Nebula experience.</p>
              </div>
            </div>

            {githubConnected ? (
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" aria-hidden />
                <p className="text-sm text-emerald-100/95 font-medium">{formatGithubConnectionStatus(user)}</p>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-slate-400 leading-relaxed">
                  Sign in with GitHub to connect your account. You can also use email from the sign-in screen — this
                  button opens GitHub in a popup.
                </p>
                <button
                  type="button"
                  onClick={() => void openGitHubOAuth()}
                  disabled={!cloudOk || !githubOk}
                  className="w-full py-3.5 px-4 rounded-xl bg-white text-[#0d1117] font-headline text-[15px] font-medium flex items-center justify-center gap-3 border border-white/20 shadow-lg shadow-black/25 hover:bg-slate-100 transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
                >
                  <Github className="w-6 h-6 shrink-0" aria-hidden />
                  Login with GitHub
                </button>
                {!githubOk && cloudOk ? (
                  <p className="text-xs text-amber-400/90">
                    GitHub OAuth is not configured on this host. Ask your admin for{' '}
                    <code className="text-slate-400">GITHUB_CLIENT_ID</code> /{' '}
                    <code className="text-slate-400">GITHUB_CLIENT_SECRET</code>.
                  </p>
                ) : null}
                <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={stayLoggedIn}
                    onChange={(e) => setStayLoggedIn(e.target.checked)}
                    className="rounded border-white/20 bg-black/40 text-cyan-500 focus:ring-cyan-500/30"
                  />
                  Stay signed in on this device
                </label>
              </div>
            )}
          </section>

          {githubConnected && cloudOk ? (
            <section className="rounded-2xl border border-white/10 bg-[#121a25]/75 p-6 space-y-2">
              <h2 className="font-headline text-base text-slate-100">Active workspace</h2>
              <p className="text-sm text-slate-400">
                Grok coding uses project{' '}
                <code className="text-cyan-300/90">{activeCloudProject || '—'}</code> on every API call (
                <code className="text-slate-400">projectName</code> + <code className="text-slate-400">projectKey</code>
                ).
              </p>
              <p className="text-xs text-slate-500">
                To create or switch projects, close this panel and use the workspace setup dialog (click the project name
                in the top bar).
              </p>
            </section>
          ) : null}

          {/* 2. Grok — server only; no user input */}
          <section className="rounded-2xl border border-white/10 bg-[#121a25]/75 backdrop-blur-sm shadow-xl shadow-black/30 p-6 md:p-8 space-y-4">
            <div className="flex items-start gap-3">
              <KeyRound className="w-5 h-5 text-cyan-400/90 shrink-0 mt-0.5" aria-hidden />
              <div className="min-w-0 space-y-2">
                <h2 className="font-headline text-base text-slate-100">Grok (server configuration)</h2>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Per <span className="text-slate-300">project-execution-rules.md</span>, the main Grok brain uses{' '}
                  <code className="text-cyan-300/90 text-[13px]">MAIN_API_KEY_GROK</code> and related keys from the deployment{' '}
                  <span className="text-slate-300">.env</span> — not from this screen. Ask your operator to set values
                  listed in <span className="text-slate-300">environment-setup.md</span> and restart the server.
                </p>
              </div>
            </div>
            <SecretNote />
          </section>

          {/* 3. v0 */}
          <section className="rounded-2xl border border-white/10 bg-[#121a25]/75 backdrop-blur-sm shadow-xl shadow-black/30 p-6 md:p-8 space-y-5">
            <div>
              <h2 className="font-headline text-base text-slate-100">v0 for the best and accurate UI generation</h2>
              <p className="text-sm text-slate-500 mt-1">Required for the best UI — recommended for every serious build.</p>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-headline text-cyan-200/95">v0 API key (recommended for UI)</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                v0 by Vercel generates high-quality, production-ready UI components and layouts in seconds. By connecting
                your own v0 key you get:
              </p>
              <ul className="text-sm text-slate-300/95 space-y-2 list-none pl-0 border-l-2 border-violet-500/35 pl-4">
                <li>Beautiful, accurate UI from the first generation.</li>
                <li>Full control over your credits and usage.</li>
                <li>The ability to top up credits whenever you need.</li>
              </ul>
              <p className="text-sm text-slate-400 leading-relaxed">
                This significantly reduces manual design and styling work, so you can focus on features instead of fighting
                with UI.
              </p>
            </div>

            <a
              href={V0_KEYS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-violet-400/35 bg-gradient-to-br from-violet-500/20 to-cyan-500/15 py-4 px-5 text-center font-headline text-[15px] text-slate-50 shadow-lg shadow-violet-950/40 hover:from-violet-500/28 hover:to-cyan-500/22 transition-all"
            >
              Open v0 to Get API Key
              <ExternalLink className="w-4 h-4 opacity-90 shrink-0" aria-hidden />
            </a>

            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                void saveV0();
              }}
            >
              <label className="block text-[10px] uppercase tracking-wider text-slate-500 font-headline" htmlFor="v0-key">
                Paste v0 API key (stored as {V0_ENV_NAME})
              </label>
              <input
                id="v0-key"
                type="password"
                autoComplete="off"
                name="v0-api-key"
                value={v0Input}
                onChange={(e) => {
                  setV0Input(e.target.value);
                  setV0Msg(null);
                }}
                className="w-full bg-black/35 border border-white/10 rounded-xl px-3 py-3 text-sm text-slate-200 placeholder:text-slate-600 focus:border-violet-400/40 focus:ring-1 focus:ring-violet-500/25 outline-none"
                placeholder={v0OnFile ? 'Key on file — paste a new key to replace' : 'Your v0 key'}
              />
              {v0OnFile && !v0Input ? (
                <p className="text-xs text-emerald-400/90 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden /> A v0 key is already saved.
                </p>
              ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={v0Busy}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-500/15 text-violet-100 border border-violet-400/35 px-5 py-2.5 text-sm font-headline hover:bg-violet-500/25 transition-colors disabled:opacity-50"
              >
                {v0Busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : null}
                Save Key
              </button>
              {v0Msg ? <p className="text-sm text-slate-400">{v0Msg}</p> : null}
            </div>
            </form>
            <SecretNote />
          </section>

          <div className="rounded-xl border border-white/10 bg-[#0a0e14]/80 p-5 text-xs text-slate-500 leading-relaxed">
            Tip: open <span className="text-slate-400">My Projects → Secrets</span> anytime to view or edit browser-stored
            variables (excluding server-only Grok keys).
          </div>
        </div>

        <div className="sticky bottom-0 left-0 right-0 z-20 border-t border-white/10 bg-[#0a0e14]/95 backdrop-blur-md px-5 py-4 md:px-8">
          <div className="max-w-2xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-xs text-slate-500">You can add or change keys later. Use Back to IDE or the close control when you are done.</p>
            <button
              type="button"
              onClick={() => void handleContinue()}
              className="shrink-0 rounded-xl px-6 py-3 font-headline text-sm text-[#0a0e14] bg-gradient-to-r from-cyan-300 to-sky-400 hover:from-cyan-200 hover:to-sky-300 shadow-lg shadow-cyan-950/30 transition-colors"
            >
              Back to IDE
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
