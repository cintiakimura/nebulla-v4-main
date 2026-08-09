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
    <div className="flex min-h-screen flex-col overflow-y-auto bg-transparent text-on-surface font-body">
      <header className="ide-glass-chrome sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between border-b border-border px-6">
        <a href="/" className="flex items-center gap-2 text-cyan-300 no-underline transition-opacity hover:opacity-90">
          <Logo className="h-7 w-7" />
          <span className="font-headline text-lg font-normal">nebulla</span>
        </a>
        <nav className="flex items-center gap-5 text-13 text-slate-400">
          <a href="/privacy" className="no-underline transition-colors hover:text-cyan-300">
            Privacy
          </a>
          <a href="/terms" className="no-underline transition-colors hover:text-cyan-300">
            Terms
          </a>
          <a href="/legal/dpa" className="no-underline transition-colors hover:text-cyan-300">
            DPA
          </a>
        </nav>
      </header>

      <main className="ide-glass-card mx-auto my-10 w-full max-w-3xl flex-1 rounded-2xl border border-border px-6 py-12 md:px-10 md:py-16">
        <h1 className="mb-2 font-headline text-3xl font-normal tracking-tight text-cyan-300 md:text-4xl">{title}</h1>
        {subtitle ? (
          <p className="mb-10 border-b border-border pb-8 text-sm text-slate-500">{subtitle}</p>
        ) : (
          <div className="mb-10 border-b border-border pb-8" />
        )}
        <div className="space-y-8 text-13 leading-relaxed text-slate-300">{children}</div>
      </main>

      <footer className="ide-glass-chrome shrink-0 border-t border-border py-8 text-center">
        <a
          href="/"
          className="font-headline text-13 font-normal text-cyan-400/90 no-underline hover:text-cyan-300"
        >
          ← Back to nebulla
        </a>
      </footer>
    </div>
  );
}
