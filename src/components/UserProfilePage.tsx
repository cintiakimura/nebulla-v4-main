import { useCallback, useEffect, useState } from 'react';
import { CreditCard, LogOut, Settings2, Trash2, User, X } from 'lucide-react';
import {
  deleteNebullaAccount,
  fetchSessionUser,
  logoutNebula,
  type NebulaSessionUser,
} from '../lib/nebulaCloud';

function formatIso(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function providerLabel(p: string | undefined): string {
  if (!p) return '—';
  if (p === 'github') return 'GitHub';
  if (p === 'email') return 'Email & password';
  if (p === 'username') return 'Username & password';
  return p;
}

function billingLabel(tier: NebulaSessionUser['billingTier']): string {
  if (tier === 'pro') return 'Pro';
  if (tier === 'power') return 'Power';
  return 'Free';
}

export function UserProfilePage({
  onClose,
  onLoggedOut,
  onAccountDeleted,
  onOpenOnboarding,
}: {
  onClose?: () => void;
  /** After logout — clear workspace / return to sign-in. */
  onLoggedOut: () => void;
  onAccountDeleted: () => void;
  /** Open workspace onboarding (GitHub + keys) on its own page. */
  onOpenOnboarding?: () => void;
}) {
  const [user, setUser] = useState<NebulaSessionUser | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);
  const [logoutBusy, setLogoutBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoadErr(null);
    try {
      const u = await fetchSessionUser();
      setUser(u);
      if (!u) setLoadErr('Not signed in.');
    } catch {
      setLoadErr('Could not load profile.');
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleLogout = async () => {
    setLogoutBusy(true);
    try {
      await logoutNebula();
      onLoggedOut();
    } catch {
      setLoadErr('Logout failed. Try again.');
    } finally {
      setLogoutBusy(false);
    }
  };

  const handleDelete = async () => {
    setDeleteErr(null);
    setDeleteBusy(true);
    try {
      const r = await deleteNebullaAccount(confirmText.trim());
      if (!r.ok) {
        setDeleteErr(r.error || 'Delete failed');
        return;
      }
      onAccountDeleted();
    } catch {
      setDeleteErr('Network error.');
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#020814] text-slate-100">
      <header className="shrink-0 border-b border-white/10 px-5 py-4 md:px-8 flex items-center justify-between bg-[#0a0e14]/85 backdrop-blur-md">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-cyan-900/40 border border-cyan-500/25 shrink-0">
            <User className="h-4 w-4 text-cyan-300" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="font-headline text-lg text-slate-100 tracking-tight truncate">User profile</p>
            <p className="text-xs text-slate-500 truncate">Your account details</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onOpenOnboarding ? (
            <button
              type="button"
              onClick={onOpenOnboarding}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5 hover:text-slate-100"
              title="Workspace onboarding"
            >
              <Settings2 className="h-3.5 w-3.5" aria-hidden />
              Onboarding
            </button>
          ) : null}
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-slate-400 hover:bg-white/5 hover:text-slate-200 transition-colors"
              title="Close"
              aria-label="Close profile"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          ) : null}
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto p-6 md:p-8">
        <div className="max-w-2xl mx-auto space-y-8 animate-in slide-in-from-right-4 duration-300">
          {loadErr && !user ? (
            <p className="text-sm text-red-400">{loadErr}</p>
          ) : null}

          {!user && !loadErr ? (
            <p className="text-sm text-slate-500">Loading profile…</p>
          ) : null}

          {user ? (
            <>
              <section className="rounded-xl border border-white/10 bg-white/5 p-6 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-2">
                  <h3 className="text-sm font-headline text-slate-200">Account</h3>
                  <button
                    type="button"
                    disabled={logoutBusy}
                    onClick={() => void handleLogout()}
                    className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-slate-100 hover:bg-white/10 disabled:opacity-40"
                  >
                    <LogOut className="h-4 w-4" aria-hidden />
                    {logoutBusy ? 'Signing out…' : 'Log out'}
                  </button>
                </div>
                <div className="flex flex-col sm:flex-row gap-6">
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt=""
                      className="w-20 h-20 rounded-full border border-white/10 object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-cyan-900/40 border border-cyan-500/25 flex items-center justify-center text-cyan-200 text-2xl font-headline shrink-0">
                      {(user.displayName || user.email || '?').slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <dl className="flex-1 grid grid-cols-1 gap-3 text-sm">
                    <div>
                      <dt className="text-[10px] uppercase tracking-wider text-slate-500 font-headline">Display name</dt>
                      <dd className="text-slate-200 mt-0.5">{user.displayName || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-wider text-slate-500 font-headline">Session email</dt>
                      <dd className="text-slate-200 mt-0.5 font-mono text-xs break-all">{user.email || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-wider text-slate-500 font-headline">Stored email (account)</dt>
                      <dd className="text-slate-200 mt-0.5 font-mono text-xs break-all">{user.accountEmail || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-wider text-slate-500 font-headline">User id</dt>
                      <dd className="text-slate-300 mt-0.5 font-mono text-xs break-all">{user.uid}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-wider text-slate-500 font-headline">Sign-in method</dt>
                      <dd className="text-slate-200 mt-0.5">{providerLabel(user.provider)}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-wider text-slate-500 font-headline">Provider user id</dt>
                      <dd className="text-slate-300 mt-0.5 font-mono text-xs break-all">{user.providerUserId || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-wider text-slate-500 font-headline">Password on file</dt>
                      <dd className="text-slate-200 mt-0.5">{user.hasPassword ? 'Yes' : 'No'}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-wider text-slate-500 font-headline">Member since</dt>
                      <dd className="text-slate-200 mt-0.5">{formatIso(user.signedUpAt)}</dd>
                    </div>
                  </dl>
                </div>
              </section>

              <section className="rounded-xl border border-white/10 bg-white/5 p-6 space-y-4">
                <h3 className="text-sm font-headline text-slate-200 flex items-center gap-2 border-b border-white/10 pb-2">
                  <CreditCard className="w-4 h-4 text-slate-400" aria-hidden />
                  Billing
                </h3>
                <p className="text-sm text-slate-300">
                  Current plan: <span className="text-cyan-200 font-medium">{billingLabel(user.billingTier)}</span>
                </p>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Stripe billing portal is not enabled yet. When it is, you will manage invoices and payment method here.
                </p>
              </section>

              {onOpenOnboarding ? (
                <section className="rounded-xl border border-white/10 bg-white/5 p-6 space-y-3 sm:hidden">
                  <h3 className="text-sm font-headline text-slate-200">Workspace setup</h3>
                  <p className="text-xs text-slate-400">GitHub connection and API keys live on the Onboarding page.</p>
                  <button
                    type="button"
                    onClick={onOpenOnboarding}
                    className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100"
                  >
                    <Settings2 className="h-4 w-4" aria-hidden />
                    Open onboarding
                  </button>
                </section>
              ) : null}

              <section className="rounded-xl border border-red-500/20 bg-red-950/20 p-6 space-y-4">
                <h3 className="text-sm font-headline text-red-300 flex items-center gap-2">
                  <Trash2 className="w-4 h-4" aria-hidden />
                  Delete account
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  This removes your user record, all cloud projects, and related data from our database. This cannot be
                  undone.
                </p>
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-slate-500 font-headline mb-1.5">
                    Type <span className="text-red-300/90 font-mono">DELETE MY ACCOUNT</span> to confirm
                  </label>
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    autoComplete="off"
                    className="w-full max-w-md bg-black/35 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono focus:border-red-500/40 outline-none"
                    placeholder="DELETE MY ACCOUNT"
                  />
                </div>
                {deleteErr ? <p className="text-sm text-red-400">{deleteErr}</p> : null}
                <button
                  type="button"
                  disabled={deleteBusy || confirmText.trim() !== 'DELETE MY ACCOUNT'}
                  onClick={() => void handleDelete()}
                  className="px-4 py-2 rounded-lg text-sm font-headline border border-red-500/40 bg-red-500/10 text-red-200 hover:bg-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {deleteBusy ? 'Deleting…' : 'Delete my account permanently'}
                </button>
              </section>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
