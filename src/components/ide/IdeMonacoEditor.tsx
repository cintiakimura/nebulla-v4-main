/**
 * Thin Monaco typing surface for IdeFileEditor.
 * Nebulla workspace contracts stay in IdeWorkspaceContext — this is display/input only.
 */
import Editor, { type OnMount } from '@monaco-editor/react';
import type { editor as MonacoEditor } from 'monaco-editor';
import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';
import { monacoLanguageFromPath } from '../../lib/monacoLanguageFromPath';
import {
  NEBULLA_CODE_FONT,
  NEBULLA_MONACO_THEME,
  registerNebullaMonacoTheme,
} from '../../lib/monacoNebullaTheme';

type Props = {
  path: string;
  value: string;
  readOnly?: boolean;
  /** When the center Code pane is visible — triggers layout after hide/show. */
  active?: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
};

export function IdeMonacoEditor({
  path,
  value,
  readOnly,
  active = true,
  onChange,
  onSave,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);

  const handleMount: OnMount = useCallback(
    (ed, monaco) => {
      editorRef.current = ed;
      registerNebullaMonacoTheme(monaco);
      monaco.editor.setTheme(NEBULLA_MONACO_THEME);
      ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        onSave();
      });
      // Layout after mount — parent may have just become visible.
      requestAnimationFrame(() => ed.layout());
    },
    [onSave],
  );

  useEffect(() => {
    if (!active) return;
    const ed = editorRef.current;
    if (!ed) return;
    requestAnimationFrame(() => ed.layout());
  }, [active, path]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      editorRef.current?.layout();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={hostRef} className="relative h-full min-h-0 w-full flex-1 overflow-hidden">
      <Editor
        key={path}
        height="100%"
        width="100%"
        className="h-full min-h-0"
        language={monacoLanguageFromPath(path)}
        value={value}
        theme={NEBULLA_MONACO_THEME}
        beforeMount={(monaco) => {
          registerNebullaMonacoTheme(monaco);
        }}
        options={{
          fontSize: 13,
          fontFamily: NEBULLA_CODE_FONT,
          fontLigatures: true,
          fontWeight: '400',
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          automaticLayout: true,
          readOnly: Boolean(readOnly),
          padding: { top: 8 },
          lineNumbers: 'on',
          renderLineHighlight: 'line',
          tabSize: 2,
          bracketPairColorization: { enabled: true },
          scrollbar: {
            verticalScrollbarSize: 10,
            horizontalScrollbarSize: 10,
          },
        }}
        loading={
          <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="type-label-sm">Loading editor…</span>
          </div>
        }
        onMount={handleMount}
        onChange={(next) => onChange(next ?? '')}
      />
    </div>
  );
}
