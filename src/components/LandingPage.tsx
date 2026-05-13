import React, { useState, useEffect } from 'react';
import { Logo } from './Logo';
import { Rocket, ArrowRight, CheckCircle, Terminal, LayoutGrid, Handshake, Network, Palette, Bug, Cpu, Globe, MoreHorizontal, PlusCircle, Save, Trash2, CreditCard, Camera, List, Code, User } from 'lucide-react';

interface LandingPageProps {
  onEnter: () => void;
}

export function LandingPage({ onEnter }: LandingPageProps) {
  const [loading, setLoading] = useState(false);
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

  const handleCheckout = async () => {
    onEnter();
  };

  return (
    <div className="min-h-screen bg-background text-on-surface flex flex-col font-body font-normal">
      {/* Header */}
      <header className="h-16 border-b border-white/5 flex items-center px-8 justify-between shrink-0 glass-panel">
        <div className="flex items-center gap-2 text-cyan-300">
          <Logo className="w-8 h-8" />
          <span className="font-headline text-lg font-normal">nebulla</span>
        </div>
        <button 
          onClick={onEnter}
          className="px-4 py-2 bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 rounded-md hover:bg-cyan-500/20 transition-all font-headline text-sm font-normal"
        >
          Try the App
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-8 md:p-16 lg:p-24 flex flex-col gap-24">
        {/* Hero */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-8 items-center">
          <div className="flex flex-col gap-6 text-left max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs font-headline font-normal w-fit">
              <Rocket className="w-3.5 h-3.5" />
              The future of software architecture
            </div>
            <h1 className="text-4xl md:text-6xl font-headline text-slate-200 font-normal leading-tight">
              The first architecture-focused<br/>AI builder.
            </h1>
            <p className="text-lg md:text-xl text-slate-400 font-normal max-w-2xl leading-relaxed">
              Stop wrestling with disjointed tools. Design your system, generate UI mockups, and build your application with a true dev partner.
            </p>
            <div className="flex flex-col gap-8 mt-4">
              <button 
                onClick={onEnter}
                className="px-6 py-3 bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 rounded-lg hover:bg-cyan-500/30 transition-all font-headline text-base font-normal flex items-center gap-2 w-fit"
              >
                Try the App
                <ArrowRight className="w-4.5 h-4.5" />
              </button>
            </div>
          </div>
          
          <div className="flex flex-col justify-center items-start lg:items-end p-8 lg:p-12 rounded-3xl bg-gradient-to-br from-cyan-500/10 to-transparent border border-cyan-500/20">
            <div className="text-7xl md:text-8xl lg:text-9xl font-headline text-cyan-300 font-normal tracking-tight mb-6">
              €19.99
            </div>
            <p className="text-xl md:text-2xl text-slate-300 font-normal max-w-sm text-left lg:text-right leading-snug">
              One tier with all features<br/>
              <span className="text-cyan-400/80">No credit limits</span><br/>
              <span className="text-slate-500">No hidden costs</span>
            </p>
          </div>
        </section>

        {/* Features Grid */}
        <section className="flex flex-col gap-12 text-left">
          <h2 className="text-2xl md:text-3xl font-headline text-slate-200 font-normal">
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
            
            <div className="lg:col-span-1 flex flex-col gap-6 glass-panel border border-white/5 rounded-2xl p-8">
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
            <h2 className="text-2xl md:text-3xl font-headline text-slate-200 font-normal">
              A glimpse into the workspace
            </h2>
            <p className="text-slate-400 text-lg font-normal max-w-2xl">
              Experience the seamless integration of our IDE and Architecture Mind Map. Everything is designed to keep you in the flow.
            </p>
          </div>
          
          {/* Full IDE Mockup */}
          <div className="rounded-xl overflow-hidden border border-white/10 shadow-2xl flex flex-col aspect-[16/10] md:aspect-[16/9] w-full bg-background">
            {/* Header */}
            <div className="h-8 md:h-10 bg-[#161b22] border-b border-white/5 flex items-center px-4 gap-2 shrink-0">
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
              <div className="hidden md:flex w-1/4 max-w-[240px] border-r border-white/5 bg-surface/50 flex-col">
                <div className="p-2 md:p-3 border-b border-white/5 text-[10px] md:text-xs font-headline text-cyan-300 flex items-center gap-2">
                  <Cpu className="w-3.5 h-3.5" />
                  AI Assistant
                </div>
                <div className="flex-1 p-3 flex flex-col gap-3 overflow-hidden">
                  <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-lg p-2 text-[10px] text-slate-300">
                    I've generated the authentication flow. Would you like to review the mind map?
                  </div>
                  <div className="bg-white/5 rounded-lg p-2 text-[10px] text-slate-400 self-end">
                    Yes, show me the architecture.
                  </div>
                  <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-lg p-2 text-[10px] text-slate-300">
                    Here is the updated structure with the new nodes connected.
                  </div>
                </div>
              </div>
              
              {/* Center (Mind Map) */}
              <div className="flex-1 relative bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-slate-800/30 to-background overflow-hidden flex flex-col">
                <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(#334155 1px, transparent 1px)', backgroundSize: '24px 24px', opacity: 0.2 }}></div>
                
                {/* Tabs */}
                <div className="h-8 border-b border-white/5 flex items-center px-2 z-10 bg-background/50 backdrop-blur-sm shrink-0">
                  <div className="px-3 py-1 text-[10px] text-cyan-300 border-b-2 border-cyan-400 bg-cyan-500/10 flex items-center gap-1">
                    <Network className="w-3 h-3" />
                    Mind Map
                  </div>
                  <div className="px-3 py-1 text-[10px] text-slate-500 flex items-center gap-1">
                    <List className="w-3 h-3" />
                    Master Plan
                  </div>
                </div>
                
                {/* Nodes & Edges */}
                <div className="flex-1 relative min-h-0">
                  <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" viewBox="0 0 100 100" preserveAspectRatio="none">
                    {/* Main to Auth */}
                    <path d="M 30 50 Q 45 30 60 30" fill="none" stroke="#06b6d4" strokeWidth="2" className="opacity-60" />
                    {/* Main to Dashboard */}
                    <path d="M 30 50 L 60 50" fill="none" stroke="#06b6d4" strokeWidth="2" className="opacity-60" />
                    {/* Main to Settings */}
                    <path d="M 30 50 Q 45 70 60 70" fill="none" stroke="#06b6d4" strokeWidth="2" className="opacity-60" />
                  </svg>
                  
                  {/* Root Node */}
                  <div className="absolute left-[15%] md:left-[20%] top-[45%] bg-slate-800 border-2 border-cyan-500 rounded-lg p-2 md:p-3 shadow-[0_0_20px_rgba(6,182,212,0.2)] z-10 w-24 md:w-32 transform -translate-y-1/2">
                    <div className="text-cyan-300 font-headline text-[10px] md:text-xs truncate">App.tsx</div>
                    <div className="text-slate-400 text-[8px] md:text-[10px] mt-1 truncate">Main Application</div>
                  </div>
                  
                  {/* Child Nodes */}
                  <div className="absolute left-[55%] md:left-[60%] top-[30%] bg-slate-800 border border-white/10 rounded-lg p-2 md:p-3 shadow-lg z-10 w-24 md:w-32 transform -translate-y-1/2">
                    <div className="text-slate-200 font-headline text-[10px] md:text-xs truncate">Auth Flow</div>
                    <div className="text-slate-400 text-[8px] md:text-[10px] mt-1 truncate">Firebase Integration</div>
                  </div>
                  
                  <div className="absolute left-[55%] md:left-[60%] top-[50%] bg-slate-800 border border-white/10 rounded-lg p-2 md:p-3 shadow-lg z-10 w-24 md:w-32 transform -translate-y-1/2">
                    <div className="text-slate-200 font-headline text-[10px] md:text-xs truncate">Dashboard</div>
                    <div className="text-slate-400 text-[8px] md:text-[10px] mt-1 truncate">User Projects</div>
                  </div>
                  
                  <div className="absolute left-[55%] md:left-[60%] top-[70%] bg-slate-800 border border-white/10 rounded-lg p-2 md:p-3 shadow-lg z-10 w-24 md:w-32 transform -translate-y-1/2">
                    <div className="text-slate-200 font-headline text-[10px] md:text-xs truncate">Settings</div>
                    <div className="text-slate-400 text-[8px] md:text-[10px] mt-1 truncate">Preferences</div>
                  </div>
                </div>
              </div>
              
              {/* Right Sidebar (Code) */}
              <div className="hidden lg:flex w-1/3 max-w-[320px] border-l border-white/5 bg-[#0d1117] flex-col">
                <div className="h-8 border-b border-white/5 flex items-center px-3 text-[10px] text-slate-400 font-mono bg-[#161b22] shrink-0 gap-2">
                  <Code className="w-3 h-3 text-blue-400" />
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
            <div className="h-20 md:h-24 border-t border-white/5 bg-[#0d1117] flex flex-col shrink-0">
              <div className="h-6 border-b border-white/5 flex items-center px-3 text-[10px] text-slate-500 font-mono bg-[#161b22] gap-2">
                <Terminal className="w-3 h-3" />
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

        {/* Pricing CTA */}
        <section className="glass-panel border border-cyan-500/20 rounded-2xl p-8 md:p-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-8 text-left">
          <div className="flex flex-col gap-4">
            <h2 className="text-3xl font-headline text-cyan-300 font-normal">
              Simple, transparent pricing.
            </h2>
            <p className="text-slate-400 text-lg font-normal">
              One tier with all features for only €19.99. No hidden fees, no credit limits.
            </p>
          </div>
          <button 
            onClick={handleCheckout}
            disabled={loading}
            className="px-8 py-4 bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 rounded-xl hover:bg-cyan-500/30 transition-all font-headline text-lg font-normal whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Processing...' : 'Get Started'}
          </button>
        </section>
      </main>

      <footer className="shrink-0 border-t border-white/5 py-6 px-8 flex flex-wrap items-center justify-center gap-6 text-13 text-slate-500">
        <a href="/privacy" className="text-slate-400 hover:text-cyan-300 transition-colors no-underline">
          Privacy Policy
        </a>
        <span className="text-slate-600" aria-hidden>
          ·
        </span>
        <a href="/terms" className="text-slate-400 hover:text-cyan-300 transition-colors no-underline">
          Terms of Service
        </a>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="glass-panel border border-white/5 rounded-xl p-6 flex flex-col gap-4 hover:border-cyan-500/30 transition-colors text-left">
      <div className="w-12 h-12 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
        {icon}
      </div>
      <h3 className="text-xl font-headline text-slate-200 font-normal">{title}</h3>
      <p className="text-slate-400 text-sm font-normal leading-relaxed">{description}</p>
    </div>
  );
}
