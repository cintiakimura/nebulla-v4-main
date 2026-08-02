import { useEffect, useState } from 'react';
import { ArrowLeft, Check } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { fetchSessionUser, type NebulaSessionUser } from '../lib/nebulaCloud';
import { goToApp, goToLanding, goToLogin, goToTryFree } from '../lib/authNavigate';

type PlanId = 'free' | 'pro' | 'power';

const PLANS: {
  id: PlanId;
  name: string;
  price: string;
  blurb: string;
  features: string[];
  cta: string;
}[] = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    blurb: 'One trial project free — ship a real product and learn the workflow.',
    features: [
      '1 free trial project',
      'Monthly AI token allowance',
      'UI Studio, Master Plan, Security Scan',
      'Cloud workspace when signed in',
    ],
    cta: 'Start free',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 'Soon',
    blurb: 'For builders who need more projects and headroom.',
    features: [
      'Multiple projects',
      'Higher AI limits',
      'Priority model access',
      'Secrets & DNS tooling',
    ],
    cta: 'Upgrade to Pro',
  },
  {
    id: 'power',
    name: 'Power',
    price: 'Soon',
    blurb: 'Teams and heavy usage — metered when enabled.',
    features: [
      'Everything in Pro',
      'Usage-based billing (when live)',
      'Higher concurrency',
      'Best for production workloads',
    ],
    cta: 'Contact / join waitlist',
  },
];

export function PricingPage() {
  const [user, setUser] = useState<NebulaSessionUser | null>(null);
  const [busy, setBusy] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    void fetchSessionUser().then(setUser);
  }, []);

  const startCheckout = async (plan: PlanId) => {
    setError(null);
    setInfo(null);
    if (plan === 'free') {
      if (user) goToApp();
      else goToTryFree('/app');
      return;
    }
    if (!user) {
      goToLogin('/pricing');
      return;
    }
    setBusy(plan);
    try {
      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      const data = (await res.json()) as { url?: string; error?: string; message?: string };
      if (res.ok && data.url) {
        window.location.assign(data.url);
        return;
      }
      setInfo(
        data.message ||
          data.error ||
          'Stripe checkout is not fully configured yet. Your plan request was recorded — we will enable billing shortly.',
      );
    } catch {
      setError('Network error. Try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#050508] text-[#f2f2f2]">
      <link
        rel="stylesheet"
        href="https://fonts.bunny.net/css?family=instrument-sans:400,500,600|fraunces:500,600"
      />
      <header className="flex h-16 items-center justify-between border-b border-white/10 px-6 md:px-10">
        <button type="button" onClick={goToLanding} className="flex items-center gap-2.5">
          <Logo className="h-8 w-8" />
          <span style={{ fontFamily: '"Fraunces", Georgia, serif' }} className="text-lg">
            Nebulla
          </span>
        </button>
        <button
          type="button"
          onClick={goToLanding}
          className="inline-flex items-center gap-1.5 text-sm text-[#8a8a8a] hover:text-[#f2f2f2]"
          style={{ fontFamily: '"Instrument Sans", system-ui, sans-serif' }}
        >
          <ArrowLeft className="h-4 w-4" />
          Home
        </button>
      </header>

      <main
        className="mx-auto max-w-5xl px-6 py-14 md:px-10"
        style={{ fontFamily: '"Instrument Sans", system-ui, sans-serif' }}
      >
        <h1
          className="text-4xl tracking-tight md:text-5xl"
          style={{ fontFamily: '"Fraunces", Georgia, serif' }}
        >
          Pricing
        </h1>
        <p className="mt-3 max-w-xl text-[#8a8a8a]">
          Start free with 1 trial project. Upgrade when you need more workspace and AI capacity.
        </p>
        {user ? (
          <p className="mt-2 text-xs text-[#679BD1]">
            Signed in as {user.email || user.displayName} · plan{' '}
            <span className="capitalize">{user.billingTier || 'free'}</span>
          </p>
        ) : null}

        {error ? (
          <p className="mt-4 text-sm text-red-300">{error}</p>
        ) : null}
        {info ? (
          <p className="mt-4 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[#c8c8c8]">
            {info}
          </p>
        ) : null}

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`flex flex-col rounded-xl border px-5 py-6 ${
                plan.id === 'pro'
                  ? 'border-[#679BD1]/40 bg-[#679BD1]/5'
                  : 'border-white/10 bg-black/40'
              }`}
            >
              <h2
                className="text-xl text-[#f2f2f2]"
                style={{ fontFamily: '"Fraunces", Georgia, serif' }}
              >
                {plan.name}
              </h2>
              <p className="mt-1 text-2xl font-medium text-[#f2f2f2]">{plan.price}</p>
              <p className="mt-2 text-sm text-[#8a8a8a]">{plan.blurb}</p>
              <ul className="mt-5 flex-1 space-y-2 text-sm text-[#b8b8b8]">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#679BD1]" aria-hidden />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                disabled={busy === plan.id}
                onClick={() => void startCheckout(plan.id)}
                className={`mt-6 rounded-lg px-4 py-2.5 text-sm font-medium ${
                  plan.id === 'free'
                    ? 'bg-[#f2f2f2] text-[#0a0a0a] hover:bg-white'
                    : 'border border-white/20 text-[#f2f2f2] hover:bg-white/5'
                } disabled:opacity-50`}
              >
                {busy === plan.id
                  ? '…'
                  : plan.id === 'free' && user
                    ? 'Open workspace'
                    : plan.cta}
              </button>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
