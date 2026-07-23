import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Github,
  KeyRound,
  Loader2,
  Sparkles,
  X,
} from 'lucide-react';
import { Logo } from '@/components/Logo';
import { cn } from '@/lib/utils';
import { fetchSessionUser, type NebulaSessionUser } from '../../lib/nebulaCloud';
import { fetchNebulaPublicConfig } from '../../lib/nebulaPublicConfig';
import { getBrowserProjectKey } from '../../lib/nebulaProjectApi';
import { upsertProjectSecret } from '../../lib/nebulaSecretHelpers';
import { formatGithubConnectionStatus } from '../../lib/githubDisplay';
import {
  aiProviderLabel,
  aiProviderSecretName,
  markWelcomeOnboardingDone,
  markWelcomeOnboardingSeen,
  markWelcomeOnboardingSessionSkip,
  setPreferredAiProvider,
  type WelcomeAiProvider,
} from '../../lib/nebulaWelcomeOnboarding';
import { dispatchOpenCenterPanel } from './IdeCenterTabsContext';

const PROVIDERS: WelcomeAiProvider[] = ['grok', 'claude', 'openai', 'other'];

type Props = {
  open: boolean;
  user: NebulaSessionUser | null;
  onClose: () => void;
};

/**
 * Friendly first-time setup after login — GitHub (optional), AI key, or skip.
 * Lands on My Projects when finished; does not start Master Plan.
 */
export function WelcomeOnboardingModal({ open, user, onClose }: Props) {
  const [sessionUser, setSessionUser] = useState<NebulaSessionUser | null>(user);
  const [githubReady, setGithubReady] = useState(false);
  const [provider, setProvider] = useState<WelcomeAiProvider>('grok');
  const [apiKey, setApiKey] = useState('');
  const [keyMsg, setKeyMsg] = useState<string | null>(null);
  const [keySaved, setKeySaved] = useState(false);
  const [keyBusy, setKeyBusy] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(true);
  const [stayLoggedIn, setStayLoggedIn] = useState(true);

  useEffect(() => {
    if (!open) return;
    markWelcomeOnboardingSeen();
    setSessionUser(user);
    void (async () => {
      const [cfg, u] = await Promise.all([fetchNebulaPublicConfig(), fetchSessionUser()]);
      setGithubReady(Boolean(cfg.githubOAuthReady));
      if (u) setSessionUser(u);
    })();
  }, [open, user]);

  useEffect(() => {
    if (!open) return;
    const onOAuth = (ev: MessageEvent) => {
      if (ev.data?.type !== 'OAUTH_AUTH_SUCCESS') return;
      void fetchSessionUser().then((u) => {
        if (u) setSessionUser(u);
      });
    };
    window.addEventListener('message', onOAuth);
    return () => window.removeEventListener('message', onOAuth);
  }, [open]);

  const githubConnected = sessionUser?.provider === 'github';
  const githubStatus = formatGithubConnectionStatus(sessionUser);

  const finishToMyProjects = useCallback(
    (permanent: boolean) => {
      if (permanent) {
        markWelcomeOnboardingDone();
      } else {
        markWelcomeOnboardingSessionSkip();
      }
      dispatchOpenCenterPanel('projects');
      onClose();
    },
    [onClose],
  );

  const openGitHubOAuth = useCallback(() => {
    const q = stayLoggedIn ? 'remember=1' : 'remember=0';
    window.open(`/api/auth/github?${q}`, 'nebulla_github_oauth', 'width=520,height=720,scrollbars=yes');
  }, [stayLoggedIn]);

  const saveApiKey = useCallback(() => {
    setKeyMsg(null);
    const value = apiKey.trim();
    if (!value) {
      setKeyMsg('Paste your API key first — you can always add it later in Secrets.');
      return;
    }
    if (value.length < 8) {
      setKeyMsg('That looks too short. Double-check you copied the full key.');
      return;
    }
    setKeyBusy(true);
    try {
      const projectKey = getBrowserProjectKey();
      const secretName = aiProviderSecretName(provider);
      upsertProjectSecret(projectKey, secretName, value, 'api_key');
      setPreferredAiProvider(provider);
      setApiKey('');
      setKeySaved(true);
      setKeyMsg(`Saved ${secretName} to Secrets for this project. Nice work!`);
      window.dispatchEvent(new CustomEvent('nebula-secrets-updated'));
    } catch {
      setKeyMsg('Could not save. Check that browser storage is allowed.');
    } finally {
      setKeyBusy(false);
    }
  }, [apiKey, provider]);

  const onSkip = useCallback(() => {
    finishToMyProjects(dontShowAgain);
  }, [dontShowAgain, finishToMyProjects]);

  const onContinue = useCallback(() => {
    finishToMyProjects(true);
  }, [finishToMyProjects]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-onboarding-title"
    >
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-[#0a0e14] shadow-2xl shadow-black/50">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          aria-hidden
          style={{
            background:
              'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(34,211,238,0.18), transparent)',
          }}
        />

        <button
          type="button"
          onClick={onSkip}
          className="absolute right-3 top-3 z-10 rounded-lg p-1.5 text-slate-500 transition hover:bg-white/5 hover:text-slate-200"
          aria-label="Close welcome"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="relative space-y-6 px-6 py-7 sm:px-8">
          <header className="flex items-start gap-3">
            <Logo className="h-10 w-10 shrink-0" />
            <div className="min-w-0 space-y-1.5">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-cyan-400/80">
                Getting started
              </p>
              <h2
                id="welcome-onboarding-title"
                className="font-headline text-2xl font-semibold tracking-tight text-slate-50"
              >
                Welcome to Nebulla!
              </h2>
              <p className="text-sm leading-relaxed text-slate-400">
                Let&apos;s get you set up in under 60 seconds so you can start building.
              </p>
            </div>
          </header>

          <div className="space-y-3">
            {/* 1. GitHub */}
            <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-slate-100">
                  <Github className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1 space-y-2">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-100">Connect GitHub</h3>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                      Optional — link your account for a smoother path to import and export projects later.
                    </p>
                  </div>
                  {githubConnected ? (
                    <p className="inline-flex items-center gap-1.5 text-xs text-emerald-400/90">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {githubStatus || 'GitHub connected'}
                    </p>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={!githubReady}
                        onClick={openGitHubOAuth}
                        className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-medium text-[#0d1117] disabled:opacity-45"
                      >
                        <Github className="h-3.5 w-3.5" />
                        Connect GitHub
                      </button>
                      {!githubReady ? (
                        <span className="text-[11px] text-amber-400/90">GitHub OAuth isn&apos;t configured yet.</span>
                      ) : null}
                    </div>
                  )}
                  {!githubConnected ? (
                    <label className="flex items-center gap-2 text-[11px] text-slate-500">
                      <input
                        type="checkbox"
                        checked={stayLoggedIn}
                        onChange={(e) => setStayLoggedIn(e.target.checked)}
                        className="rounded border-white/20"
                      />
                      Stay signed in after connecting
                    </label>
                  ) : null}
                </div>
              </div>
            </section>

            {/* 2. AI API Key */}
            <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-300">
                  <KeyRound className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1 space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-100">Add AI API Key</h3>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                      Pick your model and paste a key. We save it to Secrets for this project — you can change it anytime.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {PROVIDERS.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => {
                          setProvider(p);
                          setKeyMsg(null);
                        }}
                        className={cn(
                          'rounded-lg border px-2.5 py-1 text-[11px] font-medium transition',
                          provider === p
                            ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-100'
                            : 'border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-200',
                        )}
                      >
                        {aiProviderLabel(p)}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      autoComplete="off"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={`${aiProviderSecretName(provider)}…`}
                      className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-slate-100 outline-none ring-cyan-500/30 placeholder:text-slate-600 focus:ring"
                    />
                    <button
                      type="button"
                      disabled={keyBusy}
                      onClick={saveApiKey}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-3 py-2 text-xs font-medium text-cyan-100 hover:bg-cyan-500/25 disabled:opacity-50"
                    >
                      {keyBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      Save
                    </button>
                  </div>
                  {keyMsg ? (
                    <p
                      className={cn(
                        'text-xs',
                        keySaved ? 'text-emerald-400/90' : 'text-amber-200/90',
                      )}
                    >
                      {keyMsg}
                    </p>
                  ) : null}
                </div>
              </div>
            </section>

            {/* 3. Skip */}
            <section className="rounded-xl border border-dashed border-white/10 bg-transparent p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.04] text-slate-400">
                  <Sparkles className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1 space-y-2">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-100">Skip for now</h3>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                      No problem — jump straight to My Projects. You can connect services anytime from the sidebar.
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-slate-500">
                    <input
                      type="checkbox"
                      checked={dontShowAgain}
                      onChange={(e) => setDontShowAgain(e.target.checked)}
                      className="rounded border-white/20"
                    />
                    Don&apos;t show this again
                  </label>
                  <button
                    type="button"
                    onClick={onSkip}
                    className="text-xs text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline"
                  >
                    Skip and go to My Projects
                  </button>
                </div>
              </div>
            </section>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-white/5 pt-4">
            <p className="text-[11px] text-slate-600">
              When you&apos;re ready, New Project still starts the guided Master Plan — one question at a time.
            </p>
            <button
              type="button"
              onClick={onContinue}
              className="shrink-0 rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-cyan-500"
            >
              {keySaved || githubConnected ? 'Continue to My Projects' : 'Go to My Projects'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
