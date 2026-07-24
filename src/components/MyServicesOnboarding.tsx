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
import {
  GROK_CONSOLE_URL,
  hasLocalGrokApiKey,
  isPlausibleGrokApiKey,
  setStoredGrokApiKey,
} from '../lib/grokUserKey';
import { getProjectSecretValue, upsertProjectSecret } from '../lib/nebulaSecretHelpers';
import { setPreferredAiProvider } from '../lib/nebulaWelcomeOnboarding';
import { getStoredV0ApiKey, setStoredV0ApiKey } from '../lib/v0Key';
import { fireSilentProjectManager } from '../lib/projectManagerClient';

const V0_ENV_NAME = 'V0_API_KEY';
const V0_KEYS_URL = 'https://v0.dev/chat/settings/keys';

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
  const [grokInput, setGrokInput] = useState('');
  const [v0Input, setV0Input] = useState('');
  const [grokBusy, setGrokBusy] = useState(false);
  const [v0Busy, setV0Busy] = useState(false);
  const [grokMsg, setGrokMsg] = useState<string | null>(null);
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

  const saveGrok = useCallback(() => {
    setGrokMsg(null);
    const v = grokInput.trim();
    if (!isPlausibleGrokApiKey(v)) {
      setGrokMsg(v ? 'That key looks too short. Paste the full xAI key.' : 'Paste your Grok API key first.');
      return;
    }
    setGrokBusy(true);
    try {
      setStoredGrokApiKey(v);
      setPreferredAiProvider('grok');
      setGrokInput('');
      setGrokMsg('Saved. Grok is ready for chat, architecture, and coding.');
      window.dispatchEvent(new CustomEvent('nebula-secrets-updated'));
    } catch {
      setGrokMsg('Could not save. Check browser storage permissions.');
    } finally {
      setGrokBusy(false);
    }
  }, [grokInput]);

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
      setV0Msg('Saved. V0_API_KEY is ready for UI generation.');
      window.dispatchEvent(new CustomEvent('nebula-v0-key-updated'));
      window.dispatchEvent(new CustomEvent('nebula-secrets-updated'));
    } catch {
      setV0Msg('Could not save. Check browser storage permissions.');
    } finally {
      setV0Busy(false);
    }
  }, [projectKey, v0Input]);

  const grokOnFile = hasLocalGrokApiKey();
  const v0OnFile = Boolean(getProjectSecretValue(projectKey, V0_ENV_NAME) ?? getStoredV0ApiKey());

  const handleContinue = useCallback(async () => {
    await fireSilentProjectManager({
      syncAllProjects: true,
    });
    onClose();
  }, [onClose]);

  return (
    <div className="min-h-screen bg-[var(--surface)] text-foreground flex flex-col font-body relative overflow-x-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        aria-hidden
        style={{
          backgroundImage:
            'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(108, 99, 255, 0.22), transparent)',
        }}
      />

      <header className="relative z-10 shrink-0 border-b border-border px-5 py-4 md:px-8 flex items-center justify-between bg-[var(--surface-container)]/85 backdrop-blur-md">
        <div className="flex items-center gap-3 min-w-0">
          <Logo className="w-9 h-9 shrink-0" />
          <div className="min-w-0">
            <p className="font-headline text-lg text-foreground tracking-tight truncate">Onboarding</p>
            <p className="text-xs text-muted-foreground truncate">GitHub, Grok, and V0 keys</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Sparkles className="w-5 h-5 text-primary/70 hidden sm:block" aria-hidden />
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-border text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
            title="Close"
            aria-label="Close Onboarding"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </header>

      <main className="relative z-10 flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-5 py-10 md:py-14 md:px-8 flex flex-col gap-8 pb-28">
          <div className="space-y-2">
            <h1 className="text-2xl md:text-3xl font-headline font-normal text-foreground tracking-tight">
              Keys &amp; connections
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Nebulla uses your own AI keys for full power. Edit them here anytime — also available under My Projects →
              Secrets. Account details live on your User profile (NB).
            </p>
          </div>

          {/* GitHub */}
          <section className="rounded-2xl border border-border bg-[var(--surface-bright)]/80 backdrop-blur-sm shadow-xl shadow-black/30 p-6 md:p-8 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-headline text-base text-foreground flex items-center gap-2">
                  <Github className="w-5 h-5 shrink-0" aria-hidden />
                  GitHub connection
                </h2>
                <p className="text-sm text-muted-foreground mt-1">Optional — smoother sign-in and project import.</p>
              </div>
            </div>

            {githubConnected ? (
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--success)]/25 bg-[var(--success)]/10 px-4 py-3">
                <CheckCircle2 className="w-5 h-5 text-[var(--success)] shrink-0" aria-hidden />
                <p className="text-sm text-foreground font-medium">{formatGithubConnectionStatus(user)}</p>
              </div>
            ) : (
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => void openGitHubOAuth()}
                  disabled={!cloudOk || !githubOk}
                  className="w-full py-3.5 px-4 rounded-xl bg-foreground text-[var(--surface)] font-headline text-[15px] font-medium flex items-center justify-center gap-3 border border-border shadow-lg shadow-black/25 hover:opacity-90 transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
                >
                  <Github className="w-6 h-6 shrink-0" aria-hidden />
                  Login with GitHub
                </button>
                {!githubOk ? (
                  <p className="text-xs text-amber-400/90">
                    GitHub OAuth needs both <code className="text-muted-foreground">GITHUB_CLIENT_ID</code> and{' '}
                    <code className="text-muted-foreground">GITHUB_CLIENT_SECRET</code> on the server.
                  </p>
                ) : null}
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={stayLoggedIn}
                    onChange={(e) => setStayLoggedIn(e.target.checked)}
                    className="rounded border-border bg-[var(--surface)] text-primary focus:ring-primary/30"
                  />
                  Stay signed in on this device
                </label>
              </div>
            )}
          </section>

          {githubConnected && cloudOk ? (
            <section className="rounded-2xl border border-border bg-[var(--surface-bright)]/80 p-6 space-y-2">
              <h2 className="font-headline text-base text-foreground">Active workspace</h2>
              <p className="text-sm text-muted-foreground">
                Coding uses project <code className="text-primary">{activeCloudProject || '—'}</code>.
              </p>
            </section>
          ) : null}

          {/* Grok required */}
          <section className="rounded-2xl border border-border bg-[var(--surface-bright)]/80 backdrop-blur-sm shadow-xl shadow-black/30 p-6 md:p-8 space-y-5">
            <div className="flex items-start gap-3">
              <KeyRound className="w-5 h-5 text-primary shrink-0 mt-0.5" aria-hidden />
              <div className="min-w-0 space-y-2">
                <h2 className="font-headline text-base text-foreground">Grok API key (required)</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Powers conversation, architecture, and coding. Get a key from the{' '}
                  <a
                    href={GROK_CONSOLE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                  >
                    xAI console
                    <ExternalLink className="w-3 h-3" aria-hidden />
                  </a>
                  .
                </p>
              </div>
            </div>
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                void saveGrok();
              }}
            >
              <input
                type="password"
                autoComplete="off"
                value={grokInput}
                onChange={(e) => {
                  setGrokInput(e.target.value);
                  setGrokMsg(null);
                }}
                className="w-full bg-[var(--surface)] border border-border rounded-xl px-3 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:ring-1 focus:ring-primary/30 outline-none"
                placeholder={grokOnFile ? 'Key on file — paste a new key to replace' : 'Paste your Grok / xAI API key'}
              />
              {grokOnFile && !grokInput ? (
                <p className="text-xs text-[var(--success)] flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden /> A Grok key is already saved.
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={grokBusy}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground px-5 py-2.5 text-sm font-headline hover:brightness-110 transition disabled:opacity-50"
                >
                  {grokBusy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : null}
                  Save Grok key
                </button>
                {grokMsg ? <p className="text-sm text-muted-foreground">{grokMsg}</p> : null}
              </div>
            </form>
          </section>

          {/* V0 optional */}
          <section className="rounded-2xl border border-border bg-[var(--surface-bright)]/80 backdrop-blur-sm shadow-xl shadow-black/30 p-6 md:p-8 space-y-5">
            <div>
              <h2 className="font-headline text-base text-foreground">V0 API key (optional)</h2>
              <p className="text-sm text-muted-foreground mt-1">
                For high-quality UI generation. Skip anytime — Nebulla works without it.
              </p>
            </div>

            <a
              href={V0_KEYS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-primary/35 bg-primary/10 py-3.5 px-5 text-center font-headline text-[15px] text-foreground hover:bg-primary/15 transition-all"
            >
              Open v0 to get an API key
              <ExternalLink className="w-4 h-4 opacity-90 shrink-0" aria-hidden />
            </a>

            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                void saveV0();
              }}
            >
              <input
                type="password"
                autoComplete="off"
                value={v0Input}
                onChange={(e) => {
                  setV0Input(e.target.value);
                  setV0Msg(null);
                }}
                className="w-full bg-[var(--surface)] border border-border rounded-xl px-3 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:ring-1 focus:ring-primary/30 outline-none"
                placeholder={v0OnFile ? 'Key on file — paste a new key to replace' : 'Your v0 key'}
              />
              {v0OnFile && !v0Input ? (
                <p className="text-xs text-[var(--success)] flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden /> A v0 key is already saved.
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={v0Busy}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-primary/35 bg-primary/15 text-primary px-5 py-2.5 text-sm font-headline hover:bg-primary/25 transition-colors disabled:opacity-50"
                >
                  {v0Busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : null}
                  Save V0 key
                </button>
                {v0Msg ? <p className="text-sm text-muted-foreground">{v0Msg}</p> : null}
              </div>
            </form>
          </section>

          <p className="text-xs text-muted-foreground leading-relaxed">
            Tip: you pay xAI and V0 separately for what you use. Nebulla does not mark up those provider bills.
          </p>
        </div>

        <div className="sticky bottom-0 left-0 right-0 z-20 border-t border-border bg-[var(--surface-container)]/95 backdrop-blur-md px-5 py-4 md:px-8">
          <div className="max-w-2xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-xs text-muted-foreground">You can change keys anytime. Close when you are done.</p>
            <button
              type="button"
              onClick={() => void handleContinue()}
              className="shrink-0 rounded-xl px-6 py-3 font-headline text-sm text-primary-foreground bg-primary hover:brightness-110 shadow-lg shadow-black/30 transition-colors"
            >
              Back to IDE
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
