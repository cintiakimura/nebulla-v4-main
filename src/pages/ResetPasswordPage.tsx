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
          <a href="/" className="btn-cyan inline-flex items-center justify-center no-underline">
            Back to Nebulla
          </a>
        </div>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="not-prose max-w-md space-y-5">
          {!token ? (
            <p className="type-body-dense text-muted-foreground">This page needs a valid token in the URL. Request a new reset link from the sign-in screen.</p>
          ) : null}
          <div>
            <label className="type-micro mb-1 block uppercase tracking-wider">
              New password
            </label>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="ide-glass-input w-full rounded-md px-3 py-2 text-sm outline-none"
              placeholder="At least 8 characters, letters + numbers"
            />
          </div>
          <div>
            <label className="type-micro mb-1 block uppercase tracking-wider">
              Confirm password
            </label>
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="ide-glass-input w-full rounded-md px-3 py-2 text-sm outline-none"
            />
          </div>
          {error ? <p className="type-body-dense text-destructive">{error}</p> : null}
          <button
            type="submit"
            disabled={busy || !token}
            className="btn-cyan w-full disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Update password'}
          </button>
        </form>
      )}
    </LegalPageLayout>
  );
}
