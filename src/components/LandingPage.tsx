import { useEffect } from 'react';
import { Logo } from './Logo';
import { cn } from '@/lib/utils';
import { FORCE_GUEST_MODE } from '../lib/testingBranch';
import { LandingHeroPrompt } from './LandingHeroPrompt';
import { fetchSessionUser } from '../lib/nebulaCloud';
import { goToApp } from '../lib/authNavigate';
import { markForceDashboardOnce } from '../lib/guidedFunnel';

interface LandingPageProps {
  onEnter: () => void;
}

const PATH = [
  {
    step: '01',
    title: 'Plan',
    body: 'Goal becomes a Master Plan and mind map — the architecture stays grounded.',
  },
  {
    step: '02',
    title: 'Build',
    body: 'Chat and preview on one surface. Edit the product while you talk.',
  },
  {
    step: '03',
    title: 'Code',
    body: 'Open the files, commit when ready, keep the workspace as source of truth.',
  },
  {
    step: '04',
    title: 'Deploy',
    body: 'Ship a temporary URL, then attach your domain when you are ready.',
  },
] as const;

/**
 * Landing — Linear-like type rhythm + sparse bands; composer owns the first viewport.
 * Handoff via LandingHeroPrompt unchanged.
 */
export function LandingPage({ onEnter }: LandingPageProps) {
  /** T8 — signed-in users skip marketing landing → Dashboard. */
  useEffect(() => {
    if (FORCE_GUEST_MODE) return;
    let cancelled = false;
    void fetchSessionUser().then((u) => {
      if (cancelled || !u) return;
      markForceDashboardOnce();
      goToApp();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get('success')) {
      window.history.replaceState({}, document.title, window.location.pathname);
      onEnter();
    }
    if (query.get('canceled')) {
      window.history.replaceState({}, document.title, window.location.pathname);
      alert('Payment canceled.');
    }
  }, [onEnter]);

  const handleTryFree = () => {
    markForceDashboardOnce();
    onEnter();
  };

  return (
    <div className="nebula-landing-page flex min-h-screen flex-col font-body text-foreground">
      <div className="nebula-landing-page__content relative z-[2] flex min-h-screen flex-col">
        <header className="ide-glass-chrome flex h-14 shrink-0 items-center justify-between border-b border-border px-5 md:px-10">
          <div className="flex items-center gap-2.5">
            <Logo className="h-9 w-9 md:h-10 md:w-10" />
            <span className="app-logotype text-[15px] tracking-[0.03em] md:text-base">Nebulla</span>
          </div>
          <div className="flex items-center gap-2">
            {FORCE_GUEST_MODE ? (
              <a
                href="/app"
                onClick={() => markForceDashboardOnce()}
                className="btn-secondary-surface inline-flex h-8 items-center rounded-md px-3 text-xs text-muted-foreground"
              >
                Open app
              </a>
            ) : (
              <a
                href="/login"
                className="btn-secondary-surface inline-flex h-8 items-center rounded-md px-3 text-xs text-muted-foreground"
              >
                Log in
              </a>
            )}
            <button type="button" onClick={handleTryFree} className="btn-cyan">
              {FORCE_GUEST_MODE ? 'Enter workspace' : 'Closed beta'}
            </button>
          </div>
        </header>

        <main className="flex flex-1 flex-col">
          {/* Hero — one display line; grouped band, not viewport-centered void */}
          <section className="landing-hero flex flex-col items-center text-center">
            <div className="landing-measure flex flex-col items-center">
              <p className="landing-label">NEBULLA</p>
              <h1 className="landing-display mt-2">
                Talk like a friend.
                <br />
                Build like a pro.
              </h1>
              <p className="landing-body mt-4 max-w-[34rem]">
                Architecture-first. You describe the goal — Nebulla plans and builds a real product
                you can launch, not a dead mockup.
              </p>
              <LandingHeroPrompt className="mt-6 w-full" />
            </div>
          </section>

          {/* Product proof */}
          <section className="landing-section border-t border-border">
            <div className="mx-auto max-w-5xl">
              <p className="landing-label">Workspace</p>
              <h2 className="landing-title mt-2 max-w-2xl">Architecture first. One surface.</h2>
              <p className="landing-body mt-4 max-w-xl">
                Plan, build, and ship without stacking tools. Borders divide the work — not cards.
              </p>

              <div className="mt-12 overflow-hidden rounded-lg border border-border">
                <div className="flex h-8 items-center gap-2 border-b border-border px-4">
                  <span className="h-2 w-2 rounded-full border border-border" />
                  <span className="h-2 w-2 rounded-full border border-border" />
                  <span className="h-2 w-2 rounded-full border border-border" />
                  <span className="landing-label-mono ml-2">Build · Preview · Chat</span>
                </div>
                <div className="grid min-h-[14rem] grid-cols-1 md:min-h-[18rem] md:grid-cols-[1fr_280px]">
                  <div className="relative border-b border-border md:border-b-0 md:border-r">
                    <div
                      className="absolute inset-0 opacity-[0.12]"
                      style={{
                        backgroundImage: 'radial-gradient(#5a5a5a 1px, transparent 1px)',
                        backgroundSize: '20px 20px',
                      }}
                      aria-hidden
                    />
                    <div className="relative flex h-full flex-col justify-end gap-2 p-6">
                      <p className="landing-label">Preview</p>
                      <p className="max-w-sm text-[15px] font-normal tracking-[-0.01em] text-foreground">
                        Your app takes the stage. Chat stays beside it.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col justify-between p-5">
                    <div>
                      <p className="landing-label">Chat</p>
                      <p className="landing-meta mt-2">Goal · tutoring app for kids</p>
                    </div>
                    <div className="mt-6 space-y-2">
                      <div className="landing-meta rounded-md border border-border px-3 py-2 text-[var(--landing-ink)]">
                        Drafted auth and the first learning path. Review the plan next?
                      </div>
                      <div className="landing-meta ml-auto max-w-[85%] rounded-md border border-border px-3 py-2">
                        Yes — keep the architecture tight.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Path */}
          <section className="landing-section border-t border-border">
            <div className="mx-auto max-w-5xl">
              <p className="landing-label">Path</p>
              <h2 className="landing-title mt-2 max-w-2xl">Plan → Build → Code → Deploy</h2>
              <p className="landing-body mt-4 max-w-xl">
                A clear sequence. No feature wall — just the work in order.
              </p>

              <ol className="mt-12 grid gap-6 border-t border-border pt-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-0">
                {PATH.map((item, i) => (
                  <li
                    key={item.step}
                    className={cn(
                      'lg:px-6 lg:py-2',
                      i > 0 && 'lg:border-l lg:border-border',
                    )}
                  >
                    <p className="landing-label-mono">{item.step}</p>
                    <h3 className="mt-2 text-[15px] font-normal tracking-[-0.01em] text-foreground">
                      {item.title}
                    </h3>
                    <p className="landing-meta mt-2 max-w-[28ch]">{item.body}</p>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          {/* Close */}
          <section className="landing-section border-t border-border">
            <div className="mx-auto flex max-w-5xl flex-col items-start gap-6 md:flex-row md:items-end md:justify-between">
              <div className="max-w-xl">
                <h2 className="landing-title">
                  Built for the future.
                  <br />
                  Available in closed beta.
                </h2>
                <p className="landing-body mt-4">
                  Invite only. Billing stays off while we finish the critical path.
                </p>
              </div>
              <button type="button" onClick={handleTryFree} className="btn-cyan shrink-0">
                Enter workspace
              </button>
            </div>
          </section>
        </main>

        <footer className="type-label-sm flex shrink-0 flex-wrap items-center justify-center gap-5 border-t border-border px-5 py-8 text-muted-foreground md:gap-8">
          <a href="/payment" className="no-underline transition-colors hover:text-foreground">
            Payment
          </a>
          <a href="/privacy" className="no-underline transition-colors hover:text-foreground">
            Privacy
          </a>
          <a href="/terms" className="no-underline transition-colors hover:text-foreground">
            Terms
          </a>
          <a href="/legal/dpa" className="no-underline transition-colors hover:text-foreground">
            DPA
          </a>
        </footer>
      </div>
    </div>
  );
}
