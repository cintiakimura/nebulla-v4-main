import { useCallback, useEffect, useState } from 'react';
import {
  Check,
  Copy,
  CreditCard,
  Eye,
  EyeOff,
  Github,
  KeyRound,
  LogOut,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { FORCE_GUEST_MODE } from '../../../lib/testingBranch';
import {
  fetchSessionUser,
  logoutNebula,
  type NebulaSessionUser,
} from '../../../lib/nebulaCloud';
import { fetchNebulaPublicConfig, type NebulaPublicConfig } from '../../../lib/nebulaPublicConfig';
import { formatGithubConnectionStatus } from '../../../lib/githubDisplay';
import {
  GROK_CONSOLE_URL,
  GROK_SECRET_NAME,
  getStoredGrokApiKey,
  hasLocalGrokApiKey,
  isPlausibleGrokApiKey,
  saveGrokApiKeyRobust,
} from '../../../lib/grokUserKey';
import { fetchByokStatus } from '../../../lib/byokClient';
import { BETA_FREE_BANNER } from '../../../lib/billingFlags';

export type SettingsSection = 'account' | 'ai' | 'github' | 'billing';

const SECTIONS: { id: SettingsSection; label: string; icon: typeof User }[] = [
  { id: 'account', label: 'Account', icon: User },
  { id: 'ai', label: 'Secrets', icon: KeyRound },
  { id: 'github', label: 'GitHub', icon: Github },
  { id: 'billing', label: 'Billing', icon: CreditCard },
];

const DISPLAY_NAME_KEY = 'nebula_account_display_name_v1';
export const SETTINGS_SECTION_KEY = 'nebula_shell_settings_section_v1';

export function writeSettingsSection(section: SettingsSection): void {
  try {
    localStorage.setItem(SETTINGS_SECTION_KEY, section);
  } catch {
    /* ignore */
  }
}

/** Open Settings → Secrets. */
export function openSettingsAiKeys(): void {
  writeSettingsSection('ai');
  try {
    window.dispatchEvent(new CustomEvent('nebula-open-settings', { detail: { section: 'ai' } }));
  } catch {
    /* ignore */
  }
}

function readDisplayNameOverride(): string {
  try {
    return localStorage.getItem(DISPLAY_NAME_KEY)?.trim() || '';
  } catch {
    return '';
  }
}

function writeDisplayNameOverride(name: string): void {
  try {
    const t = name.trim();
    if (!t) localStorage.removeItem(DISPLAY_NAME_KEY);
    else localStorage.setItem(DISPLAY_NAME_KEY, t);
  } catch {
    /* ignore */
  }
}

function readSection(): SettingsSection {
  try {
    const raw = localStorage.getItem(SETTINGS_SECTION_KEY);
    if (raw === 'account' || raw === 'ai' || raw === 'github' || raw === 'billing') return raw;
  } catch {
    /* ignore */
  }
  return 'account';
}

type AiKeyStatus = 'connected' | 'missing' | 'invalid';

function planLabel(tier: NebulaSessionUser['billingTier'] | undefined): string {
  if (tier === 'pro') return 'Pro';
  if (tier === 'power') return 'Power';
  return 'Beta / Early access';
}

function billingStatus(user: NebulaSessionUser | null): 'Active' | 'Trial' | 'None' {
  if (!user) return 'None';
  if (user.billingTier === 'pro' || user.billingTier === 'power') return 'Active';
  return 'Trial';
}

/**
 * Account-level Settings: Account · Secrets · GitHub · Billing.
 */
export function SettingsScreen({ onLoggedOut }: { onLoggedOut?: () => void }) {
  const [section, setSection] = useState<SettingsSection>(() => readSection());
  const [user, setUser] = useState<NebulaSessionUser | null>(null);
  const [config, setConfig] = useState<NebulaPublicConfig>({});
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState(() => readDisplayNameOverride());
  const [nameHint, setNameHint] = useState<string | null>(null);
  const [logoutBusy, setLogoutBusy] = useState(false);

  const [grokInput, setGrokInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [grokBusy, setGrokBusy] = useState(false);
  const [grokMsg, setGrokMsg] = useState<string | null>(null);
  const [accountGrokConfigured, setAccountGrokConfigured] = useState(false);
  const [accountGrokTail, setAccountGrokTail] = useState<string | null>(null);
  const [aiStatusOverride, setAiStatusOverride] = useState<AiKeyStatus | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  const [githubHint, setGithubHint] = useState<string | null>(null);

  const selectSection = useCallback((next: SettingsSection) => {
    setSection(next);
    writeSettingsSection(next);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [u, cfg, byok] = await Promise.all([
        fetchSessionUser(),
        fetchNebulaPublicConfig(),
        fetchByokStatus(),
      ]);
      setUser(u);
      setConfig(cfg);
      const xai = byok?.providers?.xai;
      setAccountGrokConfigured(Boolean(xai?.configured || cfg.byok?.xai?.configured));
      setAccountGrokTail(xai?.tail || cfg.byok?.xai?.tail || null);
      const override = readDisplayNameOverride();
      if (override) setDisplayName(override);
      else if (u?.displayName) setDisplayName(u.displayName);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onByok = () => void refresh();
    const onOAuth = (ev: MessageEvent) => {
      if (ev.data?.type === 'OAUTH_AUTH_SUCCESS') void refresh();
    };
    const onOpenSettings = (ev: Event) => {
      const section = (ev as CustomEvent<{ section?: SettingsSection }>).detail?.section;
      if (section === 'account' || section === 'ai' || section === 'github' || section === 'billing') {
        selectSection(section);
      }
    };
    window.addEventListener('nebula-byok-updated', onByok);
    window.addEventListener('message', onOAuth);
    window.addEventListener('nebula-open-settings', onOpenSettings);
    return () => {
      window.removeEventListener('nebula-byok-updated', onByok);
      window.removeEventListener('message', onOAuth);
      window.removeEventListener('nebula-open-settings', onOpenSettings);
    };
  }, [refresh, selectSection]);

  const aiStatus: AiKeyStatus =
    aiStatusOverride ||
    (accountGrokConfigured || hasLocalGrokApiKey() ? 'connected' : 'missing');

  const githubConnected = user?.provider === 'github';
  const githubOAuthReady = Boolean(config.githubOAuthReady);

  const onSaveDisplayName = () => {
    writeDisplayNameOverride(displayName);
    setNameHint('Saved locally (no profile API yet).');
  };

  const onSignOut = async () => {
    setLogoutBusy(true);
    try {
      await logoutNebula();
      onLoggedOut?.();
    } catch {
      setNameHint('Sign out failed. Try again.');
    } finally {
      setLogoutBusy(false);
    }
  };

  const onSaveGrok = async () => {
    setGrokMsg(null);
    setAiStatusOverride(null);
    const v = grokInput.trim();
    if (!isPlausibleGrokApiKey(v)) {
      setAiStatusOverride('invalid');
      setGrokMsg(v ? 'That key looks too short or invalid.' : 'Paste your Grok API key first.');
      return;
    }
    setGrokBusy(true);
    try {
      const result = await saveGrokApiKeyRobust(v);
      if (!result.ok) {
        setAiStatusOverride('invalid');
        setGrokMsg(result.error || 'Could not save key.');
        return;
      }
      setGrokInput('');
      setAiStatusOverride('connected');
      await refresh();
      setGrokMsg(
        result.source === 'server'
          ? 'Saved on your account (encrypted).'
          : result.error || 'Saved in this browser only. Build chat will use this key.',
      );
    } catch {
      setAiStatusOverride('invalid');
      setGrokMsg('Could not save key.');
    } finally {
      setGrokBusy(false);
    }
  };

  const onCopyGrok = async () => {
    const v = grokInput.trim() || getStoredGrokApiKey() || '';
    if (!v) return;
    try {
      await navigator.clipboard.writeText(v);
      setCopiedKey(true);
      window.setTimeout(() => setCopiedKey(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const openGitHubOAuth = () => {
    setGithubHint(null);
    if (!githubOAuthReady) {
      setGithubHint('GitHub OAuth is not fully configured on this deployment.');
      return;
    }
    window.open('/api/auth/github?remember=1', 'nebulla_github_oauth', 'width=520,height=720,scrollbars=yes');
  };

  const disconnectGitHub = async () => {
    // No dedicated unlink API — disconnect ends the GitHub session via logout.
    setLogoutBusy(true);
    try {
      await logoutNebula();
      onLoggedOut?.();
    } catch {
      setGithubHint('Disconnect failed. Try again.');
    } finally {
      setLogoutBusy(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <nav
        className="ide-glass-chrome flex w-44 shrink-0 flex-col gap-1 overflow-y-auto border-r border-border p-2 sm:w-52"
        aria-label="Settings sections"
      >
        <p className="type-label-sm px-2 py-2">Settings</p>
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => selectSection(id)}
            aria-current={section === id ? 'page' : undefined}
            className={cn(
              'inline-flex h-8 items-center gap-2 rounded-md px-2.5 text-left text-xs',
              section === id ? 'btn-cyan' : 'btn-secondary-surface text-muted-foreground',
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {label}
          </button>
        ))}
      </nav>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-5">
        <div className={cn('mx-auto space-y-5', section === 'ai' ? 'max-w-2xl' : 'max-w-lg')}>
          {loading ? <p className="type-body-md text-muted-foreground">Loading…</p> : null}

          {section === 'account' ? (
            <section className="space-y-3" aria-label="Account">
              <h2 className="type-page">Account</h2>
              {FORCE_GUEST_MODE && !user ? (
                <p className="text-xs text-muted-foreground">
                  Guest mode — auth is optional on this branch. Display name saves locally.
                </p>
              ) : null}
              <div className="flex items-center gap-3">
                {user?.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-full border border-border object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border bg-[#1a1a1a] text-sm text-foreground">
                    {(displayName || user?.email || '?').slice(0, 1).toUpperCase()}
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">Avatar from sign-in when available</p>
              </div>
              <label className="block space-y-1.5">
                <span className="text-[11px] text-muted-foreground">Display name</span>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => {
                    setDisplayName(e.target.value);
                    setNameHint(null);
                  }}
                  className="ide-glass-input w-full rounded-md px-2.5 py-1.5 text-sm outline-none"
                  placeholder="Your name"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-[11px] text-muted-foreground">Email</span>
                <input
                  type="email"
                  value={user?.email || user?.accountEmail || ''}
                  readOnly
                  className="ide-glass-input w-full rounded-md px-2.5 py-1.5 text-sm text-muted-foreground outline-none"
                  placeholder={user ? '—' : 'Not signed in'}
                />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={onSaveDisplayName}
                  className="btn-secondary-surface h-9 rounded-md px-3 text-xs"
                >
                  Save name
                </button>
                <button
                  type="button"
                  disabled={logoutBusy}
                  onClick={() => void onSignOut()}
                  className="btn-cyan inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-xs disabled:opacity-40"
                >
                  <LogOut className="h-3.5 w-3.5" aria-hidden />
                  {logoutBusy ? 'Signing out…' : 'Sign out'}
                </button>
              </div>
              {nameHint ? (
                <p className="text-xs text-muted-foreground" role="status">
                  {nameHint}
                </p>
              ) : null}
            </section>
          ) : null}

          {section === 'ai' ? (
            <section className="space-y-5" aria-label="Secrets">
              <div className="space-y-1.5">
                <h2 className="type-page">Secrets</h2>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Environment variables for this workspace. Chat uses{' '}
                  <span className="font-mono text-foreground/80">{GROK_SECRET_NAME}</span>.
                </p>
              </div>

              <div>
                <div className="grid grid-cols-[minmax(9.5rem,13rem)_minmax(0,1fr)] gap-3 pb-2">
                  <span className="type-label-sm uppercase tracking-[0.08em]">Key</span>
                  <span className="type-label-sm uppercase tracking-[0.08em]">Value</span>
                </div>
                <div className="border-t border-border" />
                <div className="grid grid-cols-[minmax(9.5rem,13rem)_minmax(0,1fr)] items-start gap-3 pt-3">
                  <input
                    readOnly
                    value={GROK_SECRET_NAME}
                    aria-label="Secret key"
                    className="w-full rounded-md border border-border bg-[#1a1a1a] px-2.5 py-2 font-mono text-xs text-foreground outline-none"
                  />
                  <div className="flex min-w-0 items-start gap-1">
                    {showKey ? (
                      <textarea
                        rows={1}
                        autoComplete="off"
                        spellCheck={false}
                        value={grokInput}
                        onChange={(e) => {
                          setGrokInput(e.target.value);
                          setGrokMsg(null);
                          setAiStatusOverride(null);
                        }}
                        placeholder={
                          accountGrokConfigured || hasLocalGrokApiKey()
                            ? '••••••••••'
                            : 'Paste value'
                        }
                        className="min-h-[2.25rem] min-w-0 flex-1 resize-y rounded-md border border-border bg-[#1a1a1a] px-2.5 py-2 font-mono text-xs text-foreground outline-none"
                      />
                    ) : (
                      <input
                        type="password"
                        autoComplete="off"
                        value={grokInput}
                        onChange={(e) => {
                          setGrokInput(e.target.value);
                          setGrokMsg(null);
                          setAiStatusOverride(null);
                        }}
                        placeholder={
                          accountGrokConfigured || hasLocalGrokApiKey()
                            ? '••••••••••'
                            : 'Paste value'
                        }
                        className="min-h-[2.25rem] min-w-0 flex-1 rounded-md border border-border bg-[#1a1a1a] px-2.5 py-2 font-mono text-xs text-foreground outline-none"
                      />
                    )}
                    <button
                      type="button"
                      title={copiedKey ? 'Copied' : 'Copy'}
                      aria-label={copiedKey ? 'Copied' : 'Copy value'}
                      onClick={() => void onCopyGrok()}
                      className="inline-flex h-9 w-8 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
                    >
                      {copiedKey ? (
                        <Check className="h-3.5 w-3.5" aria-hidden />
                      ) : (
                        <Copy className="h-3.5 w-3.5" aria-hidden />
                      )}
                    </button>
                    <button
                      type="button"
                      title={showKey ? 'Hide' : 'Reveal'}
                      aria-label={showKey ? 'Hide value' : 'Reveal value'}
                      onClick={() => setShowKey((v) => !v)}
                      className="inline-flex h-9 w-8 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
                    >
                      {showKey ? (
                        <EyeOff className="h-3.5 w-3.5" aria-hidden />
                      ) : (
                        <Eye className="h-3.5 w-3.5" aria-hidden />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={grokBusy}
                  onClick={() => void onSaveGrok()}
                  className="h-9 rounded-md border border-border bg-[#1a1a1a] px-3.5 text-xs text-foreground hover:border-white/20 disabled:opacity-40"
                >
                  {grokBusy ? 'Saving…' : 'Save'}
                </button>
                <span
                  className={cn(
                    'text-xs',
                    aiStatus === 'connected' && 'text-foreground/80',
                    aiStatus === 'missing' && 'text-muted-foreground',
                    aiStatus === 'invalid' && 'text-red-300',
                  )}
                >
                  {aiStatus === 'connected'
                    ? `Saved${accountGrokTail ? ` (…${accountGrokTail})` : ''}`
                    : aiStatus === 'invalid'
                      ? 'Invalid'
                      : 'Not set'}
                </span>
              </div>
              {grokMsg ? (
                <p className="text-xs text-muted-foreground" role="status">
                  {grokMsg}
                </p>
              ) : null}
              <a
                href={GROK_CONSOLE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-[11px] text-muted-foreground underline-offset-2 hover:underline"
              >
                Get a key from the xAI console
              </a>
            </section>
          ) : null}

          {section === 'github' ? (
            <section className="space-y-4" aria-label="GitHub">
              <h2 className="type-page">GitHub</h2>
              <p className="text-sm text-foreground">{formatGithubConnectionStatus(user)}</p>
              {!githubOAuthReady ? (
                <p className="text-xs text-muted-foreground">
                  GitHub OAuth is not fully configured on this server (client id / secret).
                </p>
              ) : null}
              {githubConnected ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Connected account:{' '}
                    <span className="text-foreground">
                      {user?.displayName || user?.email || user?.accountEmail || 'GitHub user'}
                    </span>
                  </p>
                  <button
                    type="button"
                    disabled={logoutBusy}
                    onClick={() => void disconnectGitHub()}
                    className="btn-secondary-surface h-9 rounded-md px-3 text-xs disabled:opacity-40"
                  >
                    {logoutBusy ? 'Disconnecting…' : 'Disconnect'}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={!githubOAuthReady}
                  onClick={openGitHubOAuth}
                  className="btn-cyan inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-xs disabled:opacity-40"
                >
                  <Github className="h-3.5 w-3.5" aria-hidden />
                  Connect GitHub
                </button>
              )}
              {githubHint ? (
                <p className="text-xs text-muted-foreground" role="status">
                  {githubHint}
                </p>
              ) : null}
            </section>
          ) : null}

          {section === 'billing' ? (
            <section className="space-y-4" aria-label="Billing">
              <h2 className="type-page">Billing</h2>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Current plan</dt>
                  <dd className="text-foreground">{planLabel(user?.billingTier)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Price</dt>
                  <dd className="text-foreground">Coming soon · €20/mo when locked</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Status</dt>
                  <dd className="text-foreground">{billingStatus(user)}</dd>
                </div>
              </dl>
              <p className="text-xs leading-relaxed text-muted-foreground">{BETA_FREE_BANNER}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled
                  className="btn-secondary-surface h-9 rounded-md px-3 text-xs opacity-40"
                  title="Coming soon"
                >
                  Manage payment
                </button>
                <button
                  type="button"
                  disabled
                  className="btn-secondary-surface h-9 rounded-md px-3 text-xs opacity-40"
                  title="Coming soon"
                >
                  Invoices
                </button>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
