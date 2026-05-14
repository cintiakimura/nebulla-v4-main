import { useCallback, type KeyboardEvent, type MouseEvent } from 'react';
import { ChevronRight, Circle, Loader2, Save, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIdeWorkspace } from '@/components/ide/IdeWorkspaceContext';

export function CodeEditor() {
  const {
    tabs,
    activePath,
    setActivePath,
    updateActiveContent,
    saveTab,
    closeTab,
    activeTab,
    saveError,
    clearSaveError,
  } = useIdeWorkspace();

  const onKeyDownEditor = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (activePath) void saveTab(activePath);
      }
    },
    [activePath, saveTab],
  );

  const closeTabClick = useCallback(
    (path: string, ev: MouseEvent) => {
      ev.stopPropagation();
      closeTab(path);
    },
    [closeTab],
  );

  const crumbs = activePath ? activePath.split('/').filter(Boolean) : [];

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="surface-active tonal-seam-b flex h-9 items-center justify-between gap-2 pr-2">
        <div className="flex min-w-0 flex-1 items-center overflow-x-auto">
          {tabs.length === 0 ? (
            <span className="type-label-sm truncate px-3 text-muted-foreground">No open files</span>
          ) : (
            tabs.map((tab) => (
              <button
                key={tab.path}
                type="button"
                onClick={() => setActivePath(tab.path)}
                className={cn(
                  'group flex h-9 shrink-0 items-center gap-2 px-3 transition-colors duration-300 ease-out',
                  activePath === tab.path
                    ? 'active-tab-sheen type-title-sm text-primary'
                    : 'type-title-sm text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.dirty && <Circle className="h-1.5 w-1.5 fill-primary text-primary" />}
                {tab.loading && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />}
                <span className="max-w-[180px] truncate">{tab.path.split('/').pop() || tab.path}</span>
                <X
                  className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
                  onClick={(e) => closeTabClick(tab.path, e)}
                  aria-label={`Close ${tab.path}`}
                />
              </button>
            ))
          )}
        </div>
        <button
          type="button"
          title="Save (⌘S / Ctrl+S)"
          disabled={!activePath || !activeTab?.dirty || activeTab.loading}
          onClick={() => activePath && void saveTab(activePath)}
          className="btn-secondary-surface type-label-sm flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-muted-foreground disabled:opacity-40"
        >
          <Save className="h-3.5 w-3.5" />
          Save
        </button>
      </div>

      <div className="surface-active flex h-7 min-h-7 items-center gap-1 overflow-x-auto px-3">
        {crumbs.length === 0 ? (
          <span className="type-label-sm text-muted-foreground">Select a file in the explorer</span>
        ) : (
          crumbs.map((part, i) => (
            <span key={`${part}-${i}`} className="flex min-w-0 items-center gap-1">
              {i > 0 ? <ChevronRight className="type-label-sm h-3 w-3 shrink-0" /> : null}
              <span
                className={cn(
                  'type-label-sm truncate',
                  i === crumbs.length - 1 ? 'type-title-sm text-primary' : 'text-muted-foreground',
                )}
              >
                {part}
              </span>
            </span>
          ))
        )}
      </div>

      {saveError ? (
        <div
          className="type-label-sm shrink-0 border-b border-red-500/30 bg-red-500/10 px-3 py-2 text-red-100/95"
          role="alert"
        >
          <span className="font-medium">Save failed: </span>
          {saveError}
          <button type="button" className="ml-2 underline hover:text-foreground" onClick={clearSaveError}>
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="relative flex min-h-0 flex-1 flex-col">
        {!activePath || !activeTab ? (
          <div className="type-body-md flex flex-1 items-center justify-center p-6 text-center text-muted-foreground">
            Open a file from the explorer to edit workspace sources.
          </div>
        ) : (
          <textarea
            value={activeTab.content}
            onChange={(e) => {
              clearSaveError();
              updateActiveContent(e.target.value);
            }}
            onKeyDown={onKeyDownEditor}
            spellCheck={false}
            className="type-body-md min-h-0 flex-1 resize-none bg-background p-3 font-mono leading-relaxed text-foreground outline-none"
            aria-label={`Editor: ${activePath}`}
            disabled={activeTab.loading}
          />
        )}
      </div>
    </div>
  );
}
