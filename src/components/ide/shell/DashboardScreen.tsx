import { useEffect, useState } from 'react';
import { Settings } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { MyProjectsHome } from '@/components/ide/MyProjectsHome';
import { fetchSessionUser, type NebulaSessionUser } from '../../../lib/nebulaCloud';
import { sessionInitials } from '../../../lib/sessionInitials';
import { useIdeShellNav } from './IdeShellNavContext';
import { cn } from '@/lib/utils';

/**
 * Client Dashboard — projects home (new project + list).
 * Not an IDE chrome clone; Settings via header control.
 */
export function DashboardScreen({ onOpenAccount }: { onOpenAccount?: () => void }) {
  const { goToSettings } = useIdeShellNav();
  const [sessionUser, setSessionUser] = useState<NebulaSessionUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchSessionUser().then((u) => {
      if (!cancelled) setSessionUser(u);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const openSettings = () => {
    if (onOpenAccount) onOpenAccount();
    else goToSettings();
  };

  const initials = sessionInitials(sessionUser);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden overscroll-y-contain">
      <header className="ide-glass-chrome flex h-14 shrink-0 items-center gap-2 border-b border-border px-3 md:px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <Logo className="h-10 w-10 shrink-0 object-contain md:h-11 md:w-11" />
          <span className="app-logotype text-[15px] tracking-[0.03em] md:text-base">Nebulla.beta</span>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            title="Settings"
            aria-label="Settings"
            onClick={openSettings}
            className="btn-secondary-surface btn-icon text-muted-foreground hover:text-foreground"
          >
            <Settings className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            title="Settings"
            aria-label="Open Settings"
            onClick={openSettings}
            className={cn(
              'btn-secondary-surface flex h-8 w-8 items-center justify-center rounded-full text-[11px] text-foreground',
            )}
          >
            {sessionUser?.photoURL ? (
              <img
                src={sessionUser.photoURL}
                alt=""
                className="h-8 w-8 rounded-full object-cover"
              />
            ) : (
              initials || 'NB'
            )}
          </button>
        </div>
      </header>

      <MyProjectsHome variant="dashboard" />
    </div>
  );
}
