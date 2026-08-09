import { useMemo } from 'react';
import {
  ArrowLeft,
  BookMarked,
  Files,
  LayoutGrid,
  Network,
  Settings,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { FileExplorer } from '@/components/ide/FileExplorer';
import { IdePlanPage } from '@/components/ide/IdePlanPage';
import { MindMapIdeRoute } from '@/components/ide/MindMapIdeRoute';
import { IdeUiStudioBeta } from '@/components/ide/IdeUiStudioBeta';
import { useIdeShellNav } from './IdeShellNavContext';
import type { IdeDashboardPanel } from '../../../lib/ideShellScreens';

const NAV: {
  id: IdeDashboardPanel;
  label: string;
  icon: typeof LayoutGrid;
}[] = [
  { id: 'projects', label: 'Projects', icon: LayoutGrid },
  { id: 'plan', label: 'Plan', icon: BookMarked },
  { id: 'mindmap', label: 'Mind Map', icon: Network },
  { id: 'files', label: 'Files', icon: Files },
  { id: 'studio', label: 'UI Studio', icon: Sparkles },
  { id: 'settings', label: 'Settings', icon: Settings },
];

function StubPanel({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div className="flex h-full min-h-0 flex-col items-start justify-center gap-3 p-8">
      <div className="ide-glass-card max-w-lg space-y-2 rounded-2xl border border-border p-6">
        <h2 className="font-headline text-xl font-normal text-foreground">{title}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{blurb}</p>
      </div>
    </div>
  );
}

function ProjectsPanel() {
  const { goToStart } = useIdeShellNav();
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-headline text-xl font-normal text-foreground">Projects</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Stub list on this UI lab branch. Start a new goal anytime.
          </p>
        </div>
        <button
          type="button"
          onClick={() => goToStart({ clearGoal: true })}
          className="btn-cyan rounded-lg px-4 py-2 text-sm"
        >
          New project
        </button>
      </div>
      <ul className="ide-glass-card divide-y divide-border overflow-hidden rounded-xl border border-border">
        <li className="px-4 py-3 text-sm text-muted-foreground">No saved cloud list in shell-only mode.</li>
        <li className="px-4 py-3 text-sm text-foreground">Local guest workspace (active)</li>
      </ul>
    </div>
  );
}

function SettingsPanel({ onOpenAccount }: { onOpenAccount?: () => void }) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-6">
      <h2 className="font-headline text-xl font-normal text-foreground">Settings</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        Account, language, and project settings open in the Account panel.
      </p>
      <button type="button" onClick={onOpenAccount} className="btn-cyan w-fit rounded-lg px-4 py-2 text-sm">
        Open Account
      </button>
    </div>
  );
}

export function DashboardScreen({ onOpenAccount }: { onOpenAccount?: () => void }) {
  const { dashboardPanel, setDashboardPanel, goToBuild } = useIdeShellNav();

  const main = useMemo(() => {
    switch (dashboardPanel) {
      case 'projects':
        return <ProjectsPanel />;
      case 'plan':
        return (
          <div className="h-full min-h-0 overflow-hidden">
            <IdePlanPage onClose={() => goToBuild()} />
          </div>
        );
      case 'mindmap':
        return (
          <div className="h-full min-h-0 overflow-hidden">
            <MindMapIdeRoute />
          </div>
        );
      case 'files':
        return (
          <div className="h-full min-h-0 overflow-hidden">
            <FileExplorer />
          </div>
        );
      case 'studio':
        return (
          <div className="h-full min-h-0 overflow-hidden">
            <IdeUiStudioBeta />
          </div>
        );
      case 'settings':
        return <SettingsPanel onOpenAccount={onOpenAccount} />;
      default:
        return <StubPanel title="Dashboard" blurb="Choose a tool from the left." />;
    }
  }, [dashboardPanel, goToBuild, onOpenAccount]);

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <nav
        className="ide-glass-chrome flex w-48 shrink-0 flex-col gap-1 border-r border-border p-2"
        aria-label="Dashboard tools"
      >
        <button
          type="button"
          onClick={() => goToBuild()}
          className="btn-secondary-surface mb-2 flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Back to Build
        </button>
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = dashboardPanel === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setDashboardPanel(item.id)}
              className={cn(
                'flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm',
                active ? 'btn-cyan' : 'btn-secondary-surface text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              {item.label}
            </button>
          );
        })}
      </nav>
      <main className="min-h-0 min-w-0 flex-1 overflow-hidden bg-transparent">{main}</main>
    </div>
  );
}
