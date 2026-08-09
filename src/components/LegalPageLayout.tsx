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
    <div className="flex min-h-screen flex-col overflow-y-auto bg-transparent font-body text-foreground">
      <header className="ide-glass-chrome sticky top-0 z-20 flex h-12 shrink-0 items-center justify-between border-b border-border px-5 md:px-8">
        <a href="/" className="flex items-center gap-2 no-underline transition-opacity hover:opacity-90">
          <Logo className="h-8 w-8" />
          <span className="app-logotype">Nebulla.beta</span>
        </a>
        <nav className="type-label-sm flex items-center gap-5">
          <a href="/privacy" className="text-muted-foreground no-underline transition-colors hover:text-foreground">
            Privacy
          </a>
          <a href="/terms" className="text-muted-foreground no-underline transition-colors hover:text-foreground">
            Terms
          </a>
          <a href="/legal/dpa" className="text-muted-foreground no-underline transition-colors hover:text-foreground">
            DPA
          </a>
        </nav>
      </header>

      <main className="ide-glass-card mx-auto my-8 w-full max-w-3xl flex-1 rounded-lg border border-border px-6 py-10 md:my-10 md:px-10 md:py-12">
        <h1 className="type-page mb-2">{title}</h1>
        {subtitle ? (
          <p className="type-body-dense mb-8 border-b border-border pb-6 text-muted-foreground">{subtitle}</p>
        ) : (
          <div className="mb-8 border-b border-border pb-6" />
        )}
        <div className="type-body-md space-y-6 text-muted-foreground">{children}</div>
      </main>

      <footer className="ide-glass-chrome shrink-0 border-t border-border py-6 text-center">
        <a
          href="/"
          className="type-label-sm text-muted-foreground no-underline hover:text-foreground"
        >
          ← Back to Nebulla
        </a>
      </footer>
    </div>
  );
}
