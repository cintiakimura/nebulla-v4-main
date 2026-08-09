import React, { useState, useEffect } from 'react';
import { Logo } from './Logo';
import { Rocket, ArrowRight, CheckCircle, Terminal, LayoutGrid, Handshake, Network, Palette, Bug, Cpu, Globe, MoreHorizontal, PlusCircle, Save, Trash2, CreditCard, Camera, List, Code, User } from 'lucide-react';
import { FORCE_GUEST_MODE } from '../lib/testingBranch';

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
    onEnter();
  };

  return (
    <div className="nebula-landing-page flex min-h-screen flex-col text-on-surface font-body font-normal">
      {/* Wallpaper comes from AppShell — content only here */}
      <div className="nebula-landing-page__content relative z-[2] flex min-h-screen flex-col">
      {/* Header */}
      <header className="ide-glass-chrome h-16 border-b border-border flex items-center px-8 justify-between shrink-0">
        <div className="flex items-center gap-2 text-cyan-300">
          <Logo className="w-8 h-8" />
          <span className="font-headline text-lg font-normal">nebulla</span>
        </div>
        <div className="flex items-center gap-2">
          {FORCE_GUEST_MODE ? (
            <a
              href="/app"
              className="px-3 py-2 text-slate-400 hover:text-cyan-200 transition-all font-headline text-sm font-normal"
            >
              Open IDE
            </a>
          ) : (
            <a
              href="/login"
              className="px-3 py-2 text-slate-400 hover:text-cyan-200 transition-all font-headline text-sm font-normal"
            >
              Sign in
            </a>
          )}
          <button
            type="button"
            onClick={onEnter}
            className="btn-cyan rounded-md px-4 py-2 font-headline text-sm"
          >
            {FORCE_GUEST_MODE ? 'Open app' : 'Closed beta'}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-8 md:p-16 lg:p-24 flex flex-col gap-24">
        {/* Hero */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-8 items-center">
          <div className="flex flex-col gap-6 text-left max-w-2xl">
            <div className="inline-flex w-fit items-center gap-2 rounded-full bg-cyan-500/10 px-3 py-1 font-headline text-xs font-normal text-cyan-300">
              <Rocket className="h-3.5 w-3.5" aria-hidden />
              Free closed beta · invite only
            </div>
            <h1 className="text-4xl md:text-6xl font-headline text-slate-100 font-normal leading-tight">
              The first architecture-focused<br/>AI builder.
            </h1>
            <p className="text-lg md:text-xl text-slate-300 font-normal max-w-2xl leading-relaxed">
              Plan → UI Studio Beta → code → preview in one workspace. Free during closed beta — no payment required.
            </p>
            <div className="flex flex-col gap-8 mt-4">
              <button
                type="button"
                onClick={onEnter}
                className="btn-cyan inline-flex w-fit items-center gap-2 rounded-lg px-6 py-3 font-headline text-base"
              >
                Enter workspace
                <ArrowRight className="h-4.5 w-4.5" aria-hidden />
              </button>
            </div>
          </div>
          
          <div className="ide-glass-card flex flex-col justify-center items-start lg:items-end p-8 lg:p-12">
            <div className="text-4xl md:text-5xl lg:text-6xl font-headline text-cyan-300 font-normal tracking-tight mb-6">
              Free beta
            </div>
            <p className="text-xl md:text-2xl text-slate-200 font-normal max-w-sm text-left lg:text-right leading-snug">
              Invite-only closed beta<br/>
              <span className="text-cyan-400/80">Core ride only</span><br/>
              <span className="text-slate-400">Paid plan after beta (€19.99)</span>
            </p>
          </div>
        </section>

        {/* Features Grid */}
        <section className="flex flex-col gap-12 text-left">
          <h2 className="text-2xl md:text-3xl font-headline text-slate-100 font-normal">
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
            
            <div className="ide-glass-card lg:col-span-1 flex flex-col gap-6 p-8">
              <h3 className="text-xl font-headline text-cyan-300 font-normal mb-2">All Features Included</h3>
              <ul className="flex flex-col gap-4">
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
                  <li key={i} className="flex items-start gap-3 text-slate-300 text-sm">
                    <CheckCircle className="w-4.5 h-4.5 text-cyan-500 shrink-0 mt-0.5" />
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
            <h2 className="text-2xl md:text-3xl font-headline text-slate-100 font-normal">
              A glimpse into the workspace
            </h2>
            <p className="text-slate-300 text-lg font-normal max-w-2xl">
              Experience the seamless integration of our IDE and Architecture Mind Map. Everything is designed to keep you in the flow.
            </p>
          </div>
          
          {/* Full IDE Mockup */}
          <div className="ide-glass-card overflow-hidden flex flex-col aspect-[16/10] md:aspect-[16/9] w-full">
            {/* Header */}
            <div className="h-8 md:h-10 border-b border-white/5 flex items-center px-4 gap-2 shrink-0 bg-black/30">
              <div className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-red-500/80"></div>
              <div className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-yellow-500/80"></div>
              <div className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-green-500/80"></div>
              <div className="ml-2 md:ml-4 text-[10px] md:text-xs text-slate-400 font-mono flex items-center gap-2">
                <Terminal className="w-3 h-3 md:w-3.5 md:h-3.5" />
                nebulla workspace
              </div>
            </div>
            
            {/* Main Workspace */}
            <div className="flex flex-1 overflow-hidden">
              {/* Left Sidebar (Assistant) */}
              <div className="hidden md:flex w-1/4 max-w-[240px] flex-col border-r border-border bg-black/20">
                <div className="flex items-center gap-2 border-b border-border p-2 font-headline text-[10px] text-cyan-300 md:p-3 md:text-xs">
                  <Cpu className="h-3.5 w-3.5" aria-hidden />
                  AI Assistant
                </div>
                <div className="flex flex-1 flex-col gap-3 overflow-hidden p-3">
                  <div className="rounded-lg bg-cyan-500/10 p-2 text-[10px] text-slate-300">
                    I've generated the authentication flow. Would you like to review the mind map?
                  </div>
                  <div className="self-end rounded-lg bg-white/5 p-2 text-[10px] text-slate-400">
                    Yes, show me the architecture.
                  </div>
                  <div className="rounded-lg bg-cyan-500/10 p-2 text-[10px] text-slate-300">
                    Here is the updated structure with the new nodes connected.
                  </div>
                </div>
              </div>
              
              {/* Center (Mind Map) — decorative mock only */}
              <div className="relative flex flex-1 flex-col overflow-hidden bg-transparent">
                <div
                  className="absolute inset-0 opacity-20"
                  style={{ backgroundImage: 'radial-gradient(#334155 1px, transparent 1px)', backgroundSize: '24px 24px' }}
                  aria-hidden
                />
                
                {/* Tabs */}
                <div className="z-10 flex h-8 shrink-0 items-center border-b border-border bg-black/20 px-2">
                  <div className="flex items-center gap-1 bg-cyan-500/10 px-3 py-1 text-[10px] text-cyan-300">
                    <Network className="h-3 w-3" aria-hidden />
                    Mind Map
                  </div>
                  <div className="flex items-center gap-1 px-3 py-1 text-[10px] text-slate-500">
                    <List className="h-3 w-3" aria-hidden />
                    Master Plan
                  </div>
                </div>
                
                {/* Nodes & Edges */}
                <div className="relative min-h-0 flex-1">
                  <svg className="pointer-events-none absolute inset-0 z-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
                    <path d="M 30 50 Q 45 30 60 30" fill="none" stroke="#22d3ee" strokeWidth="1.5" className="opacity-50" />
                    <path d="M 30 50 L 60 50" fill="none" stroke="#22d3ee" strokeWidth="1.5" className="opacity-50" />
                    <path d="M 30 50 Q 45 70 60 70" fill="none" stroke="#22d3ee" strokeWidth="1.5" className="opacity-50" />
                  </svg>
                  
                  <div className="absolute left-[15%] top-[45%] z-10 w-24 -translate-y-1/2 rounded-lg border border-border bg-black/40 p-2 md:left-[20%] md:w-32 md:p-3">
                    <div className="truncate font-headline text-[10px] font-normal text-cyan-300 md:text-xs">App.tsx</div>
                    <div className="mt-1 truncate text-[8px] text-slate-400 md:text-[10px]">Main Application</div>
                  </div>
                  
                  <div className="absolute left-[55%] top-[30%] z-10 w-24 -translate-y-1/2 rounded-lg border border-border bg-black/35 p-2 md:left-[60%] md:w-32 md:p-3">
                    <div className="truncate font-headline text-[10px] font-normal text-slate-200 md:text-xs">Auth Flow</div>
                    <div className="mt-1 truncate text-[8px] text-slate-400 md:text-[10px]">Firebase Integration</div>
                  </div>
                  
                  <div className="absolute left-[55%] top-[50%] z-10 w-24 -translate-y-1/2 rounded-lg border border-border bg-black/35 p-2 md:left-[60%] md:w-32 md:p-3">
                    <div className="truncate font-headline text-[10px] font-normal text-slate-200 md:text-xs">Dashboard</div>
                    <div className="mt-1 truncate text-[8px] text-slate-400 md:text-[10px]">User Projects</div>
                  </div>
                  
                  <div className="absolute left-[55%] top-[70%] z-10 w-24 -translate-y-1/2 rounded-lg border border-border bg-black/35 p-2 md:left-[60%] md:w-32 md:p-3">
                    <div className="truncate font-headline text-[10px] font-normal text-slate-200 md:text-xs">Settings</div>
                    <div className="mt-1 truncate text-[8px] text-slate-400 md:text-[10px]">Preferences</div>
                  </div>
                </div>
              </div>
              
              {/* Right Sidebar (Code) */}
              <div className="hidden max-w-[320px] w-1/3 flex-col border-l border-border bg-black/25 lg:flex">
                <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border px-3 font-mono text-[10px] text-slate-400">
                  <Code className="h-3 w-3 text-cyan-400" aria-hidden />
                  App.tsx
                </div>
                <div className="p-4 font-mono text-[10px] text-slate-300 flex flex-col gap-1.5 overflow-hidden">
                  <div><span className="text-purple-400">import</span> {'{'} useState {'}'} <span className="text-purple-400">from</span> <span className="text-green-300">'react'</span>;</div>
                  <div><span className="text-purple-400">import</span> {'{'} AssistantSidebar {'}'} <span className="text-purple-400">from</span> <span className="text-green-300">'./components'</span>;</div>
                  <br/>
                  <div><span className="text-purple-400">export default function</span> <span className="text-blue-400">App</span>() {'{'}</div>
                  <div className="pl-4"><span className="text-purple-400">return</span> (</div>
                  <div className="pl-8">{'<'}div className=<span className="text-green-300">"flex h-screen"</span>{'>'}</div>
                  <div className="pl-12">{'<'}AssistantSidebar /{'>'}</div>
                  <div className="pl-12">{'<'}MindMap /{'>'}</div>
                  <div className="pl-8">{'<'}/div{'>'}</div>
                  <div className="pl-4">);</div>
                  <div>{'}'}</div>
                </div>
              </div>
            </div>
            
            {/* Bottom Terminal */}
            <div className="flex h-20 shrink-0 flex-col border-t border-border bg-black/25 md:h-24">
              <div className="flex h-6 items-center gap-2 border-b border-border px-3 font-mono text-[10px] text-slate-500">
                <Terminal className="h-3 w-3" aria-hidden />
                Terminal
              </div>
              <div className="p-2 font-mono text-[10px] text-slate-400 flex flex-col gap-1 overflow-hidden">
                <div className="flex gap-2"><span className="text-green-400">➜</span> <span className="text-cyan-400">nebula</span> npm run dev</div>
                <div className="text-slate-500">VITE v5.0.0 ready in 250 ms</div>
                <div className="text-green-400">➜ Local: http://localhost:3000/</div>
              </div>
            </div>
          </div>
        </section>

        {/* Beta CTA */}
        <section className="ide-glass-card p-8 md:p-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-8 text-left">
          <div className="flex flex-col gap-4">
            <h2 className="text-base font-normal text-cyan-300">
              Closed beta — invite only.
            </h2>
            <p className="text-slate-300 text-sm font-normal leading-relaxed">
              Critical path: Plan → UI Studio Beta → one coding slice → App Preview. Billing is off. See BETA-STATUS for what works.
            </p>
          </div>
          <button
            type="button"
            onClick={handleTryFree}
            className="btn-cyan whitespace-nowrap rounded-xl px-6 py-3 text-sm"
          >
            Enter workspace
          </button>
        </section>
      </main>

      <footer className="ide-glass-chrome shrink-0 border-t border-border py-6 px-8 flex flex-wrap items-center justify-center gap-6 text-13 text-slate-500">
        <a href="/payment" className="text-slate-400 hover:text-cyan-300 transition-colors no-underline">
          Payment
        </a>
        <span className="text-slate-600" aria-hidden>
          ·
        </span>
        <a href="/privacy" className="text-slate-400 hover:text-cyan-300 transition-colors no-underline">
          Privacy Policy
        </a>
        <span className="text-slate-600" aria-hidden>
          ·
        </span>
        <a href="/terms" className="text-slate-400 hover:text-cyan-300 transition-colors no-underline">
          Terms of Service
        </a>
        <span className="text-slate-600" aria-hidden>
          ·
        </span>
        <a href="/legal/dpa" className="text-slate-400 hover:text-cyan-300 transition-colors no-underline">
          DPA
        </a>
      </footer>
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="ide-glass-card p-6 flex flex-col gap-4 text-left">
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400">
        {icon}
      </div>
      <h3 className="text-xl font-headline text-slate-100 font-normal">{title}</h3>
      <p className="text-slate-300 text-sm font-normal leading-relaxed">{description}</p>
    </div>
  );
}
