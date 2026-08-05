import { useMemo, useState } from 'react';
import {
  BookMarked,
  FolderTree,
  GitBranch,
  KeyRound,
  LayoutGrid,
  Settings,
  Shield,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/components/i18n/LanguageProvider';

type NavItemId =
  | 'explorer'
  | 'source-control'
  | 'projects'
  | 'master-plan'
  | 'visual-ui-editor'
  | 'ui-studio-beta'
  | 'secrets'
  | 'security'
  | 'project-settings';

/** Primary rail — Legacy v0 Studio disabled (kept in code; not shown). Settings pinned at bottom. */
const NAV_IDS: { id: NavItemId; icon: React.ReactNode }[] = [
  { id: 'explorer', icon: <FolderTree className="h-5 w-5" /> },
  { id: 'source-control', icon: <GitBranch className="h-5 w-5" /> },
  { id: 'projects', icon: <LayoutGrid className="h-5 w-5" /> },
  { id: 'master-plan', icon: <BookMarked className="h-5 w-5" /> },
  { id: 'ui-studio-beta', icon: <Sparkles className="h-5 w-5" /> },
  { id: 'secrets', icon: <KeyRound className="h-5 w-5" /> },
  { id: 'security', icon: <Shield className="h-5 w-5" /> },
];

const NAV_BOTTOM_IDS: { id: NavItemId; icon: React.ReactNode }[] = [
  { id: 'project-settings', icon: <Settings className="h-5 w-5" /> },
];

export function VerticalNav({
  activeItem: activeItemProp,
  onSelectItem,
  securityAlertCount = 0,
}: {
  activeItem?: string;
  onSelectItem?: (id: string) => void;
  /** Unresolved critical/high findings from last Security Scan (nav badge). */
  securityAlertCount?: number;
}) {
  const { t } = useLanguage();
  const [activeItemUncontrolled, setActiveItemUncontrolled] = useState('explorer');
  const activeItem = activeItemProp ?? activeItemUncontrolled;
  const setActiveItem = (id: string) => {
    onSelectItem?.(id);
    if (activeItemProp === undefined) setActiveItemUncontrolled(id);
  };

  const items = useMemo(
    () =>
      NAV_IDS.map((item) => ({
        ...item,
        label: t(`ide.nav.${item.id}`),
      })),
    [t],
  );
  const bottomItems = useMemo(
    () =>
      NAV_BOTTOM_IDS.map((item) => ({
        ...item,
        label: t(`ide.nav.${item.id}`),
      })),
    [t],
  );

  const renderNavButton = (item: { id: NavItemId; icon: React.ReactNode; label: string }) => (
    <button
      key={item.id}
      type="button"
      onClick={() => setActiveItem(item.id)}
      title={item.label}
      aria-label={item.label}
      aria-current={activeItem === item.id ? 'true' : undefined}
      className={cn(
        'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors duration-300 ease-out',
        activeItem === item.id
          ? 'text-cyan-200 ring-1 ring-cyan-500/35 bg-cyan-500/10'
          : 'text-muted-foreground hover:bg-cyan-500/10 hover:text-cyan-100',
      )}
    >
      {item.icon}
      {item.id === 'security' && securityAlertCount > 0 ? (
        <span
          className="absolute right-1 top-1 h-2 w-2 rounded-full bg-orange-400"
          title={`${securityAlertCount} high-severity findings`}
          aria-label={`${securityAlertCount} high-severity findings`}
        />
      ) : null}
      {activeItem === item.id && (
        <span className="absolute left-0 top-1/2 h-6 w-px -translate-y-1/2 rounded-r bg-cyan-400/70" />
      )}
    </button>
  );

  return (
    <div className="surface-base flex h-full w-12 shrink-0 flex-col items-center border-r border-border py-3">
      <nav
        className="flex min-h-0 w-full flex-1 flex-col items-center gap-0.5 overflow-y-auto px-0.5"
        aria-label={t('ide.nav.primary')}
      >
        {items.map(renderNavButton)}
      </nav>
      {/* Bottom rail — Account / settings (thumb-friendly, less modal-first) */}
      <div className="mt-auto flex w-full flex-col items-center gap-0.5 border-t border-border/80 pt-2 px-0.5">
        {bottomItems.map(renderNavButton)}
      </div>
    </div>
  );
}
