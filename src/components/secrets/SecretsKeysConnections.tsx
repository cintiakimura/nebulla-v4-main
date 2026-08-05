import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, Github, KeyRound, Loader2 } from 'lucide-react';
import {
  ensureCloudWorkspaceReady,
  fetchSessionUser,
  listCloudProjects,
  type NebulaSessionUser,
} from '../../lib/nebulaCloud';
import { getBrowserProjectKey, getBrowserProjectName } from '../../lib/nebulaProjectApi';
import type { NebulaPublicConfig } from '../../lib/nebulaPublicConfig';
import { formatGithubConnectionStatus } from '../../lib/githubDisplay';
import {
  GROK_CONSOLE_URL,
  hasLocalGrokApiKey,
  isPlausibleGrokApiKey,
  saveGrokApiKeyRobust,
} from '../../lib/grokUserKey';
import { XAI_KEY_ACL_SETUP_HINT } from '../../lib/grokKey';
import { fetchByokStatus } from '../../lib/byokClient';
import { getProjectSecretValue, upsertProjectSecret } from '../../lib/nebulaSecretHelpers';
import { setPreferredAiProvider } from '../../lib/nebulaWelcomeOnboarding';
import { getStoredV0ApiKey, setStoredV0ApiKey } from '../../lib/v0Key';

const V0_ENV_NAME = 'V0_API_KEY';
const V0_KEYS_URL = 'https://v0.dev/chat/settings/keys';

/**
 * GitHub + Grok + V0 blocks formerly on MyServicesOnboarding — now atop Secrets.
 * Styled to match Dashboard Secrets (cyan / white-border cards).
 */
export function SecretsKeysConnections({
  user: userProp,
  config,
}: {
  user: NebulaSessionUser | null;
  config: NebulaPublicConfig;
}) {
  const projectKey = getBrowserProjectKey();
  const cloudOk = Boolean(config.cloudStorageReady);
  const githubOk = Boolean(config.githubOAuthReady);
  const [user, setUser] = useState<NebulaSessionUser | null>(userProp);
  const githubConnected = user?.provider === 'github';

  const [stayLoggedIn, setStayLoggedIn] = useState(true);
  const [grokInput, setGrokInput] = useState('');
  const [v0Input, setV0Input] = useState('');
  const [grokBusy, setGrokBusy] = useState(false);
  const [v0Busy, setV0Busy] = useState(false);
  const [grokMsg, setGrokMsg] = useState<string | null>(null);
  const [grokMsgTone, setGrokMsgTone] = useState<'ok' | 'warn' | 'err'>('ok');
  const [v0Msg, setV0Msg] = useState<string | null>(null);
  const [activeCloudProject, setActiveCloudProject] = useState<string | null>(null);
  const [accountGrokTail, setAccountGrokTail] = useState<string | null>(null);
  const [accountGrokConfigured, setAccountGrokConfigured] = useState(false);

  useEffect(() => {
    setUser(userProp);
  }, [userProp]);

  const refreshByokStatus = useCallback(async () => {
    const status = await fetchByokStatus();
    if (!status || !status.ok) {
      setAccountGrokConfigured(false);
      setAccountGrokTail(null);
      return;
    }
    const xai = status.providers?.xai;
    setAccountGrokConfigured(Boolean(xai?.configured));
    setAccountGrokTail(xai?.tail || null);
  }, []);

  useEffect(() => {
    void (async () => {
      const u = await fetchSessionUser();
      if (u) setUser(u);
      if (!u) {
        setActiveCloudProject(null);
        setAccountGrokConfigured(false);
        setAccountGrokTail(null);
        return;
      }
      await ensureCloudWorkspaceReady();
      setActiveCloudProject(getBrowserProjectName().trim() || null);
      const rows = await listCloudProjects();
      if (rows.length > 0 && !getBrowserProjectName().trim()) {
        setActiveCloudProject(rows[0].name);
      }
      await refreshByokStatus();
    })();
  }, [userProp?.uid, refreshByokStatus]);

  useEffect(() => {
    const onByok = () => void refreshByokStatus();
    window.addEventListener('nebula-byok-updated', onByok);
    window.addEventListener('nebula-secrets-updated', onByok);
    return () => {
      window.removeEventListener('nebula-byok-updated', onByok);
      window.removeEventListener('nebula-secrets-updated', onByok);
    };
  }, [refreshByokStatus]);

  useEffect(() => {
    const onOAuth = (ev: MessageEvent) => {
      if (ev.data?.type !== 'OAUTH_AUTH_SUCCESS') return;
      void (async () => {
        const u = await fetchSessionUser();
        setUser(u);
        await ensureCloudWorkspaceReady();
        setActiveCloudProject(getBrowserProjectName().trim() || null);
      })();
    };
    window.addEventListener('message', onOAuth);
    return () => window.removeEventListener('message', onOAuth);
  }, []);

  const openGitHubOAuth = useCallback(() => {
    const q = stayLoggedIn ? 'remember=1' : 'remember=0';
    window.open(`/api/auth/github?${q}`, 'nebulla_github_oauth', 'width=520,height=720,scrollbars=yes');
  }, [stayLoggedIn]);

  const saveGrok = useCallback(async () => {
    setGrokMsg(null);
    const v = grokInput.trim();
    if (!isPlausibleGrokApiKey(v)) {
      setGrokMsgTone('err');
      setGrokMsg(v ? 'That key looks too short. Paste the full xAI key.' : 'Paste your Grok API key first.');
      return;
    }
    setGrokBusy(true);
    try {
      const result = await saveGrokApiKeyRobust(v);
      if (!result.ok) {
        setGrokMsgTone('err');
        setGrokMsg(result.error || 'Could not save key.');
        return;
      }
      setPreferredAiProvider('grok');
      setGrokInput('');
      await refreshByokStatus();
      if (result.source === 'server') {
        setGrokMsgTone('ok');
        setGrokMsg('Saved on your account (encrypted). Grok is ready — send a chat message to verify.');
      } else {
        setGrokMsgTone('warn');
        setGrokMsg(
          result.error ||
            'Saved in this browser only. Sign in so the key syncs to your account and survives reload.',
        );
      }
      window.dispatchEvent(new CustomEvent('nebula-secrets-updated'));
    } catch {
      setGrokMsgTone('err');
      setGrokMsg('Could not save. Sign in and try again.');
    } finally {
      setGrokBusy(false);
    }
  }, [grokInput, refreshByokStatus]);

  const saveV0 = useCallback(() => {
    setV0Msg(null);
    const v = v0Input.trim();
    if (!v) {
      setV0Msg('Paste your v0 API key first.');
      return;
    }
    setV0Busy(true);
    try {
      upsertProjectSecret(projectKey, V0_ENV_NAME, v, 'api_key');
      setStoredV0ApiKey(v);
      setV0Input('');
      setV0Msg('Saved. V0_API_KEY is ready for UI generation.');
      window.dispatchEvent(new CustomEvent('nebula-v0-key-updated'));
      window.dispatchEvent(new CustomEvent('nebula-secrets-updated'));
    } catch {
      setV0Msg('Could not save. Check browser storage permissions.');
    } finally {
      setV0Busy(false);
    }
  }, [projectKey, v0Input]);

  const grokOnFile = hasLocalGrokApiKey() || accountGrokConfigured;
  const v0OnFile = Boolean(getProjectSecretValue(projectKey, V0_ENV_NAME) ?? getStoredV0ApiKey());

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-normal text-foreground mb-1">Keys &amp; connections</h3>
        <p className="text-sm text-slate-500">
          GitHub sign-in and AI keys for this workspace. Account details live under the TopBar profile (Account).
        </p>
      </div>

      <section className="rounded-xl border border-white/10 bg-white/5 p-6 space-y-4">
        <div>
          <h4 className="text-sm font-headline text-slate-200 flex items-center gap-2">
            <Github className="w-4 h-4 shrink-0" aria-hidden />
            GitHub connection
          </h4>
          <p className="text-xs text-slate-500 mt-1">Optional — smoother sign-in and project import.</p>
        </div>
        {githubConnected ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-4 py-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" aria-hidden />
            <p className="text-sm text-slate-200 font-medium">{formatGithubConnectionStatus(user)}</p>
          </div>
        ) : (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => void openGitHubOAuth()}
              disabled={!cloudOk || !githubOk}
              className="w-full py-3 px-4 rounded-lg bg-slate-100 text-slate-900 font-headline text-sm font-medium flex items-center justify-center gap-2 border border-white/10 hover:opacity-90 disabled:opacity-45 disabled:cursor-not-allowed"
            >
              <Github className="w-5 h-5 shrink-0" aria-hidden />
              Login with GitHub
            </button>
            {!githubOk ? (
              <p className="text-xs text-amber-400/90">
                GitHub OAuth needs both <code className="text-slate-400">GITHUB_CLIENT_ID</code> and{' '}
                <code className="text-slate-400">GITHUB_CLIENT_SECRET</code> on the server.
              </p>
            ) : null}
            <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={stayLoggedIn}
                onChange={(e) => setStayLoggedIn(e.target.checked)}
                className="rounded border-white/20 bg-black/30"
              />
              Stay signed in on this device
            </label>
          </div>
        )}
      </section>

      {githubConnected && cloudOk ? (
        <section className="rounded-xl border border-white/10 bg-white/5 p-6 space-y-2">
          <h4 className="text-sm font-headline text-slate-200">Active workspace</h4>
          <p className="text-sm text-slate-400">
            Coding uses project <code className="text-cyan-300">{activeCloudProject || '—'}</code>.
          </p>
        </section>
      ) : null}

      <section className="rounded-xl border border-white/10 bg-white/5 p-6 space-y-4">
        <div className="flex items-start gap-3">
          <KeyRound className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" aria-hidden />
          <div className="min-w-0 space-y-1">
            <h4 className="text-sm font-headline text-slate-200">Grok API key (required)</h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              Powers conversation, architecture, and coding. Get a key from the{' '}
              <a
                href={GROK_CONSOLE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-cyan-300 underline-offset-2 hover:underline"
              >
                xAI console
                <ExternalLink className="w-3 h-3" aria-hidden />
              </a>
              .
            </p>
            <p className="text-xs text-amber-200/90 leading-relaxed pt-1">{XAI_KEY_ACL_SETUP_HINT}</p>
          </div>
        </div>
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void saveGrok();
          }}
        >
          <input
            type="password"
            autoComplete="off"
            value={grokInput}
            onChange={(e) => {
              setGrokInput(e.target.value);
              setGrokMsg(null);
            }}
            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-cyan-500/40 outline-none"
            placeholder={grokOnFile ? 'Key on file — paste a new key to replace' : 'Paste your Grok / xAI API key'}
          />
          {accountGrokConfigured && !grokInput ? (
            <p className="text-xs text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden />
              Grok key saved on your account
              {accountGrokTail ? ` (…${accountGrokTail})` : ''}. Paste a new key only to replace it.
            </p>
          ) : null}
          {!accountGrokConfigured && hasLocalGrokApiKey() && !grokInput ? (
            <p className="text-xs text-amber-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden />
              Key saved in this browser only — sign in and Save again to store it on your account.
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={grokBusy}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-500/15 text-cyan-200 border border-cyan-500/25 px-4 py-2 text-sm font-headline hover:bg-cyan-500/25 disabled:opacity-50"
            >
              {grokBusy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : null}
              Save Grok key
            </button>
            {grokMsg ? (
              <p
                className={
                  grokMsgTone === 'err'
                    ? 'text-sm text-rose-300'
                    : grokMsgTone === 'warn'
                      ? 'text-sm text-amber-300'
                      : 'text-sm text-emerald-300'
                }
              >
                {grokMsg}
              </p>
            ) : null}
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-white/10 bg-white/5 p-6 space-y-4">
        <div>
          <h4 className="text-sm font-headline text-slate-200">V0 API key (optional)</h4>
          <p className="text-xs text-slate-500 mt-1">
            For high-quality UI generation. Skip anytime — Nebulla works without it.
          </p>
        </div>
        <a
          href={V0_KEYS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 py-3 px-4 text-center font-headline text-sm text-cyan-100 hover:bg-cyan-500/15"
        >
          Open v0 to get an API key
          <ExternalLink className="w-4 h-4 opacity-90 shrink-0" aria-hidden />
        </a>
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void saveV0();
          }}
        >
          <input
            type="password"
            autoComplete="off"
            value={v0Input}
            onChange={(e) => {
              setV0Input(e.target.value);
              setV0Msg(null);
            }}
            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-cyan-500/40 outline-none"
            placeholder={v0OnFile ? 'Key on file — paste a new key to replace' : 'Your v0 key'}
          />
          {v0OnFile && !v0Input ? (
            <p className="text-xs text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden /> A v0 key is already saved.
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={v0Busy}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-100 px-4 py-2 text-sm font-headline hover:bg-cyan-500/20 disabled:opacity-50"
            >
              {v0Busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : null}
              Save V0 key
            </button>
            {v0Msg ? <p className="text-sm text-slate-400">{v0Msg}</p> : null}
          </div>
        </form>
      </section>

      <p className="text-xs text-slate-500 leading-relaxed">
        Tip: you pay xAI and V0 separately for what you use. Nebulla does not mark up those provider bills.
      </p>
    </div>
  );
}
