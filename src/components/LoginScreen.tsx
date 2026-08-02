import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, Github, Mail } from 'lucide-react';
import { Logo } from './Logo';
import { readResponseJson } from '../lib/apiFetch';
import { fetchSessionUser } from '../lib/nebulaCloud';

type PublicConfig = {
  cloudStorageReady?: boolean;
  githubOAuthReady?: boolean;
  googleOAuthReady?: boolean;
  databaseConnectionFailed?: boolean;
  databaseUrlConfigured?: boolean;
  databaseUrlLooksTruncated?: boolean;
  databaseFailureHint?: string;
};

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.2 1.3-.9 2.4-1.9 3.1l3.1 2.4c1.8-1.7 2.9-4.2 2.9-7.2 0-.7-.1-1.4-.2-2.1H12z"
      />
      <path
        fill="#34A853"
        d="M6.6 14.3l-.8.6-2.5 1.9C4.9 19.5 8.2 21.6 12 21.6c2.7 0 5-.9 6.7-2.4l-3.1-2.4c-.9.6-2 1-3.6 1-2.8 0-5.1-1.9-5.9-4.4z"
      />
      <path
        fill="#4A90E2"
        d="M3.3 7.2C2.5 8.8 2 10.3 2 12s.5 3.2 1.3 4.8l3.3-2.5c-.2-.6-.3-1.2-.3-2.3 0-1 .1-1.7.3-2.3L3.3 7.2z"
      />
      <path
        fill="#FBBC05"
        d="M12 5.4c1.5 0 2.8.5 3.8 1.5l2.8-2.8C16.9 2.4 14.7 1.5 12 1.5 8.2 1.5 4.9 3.6 3.3 7.2l3.3 2.5C7 7.2 9.2 5.4 12 5.4z"
      />
    </svg>
  );
}

export function LoginScreen({
  onAuthenticated,
  onBack,
  initialEmailMode = 'signin',
  heading,
  subtitle,
}: {
  onAuthenticated: () => void;
  onBack: () => void;
  initialEmailMode?: 'signin' | 'signup';
  /** Optional override for the page title (e.g. free-trial signup). */
  heading?: string;
  /** Optional override for the supporting line under the title. */
  subtitle?: string;
}) {
  const [config, setConfig] = useState<PublicConfig>({});
  const [stayLoggedIn, setStayLoggedIn] = useState(true);
  const [emailOpen, setEmailOpen] = useState(initialEmailMode === 'signup');
  const [emailMode, setEmailMode] = useState<'signin' | 'signup'>(initialEmailMode);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch('/api/config')
      .then((r) => r.json())
      .then((d: PublicConfig) => setConfig(d))
      .catch(() => setConfig({}));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchSessionUser().then((u) => {
      if (!cancelled && u) onAuthenticated();
    });
    return () => {
      cancelled = true;
    };
  }, [onAuthenticated]);

  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin) return;
      if (ev.data?.type === 'OAUTH_AUTH_SUCCESS') {
        void fetchSessionUser().then((u) => {
          if (u) onAuthenticated();
        });
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [onAuthenticated]);

  const cloudOk = Boolean(config.cloudStorageReady);
  const githubOk = Boolean(config.githubOAuthReady);
  const googleOk = Boolean(config.googleOAuthReady);

  const openGitHubOAuth = useCallback(() => {
    const q = stayLoggedIn ? 'remember=1' : 'remember=0';
    window.open(`/api/auth/github?${q}`, 'nebulla_oauth', 'width=520,height=720,scrollbars=yes');
  }, [stayLoggedIn]);

  const openGoogleOAuth = useCallback(() => {
    const q = stayLoggedIn ? 'remember=1' : 'remember=0';
    window.open(`/api/auth/google?${q}`, 'nebulla_oauth', 'width=520,height=720,scrollbars=yes');
  }, [stayLoggedIn]);

  const runJson = async (path: string, body: object) => {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ ...body, remember: stayLoggedIn }),
    });
    const data = await readResponseJson<{ error?: string }>(res);
    return { res, data };
  };

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!cloudOk) {
      setError('Sign-in is unavailable: the server database is not configured.');
      return;
    }
    setBusy(true);
    try {
      if (emailMode === 'signup') {
        const { res, data } = await runJson('/api/auth/register', {
          email: email.trim(),
          password,
        });
        if (!res.ok) {
          setError(typeof data.error === 'string' ? data.error : 'Could not create account.');
          return;
        }
      } else {
        const { res, data } = await runJson('/api/auth/login', { email: email.trim(), password });
        if (!res.ok) {
          setError(typeof data.error === 'string' ? data.error : 'Sign in failed.');
          return;
        }
      }
      onAuthenticated();
    } catch {
      setError('Network error.');
    } finally {
      setBusy(false);
    }
  };

  const submitForgot = async () => {
    setError('');
    if (!cloudOk) {
      setError('Password reset is unavailable: the server database is not configured.');
      return;
    }
    setBusy(true);
    try {
      const { res, data } = await runJson('/api/auth/forgot-password', { email: email.trim() });
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Could not send reset email.');
        return;
      }
      setForgotSent(true);
    } catch {
      setError('Network error.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-screen overflow-y-auto bg-[#020C17] text-slate-100 flex flex-col font-body">
      <header className="shrink-0 border-b border-white/10 px-6 py-4 flex items-center justify-between bg-[#040f1a]/80 backdrop-blur">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-cyan-200 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" aria-hidden />
          Back
        </button>
        <div className="flex items-center gap-2 text-cyan-300">
          <Logo className="w-8 h-8" />
          <span className="font-headline text-lg tracking-tight">nebulla</span>
        </div>
        <span className="w-16" aria-hidden />
      </header>

      <main className="flex-1 flex items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-[420px] flex flex-col gap-8">
          <div className="text-center space-y-2">
            <h1 className="text-2xl md:text-3xl font-headline font-normal text-slate-100 tracking-tight">
              {heading ??
                (emailMode === 'signup' && emailOpen ? 'Create your account' : 'Sign in to continue')}
            </h1>
            <p className="text-sm text-slate-500 leading-relaxed">
              {subtitle ??
                'Continue with GitHub, Google, or email. Your session is stored securely in a browser cookie.'}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#040f1a]/90 backdrop-blur-sm shadow-2xl shadow-black/40 p-8 flex flex-col gap-4">
            <button
              type="button"
              onClick={() => void openGitHubOAuth()}
              disabled={!cloudOk || !githubOk || busy}
              className="w-full py-3.5 px-4 rounded-xl bg-white text-[#0d1117] font-headline text-[15px] font-medium flex items-center justify-center gap-3 border border-white/20 shadow-lg shadow-black/20 hover:bg-slate-100 transition-colors disabled:opacity-45 disabled:cursor-not-allowed disabled:shadow-none"
            >
              <Github className="w-6 h-6 shrink-0" aria-hidden />
              Continue with GitHub
            </button>

            <button
              type="button"
              onClick={() => void openGoogleOAuth()}
              disabled={!cloudOk || !googleOk || busy}
              className="w-full py-3.5 px-4 rounded-xl bg-white text-[#0d1117] font-headline text-[15px] font-medium flex items-center justify-center gap-3 border border-white/20 shadow-lg shadow-black/20 hover:bg-slate-100 transition-colors disabled:opacity-45 disabled:cursor-not-allowed disabled:shadow-none"
            >
              <GoogleIcon className="w-5 h-5 shrink-0" />
              Continue with Google
            </button>

            {!githubOk && cloudOk ? (
              <p className="text-xs text-amber-400/90 text-center leading-relaxed">
                GitHub sign-in is not configured. Set <code className="text-slate-400">GITHUB_CLIENT_ID</code> and{' '}
                <code className="text-slate-400">GITHUB_CLIENT_SECRET</code>, or use Google / email.
              </p>
            ) : null}
            {!googleOk && cloudOk ? (
              <p className="text-xs text-amber-400/90 text-center leading-relaxed">
                Google sign-in is not configured. Set <code className="text-slate-400">GOOGLE_CLIENT_ID</code> and{' '}
                <code className="text-slate-400">GOOGLE_CLIENT_SECRET</code>, or use GitHub / email.
              </p>
            ) : null}
            {!cloudOk && config.databaseConnectionFailed ? (
              <p className="text-xs text-red-400/90 text-center leading-relaxed">
                {config.databaseFailureHint ||
                  (config.databaseUrlLooksTruncated
                    ? 'DATABASE_URL hostname is truncated (dpg-… with no domain) or the Postgres instance was deleted. In Render → PostgreSQL → Connections, copy the full External Database URL (host must end with .REGION-postgres.render.com), paste it into the web service Environment → DATABASE_URL, then Manual Deploy.'
                    : 'PostgreSQL did not connect (DATABASE_URL is set but the server could not reach the database). Check Render → PostgreSQL → Connections (full External URL), then restart. Sign-in is disabled until the database is healthy.')}
              </p>
            ) : !cloudOk ? (
              <p className="text-xs text-red-400/90 text-center leading-relaxed">
                Database is not configured (<code className="text-slate-400">DATABASE_URL</code>). Sign-in is disabled.
              </p>
            ) : null}

            <div className="relative py-1">
              <div className="absolute inset-0 flex items-center" aria-hidden>
                <div className="w-full border-t border-white/10" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-[#040f1a] px-3 text-[11px] uppercase tracking-widest text-slate-500 font-headline">
                  or
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setEmailOpen((v) => !v);
                setError('');
              }}
              disabled={!cloudOk || busy}
              className="w-full py-2.5 rounded-xl border border-white/10 text-slate-300 text-sm font-headline hover:bg-white/5 hover:border-white/15 transition-colors flex items-center justify-center gap-2 disabled:opacity-45 disabled:cursor-not-allowed"
            >
              <Mail className="w-4 h-4 text-slate-500" aria-hidden />
              {emailOpen ? 'Hide email sign-in' : 'Continue with email'}
            </button>

            {emailOpen ? (
              <form onSubmit={(e) => void submitEmail(e)} className="flex flex-col gap-4 pt-1">
                <div className="flex rounded-lg border border-white/10 p-0.5 bg-black/25">
                  <button
                    type="button"
                    onClick={() => {
                      setEmailMode('signin');
                      setError('');
                    }}
                    className={`flex-1 py-2 text-xs font-headline rounded-md transition-colors ${
                      emailMode === 'signin' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEmailMode('signup');
                      setError('');
                    }}
                    className={`flex-1 py-2 text-xs font-headline rounded-md transition-colors ${
                      emailMode === 'signup' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    Create account
                  </button>
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-slate-500 font-headline mb-1.5">
                    Email
                  </label>
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-black/35 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 outline-none"
                    placeholder="you@example.com"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-slate-500 font-headline mb-1.5">
                    Password
                  </label>
                  <input
                    type="password"
                    autoComplete={emailMode === 'signup' ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-black/35 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 outline-none"
                    placeholder={emailMode === 'signup' ? '8+ chars, letters and numbers' : 'Your password'}
                    required
                    minLength={emailMode === 'signup' ? 8 : undefined}
                  />
                </div>
                {emailMode === 'signin' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setForgotOpen((v) => !v);
                      setForgotSent(false);
                      setError('');
                    }}
                    className="text-xs text-cyan-500/80 hover:text-cyan-400 hover:underline self-end"
                  >
                    {forgotOpen ? 'Hide password reset' : 'Forgot password?'}
                  </button>
                ) : null}
                {forgotOpen && emailMode === 'signin' ? (
                  <div className="rounded-lg border border-white/10 bg-black/25 p-3 space-y-3">
                    {forgotSent ? (
                      <p className="text-xs text-slate-300 leading-relaxed">
                        If an account exists for that email, a reset link was sent (or logged on the server in
                        development).
                      </p>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-xs text-slate-500 leading-relaxed">
                          We will email a reset link for email/password accounts.
                        </p>
                        <button
                          type="button"
                          onClick={() => void submitForgot()}
                          disabled={busy || !cloudOk || !email.trim()}
                          className="w-full py-2 rounded-lg border border-cyan-500/30 text-cyan-200 text-xs font-headline hover:bg-cyan-500/15 disabled:opacity-50"
                        >
                          {busy ? 'Sending…' : 'Send reset link'}
                        </button>
                      </div>
                    )}
                  </div>
                ) : null}
                {error ? <p className="text-sm text-red-400/95">{error}</p> : null}
                <button
                  type="submit"
                  disabled={busy || !cloudOk}
                  className="w-full py-3 rounded-xl bg-cyan-500/15 text-cyan-200 border border-cyan-500/35 font-headline text-sm hover:bg-cyan-500/25 transition-colors disabled:opacity-50"
                >
                  {busy ? 'Please wait…' : emailMode === 'signin' ? 'Sign in with email' : 'Create account'}
                </button>
              </form>
            ) : null}

            <label className="flex items-center justify-center gap-2 text-xs text-slate-500 cursor-pointer select-none pt-1">
              <input
                type="checkbox"
                checked={stayLoggedIn}
                onChange={(e) => setStayLoggedIn(e.target.checked)}
                className="rounded border-white/20 bg-black/40 text-cyan-500 focus:ring-cyan-500/30"
              />
              Stay signed in on this device
            </label>
          </div>

          <p className="text-center text-[11px] text-slate-600 leading-relaxed px-2">
            By continuing you agree to our{' '}
            <a href="/terms" className="text-cyan-500/80 hover:text-cyan-400 hover:underline" target="_blank" rel="noreferrer">
              Terms
            </a>{' '}
            and{' '}
            <a href="/privacy" className="text-cyan-500/80 hover:text-cyan-400 hover:underline" target="_blank" rel="noreferrer">
              Privacy Policy
            </a>
            .
          </p>
        </div>
      </main>
    </div>
  );
}
