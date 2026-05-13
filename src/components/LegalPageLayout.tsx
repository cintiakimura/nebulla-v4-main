import type { ReactNode } from 'react';
import { Logo } from './Logo';

export function LegalPageLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-on-surface font-body flex flex-col overflow-y-auto">
      <header className="sticky top-0 z-20 h-14 shrink-0 border-b border-white/5 flex items-center justify-between px-6 glass-panel">
        <a href="/" className="flex items-center gap-2 text-cyan-300 no-underline hover:opacity-90 transition-opacity">
          <Logo className="w-7 h-7" />
          <span className="font-headline text-lg font-normal">nebulla</span>
        </a>
        <nav className="flex items-center gap-5 text-13 text-slate-400">
          <a href="/privacy" className="hover:text-cyan-300 transition-colors no-underline">
            Privacy
          </a>
          <a href="/terms" className="hover:text-cyan-300 transition-colors no-underline">
            Terms
          </a>
        </nav>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-6 py-12 md:py-16">
        <h1 className="text-3xl md:text-4xl font-headline text-cyan-300 font-normal tracking-tight mb-2">{title}</h1>
        {subtitle ? (
          <p className="text-sm text-slate-500 mb-10 border-b border-white/5 pb-8">{subtitle}</p>
        ) : (
          <div className="mb-10 border-b border-white/5 pb-8" />
        )}
        <div className="space-y-8 text-13 text-slate-300 leading-relaxed">{children}</div>
      </main>

      <footer className="shrink-0 border-t border-white/5 py-8 text-center">
        <a
          href="/"
          className="text-13 text-cyan-400/90 hover:text-cyan-300 no-underline font-headline font-normal"
        >
          ← Back to nebulla
        </a>
      </footer>
    </div>
  );
}
