import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { fetchSessionUser, type NebulaSessionUser } from '../lib/nebulaCloud';
import { fetchNebulaPublicConfig } from '../lib/nebulaPublicConfig';
import { BETA_FREE_BANNER, isBillingCheckoutEnabled } from '../lib/billingFlags';
import { goToApp, goToLanding, goToLogin, goToTryFree } from '../lib/authNavigate';

const PLAN_PRICE = '€19.99';
const PLAN_PERIOD = '/ month';

export function PaymentPage() {
  const [user, setUser] = useState<NebulaSessionUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [billingEnabled, setBillingEnabled] = useState(false);

  useEffect(() => {
    void fetchSessionUser().then(setUser);
    void fetchNebulaPublicConfig().then((cfg) => {
      setBillingEnabled(isBillingCheckoutEnabled(cfg));
    });
    try {
      if (new URLSearchParams(window.location.search).get('canceled') === '1') {
        setInfo('Checkout was canceled. You can try again whenever you are ready.');
        window.history.replaceState({}, document.title, '/payment');
      }
    } catch {
      /* ignore */
    }
  }, []);

  const startCheckout = async () => {
    setError(null);
    setInfo(null);
    if (!billingEnabled) {
      setInfo(BETA_FREE_BANNER);
      return;
    }
    if (!user) {
      goToLogin('/payment');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: 'pro' }),
      });
      const data = (await res.json()) as { url?: string; error?: string; message?: string };
      if (res.ok && data.url) {
        window.location.assign(data.url);
        return;
      }
      setInfo(
        data.message ||
          data.error ||
          'Checkout is not fully configured yet. Your request was recorded — billing will be enabled shortly.',
      );
    } catch {
      setError('Network error. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const tier = (user?.billingTier || 'free').toLowerCase();
  const alreadyPaid = tier === 'pro' || tier === 'power' || tier === 'paid';

  return (
    <div className="min-h-screen bg-transparent font-body font-normal text-foreground">
      <header className="ide-glass-chrome flex h-12 items-center justify-between border-b border-border px-5 md:px-8">
        <button type="button" onClick={goToLanding} className="flex items-center gap-2">
          <Logo className="h-8 w-8" />
          <span className="app-logotype">Nebulla.beta</span>
        </button>
        <button
          type="button"
          onClick={goToLanding}
          className="btn-secondary-surface inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Home
        </button>
      </header>

      <main className="mx-auto max-w-lg px-6 py-10 md:px-8 md:py-12">
        <h1 className="type-page">Payment</h1>
        <p className="type-body-dense mt-2 text-muted-foreground">
          One plan after beta. All features. No tiers to compare.
        </p>

        {!billingEnabled ? (
          <p className="type-body-dense mt-4 rounded-md border border-border px-3 py-2 text-muted-foreground">
            {BETA_FREE_BANNER}
          </p>
        ) : null}

        {user ? (
          <p className="type-label-sm mt-2">
            Signed in as {user.email || user.displayName}
            {alreadyPaid ? ' · active subscription' : ' · beta (free)'}
          </p>
        ) : null}

        {error ? <p className="type-body-dense mt-4 text-destructive">{error}</p> : null}
        {info ? (
          <p className="type-body-dense mt-4 rounded-md border border-border px-3 py-2 text-muted-foreground">
            {info}
          </p>
        ) : null}

        <div className="ide-glass-card mt-8 rounded-lg border border-border px-5 py-6">
          <p className="type-section">Nebulla</p>
          <p className="type-page mt-2">
            {billingEnabled ? PLAN_PRICE : 'Free'}
            <span className="type-body-dense ml-1 text-muted-foreground">
              {billingEnabled ? PLAN_PERIOD : 'during beta'}
            </span>
          </p>
          {!billingEnabled ? (
            <p className="type-label-sm mt-2">
              Planned post-beta price: {PLAN_PRICE}
              {PLAN_PERIOD}
            </p>
          ) : null}
          <ul className="type-body-dense mt-5 space-y-2 text-muted-foreground">
            <li>Full workspace during beta</li>
            <li>Full AI capacity (bring your own key or use platform)</li>
            <li>UI Studio, Master Plan, Secrets &amp; DNS</li>
            <li>No payment required for beta</li>
          </ul>

          {alreadyPaid ? (
            <button type="button" onClick={goToApp} className="btn-cyan mt-6 w-full">
              Open workspace
            </button>
          ) : (
            <div className="mt-6 space-y-2">
              {billingEnabled ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void startCheckout()}
                  className="btn-cyan w-full disabled:opacity-50"
                >
                  {busy ? '…' : user ? 'Continue to checkout' : 'Sign in to pay'}
                </button>
              ) : (
                <button
                  type="button"
                  disabled
                  className="btn-secondary-surface w-full cursor-not-allowed opacity-70"
                >
                  Checkout coming after beta
                </button>
              )}
              {!user ? (
                <button
                  type="button"
                  onClick={() => goToTryFree('/app')}
                  className="btn-cyan w-full"
                >
                  Start free beta
                </button>
              ) : (
                <button type="button" onClick={goToApp} className="btn-cyan w-full">
                  Open workspace
                </button>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
