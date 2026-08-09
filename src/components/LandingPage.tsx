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
          {/* Hero — one composition; Light display + Regular body (Akkurat weight play) */}
          <section className="flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center px-5 py-16 text-center md:px-10 md:py-24">
            <div className="flex w-full max-w-3xl flex-col items-center gap-6 md:gap-8">
              <p className="text-[12px] font-normal tracking-[0.12em] text-muted-foreground md:text-[13px]">
                NEBULLA
              </p>
              <h1 className="max-w-[16ch] text-[2.85rem] font-light leading-[1.02] tracking-[-0.045em] text-foreground sm:text-5xl md:max-w-none md:text-6xl lg:text-[4.75rem]">
                What are we building?
              </h1>
              <p className="max-w-md text-[15px] font-normal leading-relaxed text-muted-foreground md:max-w-lg md:text-lg">
                Describe the goal. Nebulla holds the plan from idea to live URL.
              </p>
              <LandingHeroPrompt className="mt-2 w-full" />
            </div>
          </section>

          {/* Product proof */}
          <section className="border-t border-border px-5 py-24 md:px-10 md:py-32">
            <div className="mx-auto max-w-5xl">
              <p className="text-[12px] font-normal tracking-[0.12em] text-muted-foreground">
                WORKSPACE
              </p>
              <h2 className="mt-5 max-w-2xl text-3xl font-light leading-[1.1] tracking-[-0.035em] text-foreground md:text-4xl lg:text-[3.25rem]">
                Architecture first. One surface.
              </h2>
              <p className="mt-5 max-w-xl text-[15px] font-normal leading-relaxed text-muted-foreground md:text-base">
                Plan, build, and ship without stacking tools. Borders divide the work — not cards.
              </p>

              <div className="mt-14 overflow-hidden rounded-lg border border-border">
                <div className="flex h-10 items-center gap-2 border-b border-border px-4">
                  <span className="h-2 w-2 rounded-full border border-border" />
                  <span className="h-2 w-2 rounded-full border border-border" />
                  <span className="h-2 w-2 rounded-full border border-border" />
                  <span className="ml-2 text-[11px] tracking-wide text-muted-foreground">
                    Build · Preview · Chat
                  </span>
                </div>
                <div className="grid min-h-[16rem] grid-cols-1 md:min-h-[22rem] md:grid-cols-[1fr_280px]">
                  <div className="relative border-b border-border md:border-b-0 md:border-r">
                    <div
                      className="absolute inset-0 opacity-[0.12]"
                      style={{
                        backgroundImage: 'radial-gradient(#5a5a5a 1px, transparent 1px)',
                        backgroundSize: '20px 20px',
                      }}
                      aria-hidden
                    />
                    <div className="relative flex h-full flex-col justify-end gap-3 p-6 md:p-8">
                      <p className="text-[11px] font-normal tracking-[0.1em] text-muted-foreground">
                        PREVIEW
                      </p>
                      <p className="max-w-sm text-lg font-light tracking-[-0.02em] text-foreground md:text-xl">
                        Your app takes the stage. Chat stays beside it.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col justify-between p-5 md:p-6">
                    <div>
                      <p className="text-[11px] tracking-[0.06em] text-muted-foreground">Chat</p>
                      <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
                        Goal · tutoring app for kids
                      </p>
                    </div>
                    <div className="mt-8 space-y-2">
                      <div className="rounded-md border border-border px-3 py-2 text-[12px] leading-relaxed text-foreground">
                        Drafted auth and the first learning path. Review the plan next?
                      </div>
                      <div className="ml-auto max-w-[85%] rounded-md border border-border px-3 py-2 text-[12px] leading-relaxed text-muted-foreground">
                        Yes — keep the architecture tight.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Path */}
          <section className="border-t border-border px-5 py-24 md:px-10 md:py-32">
            <div className="mx-auto max-w-5xl">
              <p className="text-[12px] font-normal tracking-[0.12em] text-muted-foreground">
                PATH
              </p>
              <h2 className="mt-5 max-w-2xl text-3xl font-light leading-[1.1] tracking-[-0.035em] text-foreground md:text-4xl lg:text-[3.25rem]">
                Plan → Build → Code → Deploy
              </h2>
              <p className="mt-5 max-w-xl text-[15px] font-normal leading-relaxed text-muted-foreground md:text-base">
                A clear sequence. No feature wall — just the work in order.
              </p>

              <ol className="mt-16 grid gap-10 border-t border-border pt-12 sm:grid-cols-2 lg:grid-cols-4 lg:gap-0">
                {PATH.map((item, i) => (
                  <li
                    key={item.step}
                    className={cn(
                      'lg:px-6 lg:py-2',
                      i > 0 && 'lg:border-l lg:border-border',
                    )}
                  >
                    <p className="text-[11px] font-normal tracking-[0.1em] text-muted-foreground">
                      {item.step}
                    </p>
                    <h3 className="mt-3 text-xl font-light tracking-[-0.02em] text-foreground">
                      {item.title}
                    </h3>
                    <p className="mt-3 max-w-[28ch] text-[13px] font-normal leading-relaxed text-muted-foreground md:text-sm">
                      {item.body}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          {/* Close */}
          <section className="border-t border-border px-5 py-24 md:px-10 md:py-28">
            <div className="mx-auto flex max-w-5xl flex-col items-start gap-8 md:flex-row md:items-end md:justify-between">
              <div className="max-w-xl">
                <h2 className="text-3xl font-light leading-[1.1] tracking-[-0.035em] text-foreground md:text-4xl lg:text-[2.75rem]">
                  Built for the future.
                  <br />
                  Available in closed beta.
                </h2>
                <p className="mt-5 text-[15px] font-normal leading-relaxed text-muted-foreground md:text-base">
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
