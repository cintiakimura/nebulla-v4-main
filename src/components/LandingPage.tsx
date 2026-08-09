import React, { useState, useEffect } from 'react';
import { Logo } from './Logo';
import { Rocket, CheckCircle, Terminal, LayoutGrid, Handshake, Network, Palette, Bug, Cpu, Globe, List, Code } from 'lucide-react';
import { FORCE_GUEST_MODE } from '../lib/testingBranch';
import { LandingHeroPrompt } from './LandingHeroPrompt';
import { fetchSessionUser } from '../lib/nebulaCloud';
import { goToApp } from '../lib/authNavigate';
import { markForceDashboardOnce } from '../lib/guidedFunnel';

interface LandingPageProps {
  onEnter: () => void;
}

export function LandingPage({ onEnter }: LandingPageProps) {
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    // Mock authentication check from local storage
    const savedUser = localStorage.getItem('nebula_user');
    if (savedUser) {
      const user = JSON.parse(savedUser);
      setUserEmail(user.email || null);
    }
  }, []);

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
    <div className="nebula-landing-page flex min-h-screen flex-col text-on-surface font-body font-normal">
      {/* Wallpaper comes from AppShell — content only here */}
      <div className="nebula-landing-page__content relative z-[2] flex min-h-screen flex-col">
      {/* Header */}
      <header className="ide-glass-chrome flex h-12 shrink-0 items-center justify-between border-b border-border px-5 md:px-8">
        <div className="flex items-center gap-2">
          <Logo className="h-8 w-8" />
          <span className="app-logotype">Nebulla.beta</span>
        </div>
        <div className="flex items-center gap-2">
          {FORCE_GUEST_MODE ? (
            <a
              href="/app"
              onClick={() => markForceDashboardOnce()}
              className="btn-secondary-surface inline-flex h-8 items-center rounded-md px-3 text-xs text-muted-foreground"
            >
              Open IDE
            </a>
          ) : (
            <a
              href="/login"
              className="btn-secondary-surface inline-flex h-8 items-center rounded-md px-3 text-xs text-muted-foreground"
            >
              Sign in
            </a>
          )}
          <button
            type="button"
            onClick={handleTryFree}
            className="btn-cyan"
          >
            {FORCE_GUEST_MODE ? 'Open app' : 'Closed beta'}
          </button>
        </div>
      </header>

      {/* Main Content — prompt on top, full landing below */}
      <main className="flex flex-1 flex-col gap-24 p-8 md:p-16 lg:p-24">
        {/* Hero: goal prompt (handoff kept); marketing continues below */}
        <section className="flex min-h-[calc(100vh-8rem)] flex-col items-center justify-center gap-8 py-10 text-center md:gap-10 md:py-14">
          <div className="flex max-w-3xl flex-col items-center gap-4">
            <p className="app-logotype text-base tracking-[0.04em] md:text-lg">Nebulla</p>
            <p className="type-label-sm inline-flex items-center gap-1.5">
              <Rocket className="h-3.5 w-3.5" aria-hidden />
              Free closed beta · invite only
            </p>
            <h1 className="type-page text-[2rem] leading-tight tracking-tight md:text-5xl lg:text-6xl">
              What are we building?
            </h1>
            <p className="type-body-md max-w-2xl text-muted-foreground md:text-[15px]">
              Just goal of your idea is enough — type in a few words or brainstorm using the mic
            </p>
          </div>
          <LandingHeroPrompt className="w-full" />
        </section>

        {/* Features Grid */}
        <section className="flex flex-col gap-12 text-left">
          <h2 className="type-page md:text-2xl">
            Everything you need to build at scale.
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12">
            <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
              <FeatureCard 
                icon={<Globe className="w-6 h-6" />} 
                title="No credit limits" 
                description="Build without boundaries. We don't cap your creativity or charge per generation."
              />
              <FeatureCard 
                icon={<LayoutGrid className="w-6 h-6" />} 
                title="All in one solution" 
                description="From architecture to deployment, everything happens in one unified workspace."
              />
              <FeatureCard 
                icon={<Handshake className="w-6 h-6" />} 
                title="Dev partner" 
                description="More than a code generator. An AI that understands your architecture and context."
              />
              <FeatureCard 
                icon={<Network className="w-6 h-6" />} 
                title="Mind map" 
                description="Visualize your entire application structure, user flows, and database schemas instantly."
              />
              <FeatureCard 
                icon={<Palette className="w-6 h-6" />} 
                title="AI gen. UI Mockup with 3 options" 
                description="Generate multiple UI variations for any component and choose the perfect fit."
              />
              <FeatureCard 
                icon={<Bug className="w-6 h-6" />} 
                title="Self debugging method" 
                description="Automated error detection and resolution that learns from your codebase."
              />
            </div>
            
            <div className="ide-glass-card lg:col-span-1 flex flex-col gap-6 rounded-lg p-6 md:p-8">
              <h3 className="type-section mb-1">All features included</h3>
              <ul className="flex flex-col gap-3">
                {[
                  "Handsfree open talk, no more prompts",
                  "Backend functions",
                  "Database",
                  "Github integration",
                  "The latest AI dev model",
                  "Connect domain",
                  "Master plan - save all info no more hallucinations",
                  "Mind map - visualize your architecture, drag and drop",
                  "UI/UX mockup - AI gen. choose from 3 options",
                  "Self debugging method"
                ].map((feature, i) => (
                  <li key={i} className="type-body-dense flex items-start gap-3 text-muted-foreground">
                    <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
                    <span className="leading-tight">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* App Preview / Screenshots */}
        <section className="flex flex-col gap-8 text-left w-full max-w-6xl mx-auto">
          <div className="flex flex-col gap-2">
            <h2 className="type-page md:text-2xl">
              A glimpse into the workspace
            </h2>
            <p className="type-body-md max-w-2xl text-muted-foreground">
              IDE and architecture mind map in one surface — keep flow without switching tools.
            </p>
          </div>
          
          {/* Full IDE Mockup */}
          <div className="ide-glass-card flex aspect-[16/10] w-full flex-col overflow-hidden rounded-lg md:aspect-[16/9]">
            {/* Header */}
            <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-4 md:h-10">
              <div className="h-2.5 w-2.5 rounded-full border border-border md:h-3 md:w-3" />
              <div className="h-2.5 w-2.5 rounded-full border border-border md:h-3 md:w-3" />
              <div className="h-2.5 w-2.5 rounded-full border border-border md:h-3 md:w-3" />
              <div className="type-micro ml-2 flex items-center gap-2 font-mono md:ml-4">
                <Terminal className="h-3 w-3 md:h-3.5 md:w-3.5" />
                nebulla workspace
              </div>
            </div>
            
            {/* Main Workspace */}
            <div className="flex flex-1 overflow-hidden">
              {/* Left Sidebar (Assistant) */}
              <div className="hidden w-1/4 max-w-[240px] flex-col border-r border-border md:flex">
                <div className="type-label-sm flex items-center gap-2 border-b border-border p-2 md:p-3">
                  <Cpu className="h-3.5 w-3.5" aria-hidden />
                  Chat
                </div>
                <div className="flex flex-1 flex-col gap-3 overflow-hidden p-3">
                  <div className="type-micro rounded-md border border-border px-2 py-1.5 text-foreground">
                    I've generated the authentication flow. Would you like to review the mind map?
                  </div>
                  <div className="type-micro self-end rounded-md border border-border px-2 py-1.5 text-muted-foreground">
                    Yes, show me the architecture.
                  </div>
                  <div className="type-micro rounded-md border border-border px-2 py-1.5 text-foreground">
                    Here is the updated structure with the new nodes connected.
                  </div>
                </div>
              </div>
              
              {/* Center (Mind Map) — decorative mock only */}
              <div className="relative flex flex-1 flex-col overflow-hidden bg-transparent">
                <div
                  className="absolute inset-0 opacity-15"
                  style={{ backgroundImage: 'radial-gradient(#3a3a3a 1px, transparent 1px)', backgroundSize: '24px 24px' }}
                  aria-hidden
                />
                
                {/* Tabs */}
                <div className="z-10 flex h-8 shrink-0 items-center border-b border-border px-2">
                  <div className="type-micro flex items-center gap-1 border border-border px-3 py-1 text-foreground">
                    <Network className="h-3 w-3" aria-hidden />
                    Mind Map
                  </div>
                  <div className="type-micro flex items-center gap-1 px-3 py-1">
                    <List className="h-3 w-3" aria-hidden />
                    Master Plan
                  </div>
                </div>
                
                {/* Nodes & Edges */}
                <div className="relative min-h-0 flex-1">
                  <svg className="pointer-events-none absolute inset-0 z-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
                    <path d="M 30 50 Q 45 30 60 30" fill="none" stroke="#5a5a5a" strokeWidth="1.5" className="opacity-70" />
                    <path d="M 30 50 L 60 50" fill="none" stroke="#5a5a5a" strokeWidth="1.5" className="opacity-70" />
                    <path d="M 30 50 Q 45 70 60 70" fill="none" stroke="#5a5a5a" strokeWidth="1.5" className="opacity-70" />
                  </svg>
                  
                  <div className="absolute left-[15%] top-[45%] z-10 w-24 -translate-y-1/2 rounded-md border border-border p-2 md:left-[20%] md:w-32 md:p-3">
                    <div className="type-label-sm truncate text-foreground">App.tsx</div>
                    <div className="type-micro mt-1 truncate">Main Application</div>
                  </div>
                  
                  <div className="absolute left-[55%] top-[30%] z-10 w-24 -translate-y-1/2 rounded-md border border-border p-2 md:left-[60%] md:w-32 md:p-3">
                    <div className="type-label-sm truncate text-foreground">Auth Flow</div>
                    <div className="type-micro mt-1 truncate">Firebase Integration</div>
                  </div>
                  
                  <div className="absolute left-[55%] top-[50%] z-10 w-24 -translate-y-1/2 rounded-md border border-border p-2 md:left-[60%] md:w-32 md:p-3">
                    <div className="type-label-sm truncate text-foreground">Dashboard</div>
                    <div className="type-micro mt-1 truncate">User Projects</div>
                  </div>
                  
                  <div className="absolute left-[55%] top-[70%] z-10 w-24 -translate-y-1/2 rounded-md border border-border p-2 md:left-[60%] md:w-32 md:p-3">
                    <div className="type-label-sm truncate text-foreground">Settings</div>
                    <div className="type-micro mt-1 truncate">Preferences</div>
                  </div>
                </div>
              </div>
              
              {/* Right Sidebar (Code) */}
              <div className="hidden w-1/3 max-w-[320px] flex-col border-l border-border lg:flex">
                <div className="type-micro flex h-8 shrink-0 items-center gap-2 border-b border-border px-3 font-mono">
                  <Code className="h-3 w-3 text-foreground" aria-hidden />
                  App.tsx
                </div>
                <div className="flex flex-col gap-1.5 overflow-hidden p-4 font-mono text-[10px] text-muted-foreground">
                  <div><span className="text-foreground/70">import</span> {'{'} useState {'}'} <span className="text-foreground/70">from</span> <span className="text-foreground">'react'</span>;</div>
                  <div><span className="text-foreground/70">import</span> {'{'} AssistantSidebar {'}'} <span className="text-foreground/70">from</span> <span className="text-foreground">'./components'</span>;</div>
                  <br/>
                  <div><span className="text-foreground/70">export default function</span> <span className="text-foreground">App</span>() {'{'}</div>
                  <div className="pl-4"><span className="text-foreground/70">return</span> (</div>
                  <div className="pl-8">{'<'}div className=<span className="text-foreground">"flex h-screen"</span>{'>'}</div>
                  <div className="pl-12">{'<'}AssistantSidebar /{'>'}</div>
                  <div className="pl-12">{'<'}MindMap /{'>'}</div>
                  <div className="pl-8">{'<'}/div{'>'}</div>
                  <div className="pl-4">);</div>
                  <div>{'}'}</div>
                </div>
              </div>
            </div>
            
            {/* Bottom Terminal */}
            <div className="flex h-20 shrink-0 flex-col border-t border-border md:h-24">
              <div className="type-micro flex h-6 items-center gap-2 border-b border-border px-3 font-mono">
                <Terminal className="h-3 w-3" aria-hidden />
                Terminal
              </div>
              <div className="type-micro flex flex-col gap-1 overflow-hidden p-2 font-mono">
                <div className="flex gap-2"><span className="text-foreground">➜</span> <span className="text-foreground">nebula</span> npm run dev</div>
                <div>VITE v5.0.0 ready in 250 ms</div>
                <div className="text-foreground">➜ Local: http://localhost:3000/</div>
              </div>
            </div>
          </div>
        </section>

        {/* Beta CTA */}
        <section className="ide-glass-card flex flex-col items-start justify-between gap-6 rounded-lg p-6 text-left md:flex-row md:items-center md:gap-8 md:p-8">
          <div className="flex flex-col gap-2">
            <h2 className="type-section">
              Closed beta — invite only.
            </h2>
            <p className="type-body-dense text-muted-foreground">
              Critical path: Plan → UI Studio Beta → one coding slice → App Preview. Billing is off.
            </p>
          </div>
          <button
            type="button"
            onClick={handleTryFree}
            className="btn-cyan whitespace-nowrap"
          >
            Enter workspace
          </button>
        </section>
      </main>

      <footer className="ide-glass-chrome type-label-sm flex shrink-0 flex-wrap items-center justify-center gap-6 border-t border-border px-8 py-5">
        <a href="/payment" className="text-muted-foreground no-underline transition-colors hover:text-foreground">
          Payment
        </a>
        <span aria-hidden>·</span>
        <a href="/privacy" className="text-muted-foreground no-underline transition-colors hover:text-foreground">
          Privacy Policy
        </a>
        <span aria-hidden>·</span>
        <a href="/terms" className="text-muted-foreground no-underline transition-colors hover:text-foreground">
          Terms of Service
        </a>
        <span aria-hidden>·</span>
        <a href="/legal/dpa" className="text-muted-foreground no-underline transition-colors hover:text-foreground">
          DPA
        </a>
      </footer>
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-5 text-left">
      <div className="flex h-8 w-8 items-center justify-center text-foreground">
        {icon}
      </div>
      <h3 className="type-section">{title}</h3>
      <p className="type-body-dense text-muted-foreground">{description}</p>
    </div>
  );
}
