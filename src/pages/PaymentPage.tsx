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
    <div className="min-h-screen bg-[#050508] text-[#f2f2f2] font-body font-normal">
      <header className="flex h-16 items-center justify-between border-b border-white/10 px-6 md:px-10">
        <button type="button" onClick={goToLanding} className="flex items-center gap-2.5">
          <Logo className="h-8 w-8" />
          <span className="text-base font-normal tracking-tight">Nebulla</span>
        </button>
        <button
          type="button"
          onClick={goToLanding}
          className="inline-flex items-center gap-1.5 text-sm text-[#8a8a8a] hover:text-[#f2f2f2]"
        >
          <ArrowLeft className="h-4 w-4" />
          Home
        </button>
      </header>

      <main className="mx-auto max-w-lg px-6 py-14 md:px-10">
        <h1 className="text-base font-normal tracking-tight text-[#f2f2f2]">Payment</h1>
        <p className="mt-3 text-sm leading-relaxed text-[#8a8a8a]">
          One plan after beta. All features. No tiers to compare.
        </p>

        {!billingEnabled ? (
          <p className="mt-4 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[#c8c8c8]">
            {BETA_FREE_BANNER}
          </p>
        ) : null}

        {user ? (
          <p className="mt-2 text-xs text-[#8a8a8a]">
            Signed in as {user.email || user.displayName}
            {alreadyPaid ? ' · active subscription' : ' · beta (free)'}
          </p>
        ) : null}

        {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}
        {info ? (
          <p className="mt-4 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[#c8c8c8]">
            {info}
          </p>
        ) : null}

        <div className="mt-10 rounded-xl border border-white/10 bg-black/40 px-6 py-8">
          <p className="text-sm text-[#b8b8b8]">Nebulla</p>
          <p className="mt-2 text-2xl tracking-tight text-[#f2f2f2]">
            {billingEnabled ? PLAN_PRICE : 'Free'}
            <span className="ml-1 text-sm text-[#8a8a8a]">
              {billingEnabled ? PLAN_PERIOD : 'during beta'}
            </span>
          </p>
          {!billingEnabled ? (
            <p className="mt-2 text-xs text-[#8a8a8a]">
              Planned post-beta price: {PLAN_PRICE}
              {PLAN_PERIOD}
            </p>
          ) : null}
          <ul className="mt-6 space-y-2 text-sm text-[#b8b8b8]">
            <li>Full workspace during beta</li>
            <li>Full AI capacity (bring your own key or use platform)</li>
            <li>UI Studio, Master Plan, Secrets &amp; DNS</li>
            <li>No payment required for beta</li>
          </ul>

          {alreadyPaid ? (
            <button
              type="button"
              onClick={goToApp}
              className="mt-8 w-full rounded-lg bg-[#f2f2f2] px-4 py-2.5 text-sm text-[#0a0a0a] hover:bg-white"
            >
              Open workspace
            </button>
          ) : (
            <div className="mt-8 space-y-3">
              {billingEnabled ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void startCheckout()}
                  className="w-full rounded-lg bg-[#f2f2f2] px-4 py-2.5 text-sm text-[#0a0a0a] hover:bg-white disabled:opacity-50"
                >
                  {busy ? '…' : user ? 'Continue to checkout' : 'Sign in to pay'}
                </button>
              ) : (
                <button
                  type="button"
                  disabled
                  className="w-full cursor-not-allowed rounded-lg border border-white/15 px-4 py-2.5 text-sm text-[#8a8a8a] opacity-70"
                >
                  Checkout coming after beta
                </button>
              )}
              {!user ? (
                <button
                  type="button"
                  onClick={() => goToTryFree('/app')}
                  className="w-full rounded-lg bg-[#f2f2f2] px-4 py-2.5 text-sm text-[#0a0a0a] hover:bg-white"
                >
                  Start free beta
                </button>
              ) : (
                <button
                  type="button"
                  onClick={goToApp}
                  className="w-full rounded-lg bg-[#f2f2f2] px-4 py-2.5 text-sm text-[#0a0a0a] hover:bg-white"
                >
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
