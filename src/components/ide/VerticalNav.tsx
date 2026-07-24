import { useState } from 'react';
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

type NavItem = {
  id: string;
  icon: React.ReactNode;
  label: string;
};

const items: NavItem[] = [
  { id: 'explorer', icon: <FolderTree className="h-5 w-5" />, label: 'Explorer' },
  { id: 'source-control', icon: <GitBranch className="h-5 w-5" />, label: 'Source Control' },
  { id: 'projects', icon: <LayoutGrid className="h-5 w-5" />, label: 'My Projects' },
  { id: 'master-plan', icon: <BookMarked className="h-5 w-5" />, label: 'Master Plan' },
  { id: 'mind-map', icon: <Network className="h-5 w-5" />, label: 'Mind Map' },
  { id: 'visual-ui-editor', icon: <Palette className="h-5 w-5" />, label: 'Nebula UI Studio' },
  { id: 'ui-studio-beta', icon: <Sparkles className="h-5 w-5" />, label: 'UI Studio Beta' },
  { id: 'secrets', icon: <KeyRound className="h-5 w-5" />, label: 'Secrets' },
  /** Opens workspace onboarding (GitHub + API keys). Profile / logout is NB in the top bar. */
  { id: 'project-settings', icon: <Settings className="h-5 w-5" />, label: 'Onboarding' },
];

export function VerticalNav({
  activeItem: activeItemProp,
  onSelectItem,
}: {
  /** When set, nav selection is controlled by the parent (e.g. IDE shell). */
  activeItem?: string;
  onSelectItem?: (id: string) => void;
}) {
  const [activeItemUncontrolled, setActiveItemUncontrolled] = useState('explorer');
  const activeItem = activeItemProp ?? activeItemUncontrolled;
  const setActiveItem = (id: string) => {
    onSelectItem?.(id);
    if (activeItemProp === undefined) setActiveItemUncontrolled(id);
  };

  return (
    <div className="surface-base flex h-full w-12 shrink-0 flex-col items-center border-r border-border py-3">
      <nav
        className="flex min-h-0 w-full flex-1 flex-col items-center gap-0.5 overflow-y-auto px-0.5"
        aria-label="Primary"
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
