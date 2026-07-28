import { useEffect, useState } from 'react';
import { ArrowRight, Layers, Shield, Sparkles } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { fetchSessionUser, setWorkspaceModePreference } from '../lib/nebulaCloud';
import { goToApp, goToLogin, goToPricing } from '../lib/authNavigate';

/**
 * Public marketing home — brand-first, one composition.
 * Free tier: one project; paid unlocks more.
 */
export function MarketingLandingPage() {
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void fetchSessionUser().then((u) => {
      if (cancelled) return;
      setChecking(false);
      // Optional: signed-in users can jump straight to the IDE
      if (u && new URLSearchParams(window.location.search).get('stay') !== '1') {
        /* stay on marketing unless they click Open workspace */
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const startFree = () => goToLogin('/app');
  const tryGuest = () => {
    setWorkspaceModePreference('guest');
    goToApp();
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050508] text-[#f2f2f2]">
      <link
        rel="stylesheet"
        href="https://fonts.bunny.net/css?family=instrument-sans:400,500,600|fraunces:500,600"
      />
      {/* Atmosphere */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(103,155,209,0.18), transparent 55%), radial-gradient(ellipse 60% 40% at 90% 20%, rgba(198,147,124,0.08), transparent 50%), linear-gradient(180deg, #050508 0%, #0a0a0f 45%, #050508 100%)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.85\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'0.05\'/%3E%3C/svg%3E")',
        }}
      />

      <header className="relative z-10 flex h-16 items-center justify-between px-6 md:px-10">
        <div className="flex items-center gap-2.5">
          <Logo className="h-8 w-8" />
          <span
            className="text-lg tracking-tight text-[#f2f2f2]"
            style={{ fontFamily: '"Fraunces", Georgia, serif' }}
          >
            Nebulla
          </span>
        </div>
        <nav className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={goToPricing}
            className="hidden sm:inline-flex rounded-md px-3 py-1.5 text-sm text-[#a8a8a8] hover:text-[#f2f2f2]"
            style={{ fontFamily: '"Instrument Sans", system-ui, sans-serif' }}
          >
            Pricing
          </button>
          <button
            type="button"
            onClick={() => goToLogin('/app')}
            className="rounded-md px-3 py-1.5 text-sm text-[#a8a8a8] hover:text-[#f2f2f2]"
            style={{ fontFamily: '"Instrument Sans", system-ui, sans-serif' }}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={startFree}
            className="rounded-md bg-[#f2f2f2] px-3.5 py-1.5 text-sm font-medium text-[#0a0a0a] hover:bg-white"
            style={{ fontFamily: '"Instrument Sans", system-ui, sans-serif' }}
          >
            Start free
          </button>
        </nav>
      </header>

      <main className="relative z-10 flex min-h-[calc(100vh-4rem)] flex-col justify-center px-6 pb-20 pt-10 md:px-10 md:pb-28">
        <div className="mx-auto w-full max-w-3xl">
          <p
            className="mb-4 text-sm tracking-[0.2em] uppercase text-[#679BD1]/90"
            style={{ fontFamily: '"Instrument Sans", system-ui, sans-serif' }}
          >
            Architecture-first AI builder
          </p>
          <h1
            className="text-5xl leading-[1.05] tracking-tight text-[#f2f2f2] sm:text-6xl md:text-7xl"
            style={{ fontFamily: '"Fraunces", Georgia, serif', fontWeight: 550 }}
          >
            Nebulla
          </h1>
          <p
            className="mt-6 max-w-xl text-lg leading-relaxed text-[#9a9a9a] sm:text-xl"
            style={{ fontFamily: '"Instrument Sans", system-ui, sans-serif' }}
          >
            Plan the system, shape the UI, and ship with an IDE that keeps architecture in the loop —
            not a pile of disconnected AI chats.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={startFree}
              disabled={checking}
              className="inline-flex items-center gap-2 rounded-lg bg-[#f2f2f2] px-5 py-3 text-sm font-medium text-[#0a0a0a] transition hover:bg-white"
              style={{ fontFamily: '"Instrument Sans", system-ui, sans-serif' }}
            >
              Start free — 1 project
              <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={tryGuest}
              className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-5 py-3 text-sm text-[#c8c8c8] hover:border-white/30 hover:text-white"
              style={{ fontFamily: '"Instrument Sans", system-ui, sans-serif' }}
            >
              Try without account
            </button>
          </div>
          <p
            className="mt-4 text-xs text-[#6a6a6a]"
            style={{ fontFamily: '"Instrument Sans", system-ui, sans-serif' }}
          >
            Free includes one active project. Upgrade anytime for more projects and higher AI limits.
          </p>
        </div>

        {/* Full-bleed visual plane under hero copy */}
        <div className="relative mx-auto mt-16 w-full max-w-5xl overflow-hidden rounded-none border-y border-white/10 md:rounded-xl md:border">
          <div
            className="aspect-[21/9] w-full md:aspect-[2.2/1]"
            style={{
              background:
                'linear-gradient(135deg, #0c1220 0%, #12101a 40%, #1a1410 100%), radial-gradient(circle at 30% 40%, rgba(103,155,209,0.25), transparent 45%)',
            }}
          >
            <div className="flex h-full flex-col justify-end p-6 md:p-10">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3" style={{ fontFamily: '"Instrument Sans", system-ui, sans-serif' }}>
                <Feature
                  icon={<Layers className="h-4 w-4 text-[#679BD1]" />}
                  title="Master Plan first"
                  body="Structure before code — pages, data, and flows stay aligned."
                />
                <Feature
                  icon={<Sparkles className="h-4 w-4 text-[#C6937C]" />}
                  title="UI Studio + coding"
                  body="Generate UI, preview, then implement with the same brain."
                />
                <Feature
                  icon={<Shield className="h-4 w-4 text-[#8a8a8a]" />}
                  title="Security Scan"
                  body="Pre-publish checks for secrets and common AI-app mistakes."
                />
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer
        className="relative z-10 border-t border-white/10 px-6 py-6 text-xs text-[#6a6a6a] md:px-10"
        style={{ fontFamily: '"Instrument Sans", system-ui, sans-serif' }}
      >
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <span>© {new Date().getFullYear()} Nebulla</span>
          <div className="flex gap-4">
            <a href="/privacy" className="hover:text-[#a8a8a8]">
              Privacy
            </a>
            <a href="/terms" className="hover:text-[#a8a8a8]">
              Terms
            </a>
            <a href="/pricing" className="hover:text-[#a8a8a8]">
              Pricing
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Feature({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/40 px-4 py-3 backdrop-blur-sm">
      <div className="flex items-center gap-2 text-sm text-[#e8e8e8]">
        {icon}
        {title}
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-[#8a8a8a]">{body}</p>
    </div>
  );
}
