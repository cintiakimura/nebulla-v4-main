import { useCallback, useMemo, type KeyboardEvent } from 'react';
import { oneDark } from '@codemirror/theme-one-dark';
import CodeMirror from '@uiw/react-codemirror';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { ChevronRight, Circle, Loader2, Save } from 'lucide-react';
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
  if (lower.endsWith('.md') || lower.endsWith('.mdx')) return markdown();
  return javascript({ typescript: true, jsx: true });
}

/** Editor body only — tabs live in the center tab strip. */
export function IdeFileEditor() {
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

  const crumbs = activePath ? activePath.split('/').filter(Boolean) : [];
  const extensions = useMemo(() => {
    const lang = activePath ? languageExtension(activePath) : [];
    return [oneDark, syntaxHighlighting(defaultHighlightStyle, { fallback: true }), ...lang];
  }, [activePath]);

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="surface-active flex h-7 min-h-7 shrink-0 items-center justify-between gap-2 border-b border-white/5 px-3">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
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
