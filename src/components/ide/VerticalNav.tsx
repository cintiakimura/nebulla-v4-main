import { useMemo, useState } from 'react';
import {
  BookMarked,
  FolderTree,
  GitBranch,
  KeyRound,
  LayoutGrid,
  Network,
  Palette,
  Settings,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/components/i18n/LanguageProvider';

type NavItemId =
  | 'explorer'
  | 'source-control'
  | 'projects'
  | 'master-plan'
  | 'mind-map'
  | 'visual-ui-editor'
  | 'ui-studio-beta'
  | 'secrets'
  | 'project-settings';

const NAV_IDS: { id: NavItemId; icon: React.ReactNode }[] = [
  { id: 'explorer', icon: <FolderTree className="h-5 w-5" /> },
  { id: 'source-control', icon: <GitBranch className="h-5 w-5" /> },
  { id: 'projects', icon: <LayoutGrid className="h-5 w-5" /> },
  { id: 'master-plan', icon: <BookMarked className="h-5 w-5" /> },
  { id: 'mind-map', icon: <Network className="h-5 w-5" /> },
  { id: 'visual-ui-editor', icon: <Palette className="h-5 w-5" /> },
  { id: 'ui-studio-beta', icon: <Sparkles className="h-5 w-5" /> },
  { id: 'secrets', icon: <KeyRound className="h-5 w-5" /> },
  { id: 'project-settings', icon: <Settings className="h-5 w-5" /> },
];

export function VerticalNav({
  activeItem: activeItemProp,
  onSelectItem,
}: {
  activeItem?: string;
  onSelectItem?: (id: string) => void;
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

  return (
    <div className="surface-base flex h-full w-12 shrink-0 flex-col items-center border-r border-border py-3">
      <nav
        className="flex min-h-0 w-full flex-1 flex-col items-center gap-0.5 overflow-y-auto px-0.5"
        aria-label={t('ide.nav.primary')}
      >
        {items.map((item) => (
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
                ? 'active-tab-sheen text-primary'
                : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
            )}
          >
            {item.icon}
            {activeItem === item.id && (
              <span
                className="absolute left-0 top-1/2 h-6 w-px -translate-y-1/2 rounded-r bg-primary/50"
                style={{
                  boxShadow: '0 0 10px color-mix(in srgb, var(--primary) 35%, transparent)',
                }}
              />
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}
