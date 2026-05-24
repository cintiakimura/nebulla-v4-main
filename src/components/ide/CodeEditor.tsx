import { useCallback, useMemo, type KeyboardEvent, type MouseEvent } from 'react';
import { oneDark } from '@codemirror/theme-one-dark';
import CodeMirror from '@uiw/react-codemirror';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { ChevronRight, Circle, Loader2, MonitorPlay, Save, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIdeWorkspace } from '@/components/ide/IdeWorkspaceContext';

function languageExtension(path: string) {
  const lower = path.toLowerCase();
  if (lower.endsWith('.tsx')) return javascript({ typescript: true, jsx: true });
  if (lower.endsWith('.ts')) return javascript({ typescript: true });
  if (lower.endsWith('.jsx')) return javascript({ jsx: true });
  if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) return javascript();
  if (lower.endsWith('.json')) return json();
  if (lower.endsWith('.css')) return css();
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return html();
  if (lower.endsWith('.md')) return [];
  return javascript({ typescript: true, jsx: true });
}

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
    (e: KeyboardEvent) => {
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
  const extensions = useMemo(() => {
    const lang = activePath ? languageExtension(activePath) : [];
    return [oneDark, ...lang];
  }, [activePath]);

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
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            title="Open app preview"
            className="btn-secondary-surface type-label-sm flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground hover:text-foreground"
            onClick={() => window.dispatchEvent(new CustomEvent('nebula-open-app-preview'))}
          >
            <MonitorPlay className="h-3.5 w-3.5" />
            Preview
          </button>
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

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden" onKeyDown={onKeyDownEditor}>
        {!activePath || !activeTab ? (
          <div className="type-body-md flex flex-1 items-center justify-center p-6 text-center text-muted-foreground">
            Open a file from the explorer to edit workspace sources.
          </div>
        ) : (
          <CodeMirror
            value={activeTab.content}
            height="100%"
            className="nebulla-codemirror min-h-0 flex-1 overflow-hidden text-[13px]"
            extensions={extensions}
            editable={!activeTab.loading}
            basicSetup={{
              lineNumbers: true,
              foldGutter: true,
              highlightActiveLine: true,
              bracketMatching: true,
            }}
            onChange={(value) => {
              clearSaveError();
              updateActiveContent(value);
            }}
          />
        )}
      </div>
    </div>
  );
}
