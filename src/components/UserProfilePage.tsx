import { useCallback, useEffect, useState } from 'react';
import { CreditCard, Download, KeyRound, LogOut, Trash2, X } from 'lucide-react';
import {
  deleteNebullaAccount,
  downloadNebullaDataExport,
  fetchSessionUser,
  logoutNebula,
  type NebulaSessionUser,
} from '../lib/nebulaCloud';
import { LanguageSettingsPanel } from '@/components/settings/LanguageSettingsPanel';
import { AccountProjectSettings } from '@/components/account/AccountProjectSettings';
import { dispatchOpenCenterPanel } from '@/components/ide/IdeCenterTabsContext';

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
  onRequestSignIn,
  projectName,
  onProjectNameChange,
  activeProjectKey,
}: {
  onClose?: () => void;
  /** After logout — clear workspace / return to sign-in. */
  onLoggedOut: () => void;
  onAccountDeleted: () => void;
  /** Close Account and return to the workspace sign-in gate. */
  onRequestSignIn?: () => void;
  projectName: string;
  onProjectNameChange: (name: string) => void;
  activeProjectKey: string;
}) {
  const [user, setUser] = useState<NebulaSessionUser | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoadErr(null);
    setLoading(true);
    try {
      const u = await fetchSessionUser();
      setUser(u);
      if (!u) setLoadErr('Not signed in.');
    } catch {
      setLoadErr('Could not load profile.');
    } finally {
      setLoading(false);
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

  const openSecrets = () => {
    onClose?.();
    dispatchOpenCenterPanel('secrets');
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-transparent text-foreground">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <p className="text-base font-normal tracking-tight text-foreground">Settings</p>
          <p className="text-xs text-muted-foreground">Profile, language, billing</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {user ? (
            <button
              type="button"
              disabled={logoutBusy}
              onClick={() => void handleLogout()}
              className="btn-cyan inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs disabled:opacity-40"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden />
              {logoutBusy ? 'Signing out…' : 'Log out'}
            </button>
          ) : null}
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary-surface flex h-9 w-9 items-center justify-center rounded-lg"
              title="Close"
              aria-label="Close settings"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-xl space-y-5">
          {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}

          {!loading && !user ? (
            <section className="space-y-3 rounded-xl border border-border bg-black/40 p-5">
              {loadErr ? <p className="text-sm text-red-300">{loadErr}</p> : null}
              <p className="text-sm text-muted-foreground">Sign in to manage your session and billing.</p>
              <button
                type="button"
                onClick={() => {
                  onClose?.();
                  onRequestSignIn?.();
                }}
                className="btn-cyan inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm"
              >
                Sign in
              </button>
            </section>
          ) : null}

          {user ? (
            <>
              <section className="space-y-4 rounded-xl border border-border bg-black/40 p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt=""
                      className="h-14 w-14 shrink-0 rounded-full border border-cyan-500/25 object-cover"
                    />
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-cyan-500/30 bg-cyan-500/10 text-lg text-cyan-100">
                      {(user.displayName || user.email || '?').slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <dl className="grid min-w-0 flex-1 gap-2 text-sm">
                    <div>
                      <dt className="text-[11px] text-muted-foreground">Name</dt>
                      <dd className="text-foreground">{user.displayName || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-muted-foreground">Email</dt>
                      <dd className="break-all text-foreground">{user.email || user.accountEmail || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-muted-foreground">Sign-in</dt>
                      <dd className="text-foreground">
                        {providerLabel(user.provider)}
                        {user.hasPassword ? ' · password on file' : ''}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-muted-foreground">Member since</dt>
                      <dd className="text-foreground">{formatIso(user.signedUpAt)}</dd>
                    </div>
                  </dl>
                </div>
              </section>

              <LanguageSettingsPanel />

              <section className="space-y-2 rounded-xl border border-border bg-black/40 p-5">
                <h3 className="text-sm text-foreground">How we use AI providers</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Chat, architecture, coding, and optional UI generation may send prompts and project context to
                  third-party AI providers. Do not submit data you are not allowed to share. Details:{' '}
                  <a href="/privacy" target="_blank" rel="noreferrer" className="text-cyan-300 hover:underline">
                    Privacy Policy
                  </a>
                  .
                </p>
              </section>

              <section className="space-y-3 rounded-xl border border-border bg-black/40 p-5">
                <h3 className="flex items-center gap-2 text-sm text-foreground">
                  <Download className="h-4 w-4 text-muted-foreground" aria-hidden />
                  Download your data
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Export a JSON file with your profile and cloud project metadata. API key values are never included.
                </p>
                {exportMsg ? <p className="text-sm text-foreground/80">{exportMsg}</p> : null}
                <button
                  type="button"
                  disabled={exportBusy}
                  onClick={() => {
                    void (async () => {
                      setExportBusy(true);
                      setExportMsg(null);
                      const r = await downloadNebullaDataExport();
                      setExportBusy(false);
                      setExportMsg(r.ok ? 'Download started.' : r.error || 'Export failed.');
                    })();
                  }}
                  className="btn-cyan inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm disabled:opacity-40"
                >
                  <Download className="h-4 w-4" aria-hidden />
                  {exportBusy ? 'Preparing…' : 'Download data export'}
                </button>
              </section>

              <section className="space-y-3 rounded-xl border border-border bg-black/40 p-5">
                <h3 className="flex items-center gap-2 text-sm text-foreground">
                  <CreditCard className="h-4 w-4 text-muted-foreground" aria-hidden />
                  Billing
                </h3>
                <p className="text-sm text-foreground/90">
                  Current plan:{' '}
                  <span className="font-medium text-cyan-200">
                    {billingLabel(user.billingTier) === 'Free' ? 'Beta (free)' : billingLabel(user.billingTier)}
                  </span>
                </p>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Nebulla beta is free — no payment required. Post-beta plan will be €19.99 / month.
                </p>
                <a
                  href="/payment"
                  className="inline-flex text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  Billing details (inactive during beta) →
                </a>
              </section>

              <AccountProjectSettings
                projectName={projectName}
                onProjectNameChange={onProjectNameChange}
                activeProjectKey={activeProjectKey}
              />

              <button
                type="button"
                onClick={openSecrets}
                className="inline-flex items-center gap-2 text-sm text-cyan-300/90 hover:text-cyan-200 underline-offset-2 hover:underline"
              >
                <KeyRound className="h-4 w-4" aria-hidden />
                API keys &amp; GitHub → open Secrets
              </button>

              <p className="text-xs text-slate-500">
                Legal:{' '}
                <a href="/privacy" target="_blank" rel="noreferrer" className="text-cyan-400/90 hover:underline">
                  Privacy
                </a>
                {' · '}
                <a href="/terms" target="_blank" rel="noreferrer" className="text-cyan-400/90 hover:underline">
                  Terms
                </a>
                {' · '}
                <a href="/legal/dpa" target="_blank" rel="noreferrer" className="text-cyan-400/90 hover:underline">
                  DPA
                </a>
                {' · '}
                <a href="mailto:security@nebulla.dev" className="text-cyan-400/90 hover:underline">
                  security@nebulla.dev
                </a>
              </p>

              <section className="rounded-xl border border-red-500/20 bg-red-950/20 p-6 space-y-4">
                <h3 className="text-sm font-headline text-red-300 flex items-center gap-2">
                  <Trash2 className="w-4 h-4" aria-hidden />
                  Delete account
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Permanently removes your user record, cloud projects, encrypted account API keys, and server
                  conversation logs for your user id. This cannot be undone. Browser localStorage is not cleared by the
                  server — clear site data after logout. Backups and third-party provider logs may retain residual data
                  for a limited time (see Privacy Policy).
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

          {!loading && !user ? (
            <>
              <LanguageSettingsPanel />
              <AccountProjectSettings
                projectName={projectName}
                onProjectNameChange={onProjectNameChange}
                activeProjectKey={activeProjectKey}
              />
              <button
                type="button"
                onClick={openSecrets}
                className="inline-flex items-center gap-2 text-sm text-cyan-300/90 hover:text-cyan-200 underline-offset-2 hover:underline"
              >
                <KeyRound className="h-4 w-4" aria-hidden />
                API keys &amp; GitHub → open Secrets
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
