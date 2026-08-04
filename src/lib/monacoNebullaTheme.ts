import type { Monaco } from '@monaco-editor/react';

/** Pure-black Monaco theme aligned with Nebulla IDE chrome. */
export const NEBULLA_MONACO_THEME = 'nebulla-dark';

export function registerNebullaMonacoTheme(monaco: Monaco): void {
  monaco.editor.defineTheme(NEBULLA_MONACO_THEME, {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#000000',
      'editor.foreground': '#f2f2f2',
      'editorLineNumber.foreground': '#8a8a8a',
      'editorLineNumber.activeForeground': '#c0c0c0',
      'editor.selectionBackground': '#5750CC55',
      'editor.inactiveSelectionBackground': '#5750CC33',
      'editor.lineHighlightBackground': '#0a0a0a',
      'editorCursor.foreground': '#5750CC',
      'editorGutter.background': '#000000',
      'editorWidget.background': '#0a0a0a',
      'editorWidget.border': '#2e2e2e',
      'scrollbarSlider.background': '#2e2e2e88',
      'scrollbarSlider.hoverBackground': '#5750CC55',
    },
  });
}
