import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

export function SimpleLoginModal({
  open,
  onClose,
  onSignedIn,
}: {
  open: boolean;
  onClose: () => void;
  onSignedIn: (profile: { username: string; password: string }) => void;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');

  useEffect(() => {
    if (!open) {
      setUsername('');
      setPassword('');
      setBusy(false);
      setError('');
      setMode('login');
    }
  }, [open]);

  if (!open) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const trimmed = username.trim();
    if (!trimmed || !password) {
      setError('Username and password are required.');
      return;
    }
    setBusy(true);
    // Local-only profile entry: no backend authentication calls.
    onSignedIn({ username: trimmed, password });
    setBusy(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md glass-panel p-8 rounded-2xl border border-white/10 flex flex-col gap-5 shadow-2xl">
        <div className="flex justify-between items-start gap-4">
          <div>
            <h2 className="text-2xl font-headline text-slate-100 font-normal">Login</h2>
            <p className="text-slate-400 text-sm leading-relaxed">
              Enter a username and password to continue. This is a local app profile form (no backend authentication).
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-white transition-colors p-1" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
          <div className="flex rounded-lg border border-white/10 p-0.5 bg-black/20">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError('');
              }}
              className={`flex-1 py-2 text-xs font-headline rounded-md transition-colors ${
                mode === 'login' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setError('');
              }}
              className={`flex-1 py-2 text-xs font-headline rounded-md transition-colors ${
                mode === 'signup' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Sign up
            </button>
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-slate-500 font-headline mb-1">Username</label>
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-cyan-500/40 outline-none"
              placeholder="your_name"
            />
            <p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed">
              3–32 characters; start with a letter or number; then letters, numbers, underscores, or hyphens.
            </p>
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-slate-500 font-headline mb-1">Password</label>
            <input
              type="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-cyan-500/40 outline-none"
              placeholder="••••••••"
            />
          </div>
          {error ? <p className="text-sm text-red-400/95">{error}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="w-full py-2.5 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/30 font-headline text-sm disabled:opacity-50"
          >
            {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
