import { useState } from 'react';
import { LayoutDashboard, Maximize2 } from 'lucide-react';
import { TerminalPanel } from '@/components/ide/TerminalPanel';
import { withProjectQuery } from '../../../lib/nebulaProjectApi';
import { useIdeShellNav } from './IdeShellNavContext';
import { StubChat } from './StubChat';

function PreviewPane() {
  const [rev, setRev] = useState(0);
  const [failed, setFailed] = useState(false);
  const src = withProjectQuery(`/api/app-preview/bootstrap?_rev=${rev}`);

  return (
    <div className="ide-glass-chrome flex h-full min-h-0 flex-1 flex-col overflow-hidden border border-border">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-1.5">
        <span className="text-xs text-muted-foreground">Preview</span>
        <button
          type="button"
          title="Reload preview"
          aria-label="Reload preview"
          onClick={() => {
            setFailed(false);
            setRev((n) => n + 1);
          }}
          className="btn-secondary-surface inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground"
        >
          <Maximize2 className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      <div className="relative min-h-0 flex-1 bg-transparent">
        {failed ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-sm text-foreground">Preview</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              No live preview yet for this workspace. Generate an app later — this pane stays ready.
            </p>
          </div>
        ) : (
          <iframe
            title="App preview"
            src={src}
            className="h-full w-full border-0 bg-transparent"
            onError={() => setFailed(true)}
            onLoad={(e) => {
              try {
                const doc = e.currentTarget.contentDocument;
                const bodyText = doc?.body?.innerText?.trim() || '';
                if (/no preview|not found|error/i.test(bodyText) && bodyText.length < 200) {
                  setFailed(true);
                }
              } catch {
                /* cross-origin — leave iframe */
              }
            }}
          />
        )}
      </div>
    </div>
  );
}

export function BuildScreen() {
  const { goal, goToDashboard } = useIdeShellNav();
  const [terminalCollapsed, setTerminalCollapsed] = useState(true);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <p className="truncate text-xs text-muted-foreground">
          Build{goal ? ` · ${goal.slice(0, 72)}${goal.length > 72 ? '…' : ''}` : ''}
        </p>
        <button
          type="button"
          title="Open Dashboard"
          aria-label="Open Dashboard"
          onClick={() => goToDashboard()}
          className="btn-cyan inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs"
        >
          <LayoutDashboard className="h-3.5 w-3.5" aria-hidden />
          Dashboard
        </button>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col p-2">
          <PreviewPane />
        </div>
        <div className="ide-glass-chrome flex w-[min(100%,360px)] shrink-0 flex-col border-l border-border">
          <StubChat seedGoal={goal} className="min-h-0 flex-1" />
        </div>
      </div>

      <div
        className="ide-glass-chrome shrink-0 overflow-hidden border-t border-border"
        style={{ height: terminalCollapsed ? 32 : 180 }}
      >
        <TerminalPanel
          collapsed={terminalCollapsed}
          onToggleCollapse={() => setTerminalCollapsed((c) => !c)}
        />
      </div>
    </div>
  );
}
