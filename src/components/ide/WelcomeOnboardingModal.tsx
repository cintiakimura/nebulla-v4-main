import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  KeyRound,
  Loader2,
  Sparkles,
  X,
} from 'lucide-react';
import { Logo } from '@/components/Logo';
import { cn } from '@/lib/utils';
import { fetchSessionUser, type NebulaSessionUser } from '../../lib/nebulaCloud';
import {
  GROK_CONSOLE_URL,
  hasLocalGrokApiKey,
  isPlausibleGrokApiKey,
  saveGrokApiKeyRobust,
} from '../../lib/grokUserKey';
import {
  markWelcomeOnboardingDone,
  markWelcomeOnboardingSeen,
  markWelcomeOnboardingSessionSkip,
  setPreferredAiProvider,
} from '../../lib/nebulaWelcomeOnboarding';
import { getBrowserProjectKey } from '../../lib/nebulaProjectApi';
import { getProjectSecretValue, upsertProjectSecret } from '../../lib/nebulaSecretHelpers';
import { getStoredV0ApiKey, setStoredV0ApiKey } from '../../lib/v0Key';
import { dispatchOpenCenterPanel } from './IdeCenterTabsContext';
import { useLanguage } from '@/components/i18n/LanguageProvider';

const V0_ENV_NAME = 'V0_API_KEY';
const V0_KEYS_URL = 'https://v0.dev/chat/settings/keys';

type Step = 1 | 2 | 3 | 4;

type Props = {
  open: boolean;
  user: NebulaSessionUser | null;
  onClose: () => void;
};

/**
 * Low-friction first-time setup: Welcome → Grok (required) → V0 (optional) → Done.
 * Keys reuse project Secrets + browser storage (same system as Settings).
 */
export function WelcomeOnboardingModal({ open, user, onClose }: Props) {
  const { t } = useLanguage();
  const [step, setStep] = useState<Step>(1);
  const [grokInput, setGrokInput] = useState('');
  const [v0Input, setV0Input] = useState('');
  const [grokBusy, setGrokBusy] = useState(false);
  const [v0Busy, setV0Busy] = useState(false);
  const [grokMsg, setGrokMsg] = useState<string | null>(null);
  const [v0Msg, setV0Msg] = useState<string | null>(null);
  const [v0Saved, setV0Saved] = useState(false);

  useEffect(() => {
    if (!open) return;
    markWelcomeOnboardingSeen();
    setStep(1);
    setGrokInput('');
    setV0Input('');
    setGrokMsg(null);
    setV0Msg(null);
    setV0Saved(Boolean(getStoredV0ApiKey() || getProjectSecretValue(getBrowserProjectKey(), V0_ENV_NAME)));
    void fetchSessionUser();
  }, [open, user]);

  const finish = useCallback(() => {
    markWelcomeOnboardingDone();
    dispatchOpenCenterPanel('projects');
    onClose();
  }, [onClose]);

  const skipSession = useCallback(() => {
    markWelcomeOnboardingSessionSkip();
    dispatchOpenCenterPanel('projects');
    onClose();
  }, [onClose]);

  const saveGrokAndContinue = useCallback(async () => {
    setGrokMsg(null);
    const value = grokInput.trim();
    if (!isPlausibleGrokApiKey(value)) {
      setGrokMsg(
        value
          ? 'That key looks too short or incomplete. Paste the full key from the xAI console.'
          : t('ide.welcome.grokRequiredHint'),
      );
      return;
    }
    setGrokBusy(true);
    try {
      const result = await saveGrokApiKeyRobust(value);
      if (!result.ok) {
        setGrokMsg(result.error || 'Could not save key.');
        return;
      }
      setPreferredAiProvider('grok');
      setGrokInput('');
      if (result.source === 'local' && result.error) {
        setGrokMsg(result.error);
      }
      window.dispatchEvent(new CustomEvent('nebula-secrets-updated'));
      setStep(3);
    } catch {
      setGrokMsg('Could not save. Check that you are signed in and try again.');
    } finally {
      setGrokBusy(false);
    }
  }, [grokInput, t]);

  const saveV0AndContinue = useCallback(() => {
    setV0Msg(null);
    const value = v0Input.trim();
    if (!value) {
      setV0Msg(t('ide.welcome.v0SkipHint'));
      return;
    }
    if (value.length < 8) {
      setV0Msg('That looks too short. Double-check you copied the full key.');
      return;
    }
    setV0Busy(true);
    try {
      const projectKey = getBrowserProjectKey();
      upsertProjectSecret(projectKey, V0_ENV_NAME, value, 'api_key');
      setStoredV0ApiKey(value);
      setV0Input('');
      setV0Saved(true);
      window.dispatchEvent(new CustomEvent('nebula-v0-key-updated'));
      window.dispatchEvent(new CustomEvent('nebula-secrets-updated'));
      setStep(4);
    } catch {
      setV0Msg('Could not save. Check that browser storage is allowed.');
    } finally {
      setV0Busy(false);
    }
  }, [v0Input, t]);

  const skipV0 = useCallback(() => {
    setStep(4);
  }, []);

  if (!open) return null;

  const progressLabel =
    step === 1
      ? t('ide.welcome.stepWelcome')
      : step === 2
        ? t('ide.welcome.step1')
        : step === 3
          ? t('ide.welcome.step2')
          : t('ide.welcome.step3');

  return (
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-onboarding-title"
    >
      <div className="relative flex max-h-[min(92vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-[var(--surface-bright)] shadow-2xl shadow-black/50">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          aria-hidden
          style={{
            background:
              'radial-gradient(ellipse 90% 55% at 50% -15%, rgba(108,99,255,0.22), transparent 55%)',
          }}
        />

        {step > 1 && step < 4 ? (
          <button
            type="button"
            onClick={skipSession}
            className="absolute right-3 top-3 z-10 rounded-lg p-1.5 text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
            aria-label={t('ide.welcome.close')}
            title={t('ide.welcome.closeTitle')}
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}

        <div className="relative shrink-0 border-b border-border px-6 py-3 sm:px-8">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-primary/90">
              {progressLabel}
            </p>
            {step >= 2 && step <= 4 ? (
              <div className="flex items-center gap-1.5" aria-hidden>
                {[2, 3, 4].map((n) => (
                  <span
                    key={n}
                    className={cn(
                      'h-1.5 w-6 rounded-full transition-colors',
                      step >= n ? 'bg-primary' : 'bg-white/10',
                    )}
                  />
                ))}
              </div>
            ) : null}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">One-time setup · about 2 minutes</p>
        </div>

        <div className="relative min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8">
          {step === 1 ? (
            <div className="space-y-5">
              <header className="flex items-start gap-3">
                <Logo className="h-11 w-11 shrink-0" />
                <div className="min-w-0 space-y-2">
                  <h2
                    id="welcome-onboarding-title"
                    className="font-headline text-2xl font-semibold tracking-tight text-foreground"
                  >
                    {t('ide.welcome.heading')}
                  </h2>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Nebulla runs on <strong className="font-medium text-foreground">your own AI keys</strong> —
                    full power, no hidden usage caps from us.
                  </p>
                </div>
              </header>

              <section className="space-y-3 rounded-xl border border-border bg-[var(--surface)]/60 p-4">
                <p className="text-sm text-foreground">You will need:</p>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex gap-2">
                    <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                    <span>
                      <strong className="font-medium text-foreground">{t('ide.welcome.grokLabel')}</strong> (required) — conversation,
                      architecture, and coding
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary/80" aria-hidden />
                    <span>
                      <strong className="font-medium text-foreground">{t('ide.welcome.v0Label')}</strong> (optional) — high-quality UI
                      generation
                    </span>
                  </li>
                </ul>
                <p className="text-xs leading-relaxed text-muted-foreground border-t border-border pt-3">
                  Billing stays transparent: Nebulla (if on a paid plan) + Grok/xAI + V0 (only if you use it). You
                  control each account.
                </p>
              </section>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-5">
              <header className="space-y-2 pr-8">
                <h2 id="welcome-onboarding-title" className="font-headline text-xl font-semibold text-foreground">
                  Connect Grok (Required)
                </h2>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Grok is the brain of Nebulla — chat, Master Plan architecture, and coding.
                </p>
              </header>

              <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
                <li>
                  Open the{' '}
                  <a
                    href={GROK_CONSOLE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline"
                  >
                    xAI / Grok console
                    <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                </li>
                <li>Create an API key</li>
                <li>Paste it below</li>
              </ol>

              <div className="space-y-2">
                <label className="block text-[11px] uppercase tracking-wider text-muted-foreground" htmlFor="welcome-grok-key">
                  {t('ide.welcome.grokLabel')}
                </label>
                <input
                  id="welcome-grok-key"
                  type="password"
                  autoComplete="off"
                  value={grokInput}
                  onChange={(e) => {
                    setGrokInput(e.target.value);
                    setGrokMsg(null);
                  }}
                  placeholder={t('ide.welcome.grokPlaceholder')}
                  className="w-full rounded-xl border border-border bg-[var(--surface)] px-3 py-3 text-sm text-foreground outline-none ring-primary/30 placeholder:text-muted-foreground/60 focus:ring"
                />
                {hasLocalGrokApiKey() && !grokInput ? (
                  <p className="flex items-center gap-1.5 text-xs text-[var(--success)]">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />A Grok key is already saved — paste a new one
                    to replace it, or continue.
                  </p>
                ) : null}
                {grokMsg ? <p className="text-xs text-amber-200/90">{grokMsg}</p> : null}
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-5">
              <header className="space-y-2 pr-8">
                <h2 id="welcome-onboarding-title" className="font-headline text-xl font-semibold text-foreground">
                  Connect V0 (Optional)
                </h2>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  V0 generates high-quality UI. You can skip this and use Nebulla normally — add V0 later anytime.
                </p>
              </header>

              <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
                <li>
                  Open{' '}
                  <a
                    href={V0_KEYS_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline"
                  >
                    v0 API keys
                    <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                </li>
                <li>Create a key and paste it below — or skip</li>
              </ol>

              <div className="space-y-2">
                <label className="block text-[11px] uppercase tracking-wider text-muted-foreground" htmlFor="welcome-v0-key">
                  {t('ide.welcome.v0Label')}
                </label>
                <input
                  id="welcome-v0-key"
                  type="password"
                  autoComplete="off"
                  value={v0Input}
                  onChange={(e) => {
                    setV0Input(e.target.value);
                    setV0Msg(null);
                  }}
                  placeholder={t('ide.welcome.v0Placeholder')}
                  className="w-full rounded-xl border border-border bg-[var(--surface)] px-3 py-3 text-sm text-foreground outline-none ring-primary/30 placeholder:text-muted-foreground/60 focus:ring"
                />
                {v0Saved && !v0Input ? (
                  <p className="flex items-center gap-1.5 text-xs text-[var(--success)]">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />A V0 key is already saved.
                  </p>
                ) : null}
                {v0Msg ? <p className="text-xs text-amber-200/90">{v0Msg}</p> : null}
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-5">
              <header className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <CheckCircle2 className="h-6 w-6" aria-hidden />
                </span>
                <div className="space-y-2">
                  <h2 id="welcome-onboarding-title" className="font-headline text-xl font-semibold text-foreground">
                    You&apos;re ready
                  </h2>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Setup is done. Grok is connected
                    {v0Saved || getStoredV0ApiKey() ? ' and V0 is ready for UI generation' : ''}. You can change keys
                    later under <strong className="font-medium text-foreground">Secrets</strong> (left nav).
                  </p>
                </div>
              </header>
              <p className="rounded-xl border border-border bg-[var(--surface)]/60 px-4 py-3 text-xs text-muted-foreground">
                Reminder: xAI and V0 bill separately from Nebulla. You only pay for what you use on each service.
              </p>
            </div>
          ) : null}
        </div>

        <div className="relative shrink-0 border-t border-border bg-[var(--surface-bright)]/95 px-6 py-4 sm:px-8">
          {step === 1 ? (
            <button
              type="button"
              onClick={() => setStep(2)}
              className="btn-cyan inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm"
            >
              {t('ide.welcome.continue')}
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          ) : null}

          {step === 2 ? (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={grokBusy || (!grokInput.trim() && !hasLocalGrokApiKey())}
                onClick={() => {
                  if (!grokInput.trim() && hasLocalGrokApiKey()) {
                    setPreferredAiProvider('grok');
                    setStep(3);
                    return;
                  }
                  saveGrokAndContinue();
                }}
                className="btn-cyan inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm disabled:opacity-45"
              >
                {grokBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {t('ide.welcome.saveContinue')}
              </button>
              <a
                href={GROK_CONSOLE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-center text-xs text-primary underline-offset-2 hover:underline"
              >
                Open xAI console to create a key
              </a>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                disabled={v0Busy || !v0Input.trim()}
                onClick={saveV0AndContinue}
                className="btn-cyan inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm disabled:opacity-45"
              >
                {v0Busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                Add V0 key
              </button>
              <button
                type="button"
                onClick={skipV0}
                className="inline-flex flex-1 items-center justify-center rounded-xl border border-border px-5 py-3 text-sm font-medium text-foreground transition hover:bg-white/5"
              >
                {t('ide.welcome.skip')}
              </button>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  markWelcomeOnboardingDone();
                  dispatchOpenCenterPanel('secrets');
                  onClose();
                }}
                className="btn-secondary-surface inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm"
              >
                <KeyRound className="h-4 w-4" aria-hidden />
                Open Secrets
              </button>
              <button
                type="button"
                onClick={finish}
                className="btn-cyan inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm"
              >
                Start building
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
