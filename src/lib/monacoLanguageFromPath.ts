/** Map workspace file path → Monaco language id (syntax only; no LSP). */
export function monacoLanguageFromPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith('.tsx') || lower.endsWith('.ts')) return 'typescript';
  if (
    lower.endsWith('.jsx') ||
    lower.endsWith('.js') ||
    lower.endsWith('.mjs') ||
    lower.endsWith('.cjs')
  ) {
    return 'javascript';
  }
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.css')) return 'css';
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html';
  if (lower.endsWith('.md') || lower.endsWith('.mdx')) return 'markdown';
  return 'typescript';
}
