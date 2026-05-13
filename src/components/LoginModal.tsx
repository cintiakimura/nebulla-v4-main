import { useState, useEffect } from 'react';
import { Github, X } from 'lucide-react';
import { LoginOAuthHints } from './LoginOAuthHints';
import { readResponseJson } from '../lib/apiFetch';

type Mode = 'signin' | 'signup' | 'forgot';

export function LoginModal({
  open,
  onClose,
  stayLoggedIn,
  onStayLoggedInChange,
  cloudStorageReady,
  githubOAuthReady,
  onGithubPopupLogin,
  onSignedIn,
}: {
  open: boolean;
  onClose: () => void;
  stayLoggedIn: boolean;
  onStayLoggedInChange: (v: boolean) => void;
  cloudStorageReady: boolean;
  githubOAuthReady: boolean;
  onGithubPopupLogin: () => Promise<boolean>;
  onSignedIn: () => void;
}) {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [projectName, setProjectName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setMode('signin');
      setEmail('');
      setPassword('');
      setConfirm('');
      setProjectName('');
      setError('');
      setBusy(false);
    }
  }, [open]);

  if (!open) return null;

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

  const submitSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!cloudStorageReady) {
      setError('Server database is not configured (DATABASE_URL).');
      return;
    }
    setBusy(true);
    try {
      const { res, data } = await runJson('/api/auth/login', { email: email.trim(), password });
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Sign in failed.');
        return;
      }
      onSignedIn();
      onClose();
    } catch {
      setError('Network error.');
    } finally {
      setBusy(false);
    }
  };

  const submitSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!cloudStorageReady) {
      setError('Server database is not configured (DATABASE_URL).');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const { res, data } = await runJson('/api/auth/register', {
        email: email.trim(),
        password,
        projectName: projectName.trim(),
      });
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Sign up failed.');
        return;
      }
      onSignedIn();
      onClose();
    } catch {
      setError('Network error.');
    } finally {
      setBusy(false);
    }
  };

  const submitForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!cloudStorageReady) {
      setError('Server database is not configured (DATABASE_URL).');
      return;
    }
    setBusy(true);
    try {
      const { res, data } = await runJson('/api/auth/forgot-password', { email: email.trim() });
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Request failed.');
        return;
      }
      window.alert(
        'If an account exists for that email, we sent password reset instructions. Check your inbox (and spam).'
      );
      setMode('signin');
    } catch {
      setError('Network error.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300 p-4">
      <div className="w-full max-w-md glass-panel p-8 rounded-2xl border border-white/10 flex flex-col gap-5 shadow-2xl animate-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-start gap-4">
          <div className="flex flex-col gap-1 min-w-0">
            <h2 className="text-2xl font-headline text-slate-100 font-normal">Sign in to nebulla</h2>
            <p className="text-slate-400 text-sm leading-relaxed">
              Use your email and password, or continue with GitHub. Sessions sync with the hosted API when the cloud
              database is enabled.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-white transition-colors shrink-0 p-1" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex rounded-lg border border-white/10 p-0.5 bg-black/20">
          {(['signin', 'signup', 'forgot'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError('');
              }}
              className={`flex-1 py-2 text-xs font-headline rounded-md transition-colors ${
                mode === m ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {m === 'signin' ? 'Sign in' : m === 'signup' ? 'Create account' : 'Forgot password'}
            </button>
          ))}
        </div>

        {mode === 'forgot' ? (
          <form onSubmit={(e) => void submitForgot(e)} className="flex flex-col gap-4">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-slate-500 font-headline mb-1">
                Email
              </label>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-cyan-500/40 outline-none"
                placeholder="you@example.com"
              />
            </div>
            {error ? <p className="text-sm text-red-400/95">{error}</p> : null}
            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/30 font-headline text-sm disabled:opacity-50"
            >
              {busy ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        ) : (
          <form onSubmit={(e) => void (mode === 'signin' ? submitSignIn(e) : submitSignUp(e))} className="flex flex-col gap-4">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-slate-500 font-headline mb-1">
                Email
              </label>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-cyan-500/40 outline-none"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-slate-500 font-headline mb-1">
                Password
              </label>
              <input
                type="password"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-cyan-500/40 outline-none"
                placeholder={mode === 'signup' ? '10+ chars, letters and numbers' : '••••••••'}
              />
            </div>
            {mode === 'signup' ? (
              <>
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-slate-500 font-headline mb-1">
                    First project name
                  </label>
                  <input
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-cyan-500/40 outline-none"
                    placeholder="My First Project"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-slate-500 font-headline mb-1">
                    Confirm password
                  </label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-cyan-500/40 outline-none"
                  />
                </div>
              </>
            ) : null}
            {error ? <p className="text-sm text-red-400/95">{error}</p> : null}
            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/30 font-headline text-sm disabled:opacity-50"
            >
              {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>
        )}

        <div className="relative py-1">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/10" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-[#040f1a]/90 px-3 text-[10px] uppercase tracking-wider text-slate-500 font-headline">
              Or
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            void onGithubPopupLogin();
          }}
          disabled={!cloudStorageReady || !githubOAuthReady}
          className="w-full py-3 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center gap-3 text-slate-200 hover:bg-white/10 transition-all font-headline disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Github className="w-5 h-5" />
          Continue with GitHub
        </button>

        <label className="flex items-center gap-2 text-xs text-slate-400 px-1">
          <input
            type="checkbox"
            checked={stayLoggedIn}
            onChange={(e) => onStayLoggedInChange(e.target.checked)}
            className="accent-cyan-400"
          />
          Stay logged in on this device
        </label>

        <LoginOAuthHints />

        <div className="pt-2 border-t border-white/5">
          <p className="text-[10px] text-slate-500 text-center leading-relaxed">
            By continuing, you agree to our{' '}
            <a href="/terms" className="text-cyan-400/90 hover:underline" target="_blank" rel="noreferrer">
              Terms of Service
            </a>{' '}
            and{' '}
            <a href="/privacy" className="text-cyan-400/90 hover:underline" target="_blank" rel="noreferrer">
              Privacy Policy
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
