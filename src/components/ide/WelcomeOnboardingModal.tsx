import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  Github,
  KeyRound,
  Loader2,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import { Logo } from '@/components/Logo';
import { cn } from '@/lib/utils';
import { fetchSessionUser, type NebulaSessionUser } from '../../lib/nebulaCloud';
import { fetchNebulaPublicConfig } from '../../lib/nebulaPublicConfig';
import { getBrowserProjectKey } from '../../lib/nebulaProjectApi';
import { upsertProjectSecret } from '../../lib/nebulaSecretHelpers';
import { formatGithubConnectionStatus } from '../../lib/githubDisplay';
import {
  aiProviderKeysUrl,
  aiProviderLabel,
  aiProviderSecretName,
  markWelcomeOnboardingDone,
  markWelcomeOnboardingSeen,
  markWelcomeOnboardingSessionSkip,
  setPreferredAiProvider,
  type WelcomeAiProvider,
} from '../../lib/nebulaWelcomeOnboarding';
import { dispatchOpenCenterPanel } from './IdeCenterTabsContext';

const QUICK_SETUP: {
  id: WelcomeAiProvider;
  label: string;
  recommended?: boolean;
  href: string;
}[] = [
  { id: 'grok', label: 'Grok / xAI', recommended: true, href: 'https://console.x.ai/' },
  { id: 'claude', label: 'Claude', href: 'https://console.anthropic.com/settings/keys' },
  { id: 'openai', label: 'OpenAI', href: 'https://platform.openai.com/api-keys' },
  { id: 'gemini', label: 'Google Gemini', href: 'https://aistudio.google.com/app/apikey' },
];

type Props = {
  open: boolean;
  user: NebulaSessionUser | null;
  onClose: () => void;
};

/**
 * Friendly first-time setup after login — own API key (Grok recommended), GitHub optional, or skip.
 * Lands on My Projects when finished; does not start Master Plan.
 */
export function WelcomeOnboardingModal({ open, user, onClose }: Props) {
  const [sessionUser, setSessionUser] = useState<NebulaSessionUser | null>(user);
  const [githubReady, setGithubReady] = useState(false);
  const [githubIdConfigured, setGithubIdConfigured] = useState(false);
  const [githubSecretConfigured, setGithubSecretConfigured] = useState(false);
  const [provider, setProvider] = useState<WelcomeAiProvider>('grok');
  const [apiKey, setApiKey] = useState('');
  const [keyMsg, setKeyMsg] = useState<string | null>(null);
  const [keySaved, setKeySaved] = useState(false);
  const [keyBusy, setKeyBusy] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [stayLoggedIn, setStayLoggedIn] = useState(true);

  useEffect(() => {
    if (!open) return;
    markWelcomeOnboardingSeen();
    setSessionUser(user);
    void (async () => {
      const [cfg, u] = await Promise.all([fetchNebulaPublicConfig(), fetchSessionUser()]);
      setGithubReady(Boolean(cfg.githubOAuthReady));
      setGithubIdConfigured(Boolean(cfg.githubClientIdConfigured));
      setGithubSecretConfigured(Boolean(cfg.githubClientSecretConfigured));
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
      setKeyMsg('Paste your API key first — you can always add it later in Settings.');
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
      setKeyMsg(`Saved! ${aiProviderLabel(provider)} is ready for this project.`);
      window.dispatchEvent(new CustomEvent('nebula-secrets-updated'));
    } catch {
      setKeyMsg('Could not save. Check that browser storage is allowed.');
    } finally {
      setKeyBusy(false);
    }
  }, [apiKey, provider]);

  const onSkip = useCallback(() => {
    // Skip: permanent only if "Don't show again" is checked; otherwise this session only.
    finishToMyProjects(dontShowAgain);
  }, [dontShowAgain, finishToMyProjects]);

  const onContinue = useCallback(() => {
    // Primary CTA always completes onboarding (and honors Don't show again).
    finishToMyProjects(true);
  }, [finishToMyProjects]);

  const openMyServices = useCallback(() => {
    finishToMyProjects(dontShowAgain);
    try {
      window.dispatchEvent(new CustomEvent('nebula-open-my-services'));
    } catch {
      /* ignore */
    }
  }, [dontShowAgain, finishToMyProjects]);

  if (!open) return null;

  const keysUrl = aiProviderKeysUrl(provider);

  return (
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-onboarding-title"
    >
      <div className="relative flex max-h-[min(92vh,880px)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0a0e14] shadow-2xl shadow-black/50">
        <div
          className="pointer-events-none absolute inset-0 opacity-45"
          aria-hidden
          style={{
            background:
              'radial-gradient(ellipse 90% 55% at 50% -15%, rgba(34,211,238,0.2), transparent 55%), radial-gradient(ellipse 50% 40% at 100% 0%, rgba(167,139,250,0.08), transparent)',
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

        <div className="relative min-h-0 flex-1 overflow-y-auto px-6 py-7 sm:px-8">
          <div className="space-y-6">
            <header className="flex items-start gap-3 pr-6">
              <Logo className="h-11 w-11 shrink-0" />
              <div className="min-w-0 space-y-2">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-cyan-400/85">
                  Getting started
                </p>
                <h2
                  id="welcome-onboarding-title"
                  className="font-headline text-2xl font-semibold tracking-tight text-slate-50 sm:text-[1.7rem]"
                >
                  Welcome to Nebulla!
                </h2>
              </div>
            </header>

            <section className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
              <p className="text-sm leading-relaxed text-slate-300">
                To give you full control and the best performance, Nebulla uses{' '}
                <strong className="font-semibold text-slate-100">your own AI API key</strong>.
              </p>
              <ul className="space-y-1.5 text-sm text-slate-400">
                <li className="flex gap-2">
                  <span className="text-cyan-400/90" aria-hidden>
                    •
                  </span>
                  <span>You only pay for what you use</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-cyan-400/90" aria-hidden>
                    •
                  </span>
                  <span>No usage limits from us</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-cyan-400/90" aria-hidden>
                    •
                  </span>
                  <span>You can choose the fastest or cheapest model</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-cyan-400/90" aria-hidden>
                    •
                  </span>
                  <span>Your data stays more private</span>
                </li>
              </ul>
              <div className="flex gap-2.5 rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-3 py-2.5">
                <Zap className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" aria-hidden />
                <p className="text-xs leading-relaxed text-cyan-50/95 sm:text-[13px]">
                  We strongly recommend <strong className="font-semibold text-white">Grok (xAI)</strong> for
                  the best coding, reasoning, and speed — but you can also use Claude, OpenAI, Google Gemini,
                  or others if you prefer.
                </p>
              </div>
            </section>

            {/* Quick setup links */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-cyan-300/90" aria-hidden />
                <h3 className="text-sm font-semibold text-slate-100">Get an API key</h3>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {QUICK_SETUP.map((item) => (
                  <a
                    key={item.id}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => {
                      setProvider(item.id);
                      setKeyMsg(null);
                    }}
                    className={cn(
                      'group inline-flex items-center justify-between gap-2 rounded-xl border px-3.5 py-3 text-left text-sm transition',
                      item.recommended
                        ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-50 hover:bg-cyan-500/15'
                        : 'border-white/10 bg-white/[0.03] text-slate-200 hover:border-white/20 hover:bg-white/[0.05]',
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block font-medium">{item.label}</span>
                      {item.recommended ? (
                        <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-wide text-cyan-300/90">
                          Recommended
                        </span>
                      ) : null}
                    </span>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-60 group-hover:opacity-100" />
                  </a>
                ))}
              </div>

              <div className="space-y-2 rounded-xl border border-white/10 bg-black/25 p-3.5">
                <p className="text-xs text-slate-500">
                  Then paste your key below (saved in Secrets for this project). Selected:{' '}
                  <span className="text-slate-300">{aiProviderLabel(provider)}</span>
                  {keysUrl ? (
                    <>
                      {' · '}
                      <a
                        href={keysUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cyan-400/90 underline-offset-2 hover:underline"
                      >
                        Open key page
                      </a>
                    </>
                  ) : null}
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="password"
                    autoComplete="off"
                    value={apiKey}
                    onChange={(e) => {
                      setApiKey(e.target.value);
                      setKeyMsg(null);
                    }}
                    placeholder={`Paste ${aiProviderSecretName(provider)}…`}
                    className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-slate-100 outline-none ring-cyan-500/30 placeholder:text-slate-600 focus:ring"
                  />
                  <button
                    type="button"
                    disabled={keyBusy}
                    onClick={saveApiKey}
                    className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-transparent px-4 py-2.5 text-sm font-medium text-slate-100 transition hover:border-cyan-500/40 hover:text-cyan-100 disabled:opacity-50"
                  >
                    {keyBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    Save key
                  </button>
                </div>
                {keyMsg ? (
                  <p className={cn('text-xs', keySaved ? 'text-emerald-400/90' : 'text-amber-200/90')}>
                    {keyMsg}
                  </p>
                ) : null}
              </div>
            </section>

            {/* GitHub optional */}
            <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-slate-100">
                  <Github className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1 space-y-2.5">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-100">Connect GitHub</h3>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                      Optional — helpful for projects, import, and staying signed in smoothly.
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
                        className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-transparent px-3.5 py-2 text-xs font-medium text-slate-100 transition hover:border-white/30 disabled:opacity-45"
                      >
                        <Github className="h-3.5 w-3.5" />
                        Connect GitHub
                      </button>
                      {!githubReady ? (
                        <span className="text-[11px] leading-snug text-amber-400/90">
                          {githubIdConfigured && !githubSecretConfigured
                            ? 'Add GITHUB_CLIENT_SECRET to your .env (CLIENT_ID alone is not enough), then restart the server.'
                            : 'GitHub OAuth isn’t fully configured yet — set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.'}
                        </span>
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

            {/* Skip */}
            <section className="rounded-xl border border-dashed border-white/10 px-4 py-3.5">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.04] text-slate-400">
                  <Sparkles className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-xs leading-relaxed text-slate-500">
                    <button
                      type="button"
                      onClick={onSkip}
                      className="font-medium text-slate-300 underline-offset-2 hover:text-white hover:underline"
                    >
                      Skip for now
                    </button>
                    {' — '}
                    you can set your API key later in{' '}
                    <button
                      type="button"
                      onClick={openMyServices}
                      className="text-cyan-400/90 underline-offset-2 hover:underline"
                    >
                      Settings
                    </button>
                    .
                  </p>
                  <label className="flex items-center gap-2 text-xs text-slate-500">
                    <input
                      type="checkbox"
                      checked={dontShowAgain}
                      onChange={(e) => setDontShowAgain(e.target.checked)}
                      className="rounded border-white/20"
                    />
                    Don&apos;t show again
                  </label>
                </div>
              </div>
            </section>
          </div>
        </div>

        <div className="relative shrink-0 border-t border-white/10 bg-[#0a0e14]/95 px-6 py-4 sm:px-8">
          <div className="flex flex-col-reverse items-stretch justify-between gap-3 sm:flex-row sm:items-center">
            <p className="text-[11px] leading-snug text-slate-600">
              Ready when you are — My Projects is next. New Project still starts the guided Master Plan.
            </p>
            <button
              type="button"
              onClick={onContinue}
              className="inline-flex shrink-0 items-center justify-center rounded-xl border border-white/15 bg-transparent px-5 py-2.5 text-sm font-semibold text-slate-100 transition hover:border-cyan-500/40 hover:text-cyan-100"
            >
              {keySaved || githubConnected ? 'Continue to My Projects' : 'Go to My Projects'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
