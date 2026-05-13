import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, Github, Mail } from 'lucide-react';
import { Logo } from './Logo';
import { readResponseJson } from '../lib/apiFetch';
import { fetchSessionUser } from '../lib/nebulaCloud';

type PublicConfig = {
  cloudStorageReady?: boolean;
  githubOAuthReady?: boolean;
  databaseConnectionFailed?: boolean;
  databaseUrlConfigured?: boolean;
};

export function LoginScreen({
  onAuthenticated,
  onBack,
}: {
  onAuthenticated: () => void;
  onBack: () => void;
}) {
  const [config, setConfig] = useState<PublicConfig>({});
  const [stayLoggedIn, setStayLoggedIn] = useState(true);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailMode, setEmailMode] = useState<'signin' | 'signup'>('signin');
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

  const openGitHubOAuth = useCallback(() => {
    const q = stayLoggedIn ? 'remember=1' : 'remember=0';
    window.open(`/api/auth/github?${q}`, 'nebulla_github_oauth', 'width=520,height=720,scrollbars=yes');
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

  return (
    <div className="min-h-screen bg-[#020C17] text-slate-100 flex flex-col font-body">
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
              Sign in to continue
            </h1>
            <p className="text-sm text-slate-500 leading-relaxed">
              Use GitHub for the fastest setup, or email if you prefer. Your session is stored securely in a
              browser cookie.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#040f1a]/90 backdrop-blur-sm shadow-2xl shadow-black/40 p-8 flex flex-col gap-6">
            <button
              type="button"
              onClick={() => void openGitHubOAuth()}
              disabled={!cloudOk || !githubOk || busy}
              className="w-full py-3.5 px-4 rounded-xl bg-white text-[#0d1117] font-headline text-[15px] font-medium flex items-center justify-center gap-3 border border-white/20 shadow-lg shadow-black/20 hover:bg-slate-100 transition-colors disabled:opacity-45 disabled:cursor-not-allowed disabled:shadow-none"
            >
              <Github className="w-6 h-6 shrink-0" aria-hidden />
              Continue with GitHub
            </button>
            {!githubOk && cloudOk ? (
              <p className="text-xs text-amber-400/90 text-center leading-relaxed">
                GitHub sign-in is not configured on this server. Ask the host to set{' '}
                <code className="text-slate-400">GITHUB_CLIENT_ID</code> and{' '}
                <code className="text-slate-400">GITHUB_CLIENT_SECRET</code>, or use email below.
              </p>
            ) : null}
            {!cloudOk && config.databaseConnectionFailed ? (
              <p className="text-xs text-red-400/90 text-center leading-relaxed">
                PostgreSQL did not connect (<code className="text-slate-400">DATABASE_URL</code> is set but the server could not
                reach the database). Check the URL in Render → PostgreSQL → Connections (use the full External URL), then restart
                the server. Sign-in is disabled until the database is healthy.
              </p>
            ) : !cloudOk ? (
              <p className="text-xs text-red-400/90 text-center leading-relaxed">
                Database is not configured (<code className="text-slate-400">DATABASE_URL</code>). Sign-in is disabled.
              </p>
            ) : null}

            <div className="relative">
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
              className="w-full py-2.5 rounded-xl border border-white/10 text-slate-300 text-sm font-headline hover:bg-white/5 hover:border-white/15 transition-colors flex items-center justify-center gap-2"
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
                    placeholder="Your password"
                  />
                </div>
                {error ? <p className="text-sm text-red-400/95">{error}</p> : null}
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full py-3 rounded-xl bg-cyan-500/15 text-cyan-200 border border-cyan-500/35 font-headline text-sm hover:bg-cyan-500/25 transition-colors disabled:opacity-50"
                >
                  {busy ? 'Please wait…' : emailMode === 'signin' ? 'Sign in with email' : 'Create account'}
                </button>
              </form>
            ) : null}

            <label className="flex items-center justify-center gap-2 text-xs text-slate-500 cursor-pointer select-none">
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
