import { useState, useMemo } from 'react';
import { LegalPageLayout } from '../components/LegalPageLayout';
import { readResponseJson } from '../lib/apiFetch';

export function ResetPasswordPage() {
  const token = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get('token')?.trim() || '';
    } catch {
      return '';
    }
  }, []);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!token) {
      setError('Missing reset token. Open the link from your email.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token, password }),
      });
      const data = await readResponseJson<{ error?: string }>(res);
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Reset failed.');
        return;
      }
      setDone(true);
    } catch {
      setError('Network error. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <LegalPageLayout title="Reset password" subtitle="Choose a new password for your account">
      {done ? (
        <div className="space-y-4 not-prose">
          <p className="text-slate-300">Your password has been updated. You can sign in with your email and new password.</p>
          <a
            href="/"
            className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/25 font-headline text-sm no-underline"
          >
            Back to nebulla
          </a>
        </div>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="space-y-5 not-prose max-w-md">
          {!token ? (
            <p className="text-amber-400/95 text-sm">This page needs a valid token in the URL. Request a new reset link from the sign-in screen.</p>
          ) : null}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-slate-500 font-headline mb-1">
              New password
            </label>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-cyan-500/40 outline-none"
              placeholder="At least 10 characters, letters + numbers"
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
          {error ? <p className="text-sm text-red-400/95">{error}</p> : null}
          <button
            type="submit"
            disabled={busy || !token}
            className="w-full py-2.5 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/30 font-headline text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? 'Saving…' : 'Update password'}
          </button>
        </form>
      )}
    </LegalPageLayout>
  );
}
