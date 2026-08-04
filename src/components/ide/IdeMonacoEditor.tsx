/**
 * Thin Monaco typing surface for IdeFileEditor.
 * Nebulla workspace contracts stay in IdeWorkspaceContext — this is display/input only.
 */
import Editor, { type OnMount } from '@monaco-editor/react';
import { Loader2 } from 'lucide-react';
import { useCallback } from 'react';
import { monacoLanguageFromPath } from '../../lib/monacoLanguageFromPath';
import {
  NEBULLA_MONACO_THEME,
  registerNebullaMonacoTheme,
} from '../../lib/monacoNebullaTheme';

type Props = {
  path: string;
  value: string;
  readOnly?: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
};

export function IdeMonacoEditor({ path, value, readOnly, onChange, onSave }: Props) {
  const handleMount: OnMount = useCallback(
    (editor, monaco) => {
      registerNebullaMonacoTheme(monaco);
      monaco.editor.setTheme(NEBULLA_MONACO_THEME);
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        onSave();
      });
    },
    [onSave],
  );

  return (
    <Editor
      key={path}
      height="100%"
      className="min-h-0 flex-1 overflow-hidden"
      language={monacoLanguageFromPath(path)}
      value={value}
      theme={NEBULLA_MONACO_THEME}
      beforeMount={(monaco) => {
        registerNebullaMonacoTheme(monaco);
      }}
      options={{
        fontSize: 13,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        automaticLayout: true,
        readOnly: Boolean(readOnly),
        padding: { top: 8 },
        lineNumbers: 'on',
        renderLineHighlight: 'line',
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
  );
}
