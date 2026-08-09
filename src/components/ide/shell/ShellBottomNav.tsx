import { BookMarked, Code2, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIdeShellNav } from './IdeShellNavContext';

/**
 * Floating capsule workspace menu — Build · Code · Plan only.
 * Not shown on Dashboard or Settings.
 */
export function ShellBottomNav() {
  const { activeScreen, goToBuild, goToCode, goToPlan } = useIdeShellNav();

  if (activeScreen !== 'build' && activeScreen !== 'code' && activeScreen !== 'plan') {
    return null;
  }

  const items = [
    {
      id: 'build' as const,
      label: 'Build',
      icon: MessageSquare,
      onClick: goToBuild,
    },
    {
      id: 'code' as const,
      label: 'Code',
      icon: Code2,
      onClick: goToCode,
    },
    {
      id: 'plan' as const,
      label: 'Plan',
      icon: BookMarked,
      onClick: goToPlan,
    },
  ];

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
      <nav
        className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-white/10 bg-[#141414]/92 px-1.5 py-1 shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-md"
        aria-label="Workspace"
      >
        {items.map(({ id, label, icon: Icon, onClick }) => {
          const active = activeScreen === id;
          return (
            <button
              key={id}
              type="button"
              title={label}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              onClick={onClick}
              className={cn(
                'relative inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs transition-colors',
                active
                  ? 'bg-[#2a2a2a] text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4 shrink-0 opacity-90" strokeWidth={1.75} aria-hidden />
              <span className="whitespace-nowrap">{label}</span>
              {active ? (
                <span
                  className="absolute bottom-1 left-1/2 h-px w-5 -translate-x-1/2 bg-foreground/70"
                  aria-hidden
                />
              ) : null}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
