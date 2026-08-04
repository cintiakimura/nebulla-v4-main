import { lazy, Suspense, useCallback, type KeyboardEvent } from 'react';
import { ChevronRight, Circle, Loader2, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIdeWorkspace } from '@/components/ide/IdeWorkspaceContext';
import { fileTabLabel } from '../../lib/ideCenterTabs';

const IdeMonacoEditor = lazy(() =>
  import('./IdeMonacoEditor').then((m) => ({ default: m.IdeMonacoEditor })),
);

type Props = {
  /** Center Code pane is the active stage (for Monaco layout after tab switches). */
  active?: boolean;
};

/** Editor body only — tabs live in the center tab strip. */
export function IdeFileEditor({ active = true }: Props) {
  const {
    activePath,
    updateActiveContent,
    saveTab,
    activeTab,
    saveError,
    clearSaveError,
  } = useIdeWorkspace();

  const onKeyDownEditor = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (activePath) void saveTab(activePath);
      }
    },
    [activePath, saveTab],
  );

  const handleSave = useCallback(() => {
    if (activePath) void saveTab(activePath);
  }, [activePath, saveTab]);

  const crumbs = activePath ? activePath.split('/').filter(Boolean) : [];
  const dirty = Boolean(activeTab?.dirty);

  return (
    <div className="flex h-full flex-col bg-[var(--surface-bright)]">
      <div className="surface-active flex h-7 min-h-7 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {crumbs.length === 0 ? (
            <span className="type-label-sm text-muted-foreground">Select a file in the explorer</span>
          ) : (
            <>
              {dirty ? (
                <Circle
                  className="h-1.5 w-1.5 shrink-0 fill-primary text-primary"
                  aria-label="Unsaved changes"
                />
              ) : null}
              {crumbs.map((part, i) => (
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
              ))}
            </>
          )}
        </div>
        <button
          type="button"
          title="Save (⌘S / Ctrl+S)"
          disabled={!activePath || !activeTab?.dirty || activeTab.loading}
          onClick={() => activePath && void saveTab(activePath)}
          className="btn-secondary-surface type-label-sm flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-muted-foreground disabled:opacity-40"
        >
          <Save className="h-3.5 w-3.5" />
          Save
        </button>
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

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden" onKeyDown={onKeyDownEditor}>
        {!activePath || !activeTab ? (
          <div className="type-body-md flex flex-1 items-center justify-center p-6 text-center text-muted-foreground">
            Open a file from the explorer to edit workspace sources.
          </div>
        ) : activeTab.loading ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="type-label-sm">Loading {fileTabLabel(activePath)}…</span>
          </div>
        ) : (
          <Suspense
            fallback={
              <div className="flex h-full flex-1 items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="type-label-sm">Loading editor…</span>
              </div>
            }
          >
            <IdeMonacoEditor
              path={activePath}
              value={activeTab.content}
              readOnly={Boolean(activeTab.loading)}
              active={active}
              onChange={(value) => {
                clearSaveError();
                updateActiveContent(value);
              }}
              onSave={handleSave}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
}
