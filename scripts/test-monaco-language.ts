/**
 * Smoke: Monaco language id mapping for IdeFileEditor.
 * Run: npx tsx scripts/test-monaco-language.ts
 */
import assert from 'node:assert/strict';
import { monacoLanguageFromPath } from '../src/lib/monacoLanguageFromPath.ts';

assert.equal(monacoLanguageFromPath('app/page.tsx'), 'typescript');
assert.equal(monacoLanguageFromPath('lib/foo.ts'), 'typescript');
assert.equal(monacoLanguageFromPath('scripts/x.js'), 'javascript');
assert.equal(monacoLanguageFromPath('a.mjs'), 'javascript');
assert.equal(monacoLanguageFromPath('pkg.json'), 'json');
assert.equal(monacoLanguageFromPath('styles.css'), 'css');
assert.equal(monacoLanguageFromPath('index.html'), 'html');
assert.equal(monacoLanguageFromPath('README.md'), 'markdown');
assert.equal(monacoLanguageFromPath('notes.mdx'), 'markdown');
assert.equal(monacoLanguageFromPath('unknown.xyz'), 'typescript');

console.log('✓ monacoLanguageFromPath mapping');
console.log('\nAll monaco language checks passed.');
