import type { ReactNode } from 'react';

/**
 * Global UI shell wrapper. Theme tokens live on `.nebulla-ide-shell` in index.css
 * (temporary Decision 4: monochrome architecture mode).
 * Wraps every route so landing, legal, login, payment, and IDE share one theme.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="nebulla-ide-shell flex h-screen flex-col overflow-hidden text-foreground">
      <div className="nebulla-ide-shell__bg" aria-hidden="true" />
      <div className="nebulla-ide-shell__veil" aria-hidden="true" />
      <div className="nebulla-ide-shell__content relative z-[2] flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
