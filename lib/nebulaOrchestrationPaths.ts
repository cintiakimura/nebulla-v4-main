/**
 * Platform / planning paths that must not appear as the user's product file tree.
 * Authority: nebula-project/recovery-orchestration.md §7.1 + canonical path rule.
 */

export function normalizeWorkspaceRelPath(relPath: string): string {
  return String(relPath || '')
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/^\/+/, '')
    .trim();
}

/** Bundled Nebula / planning files — not the user app under src/, app/, public/, etc. */
export function isNebulaOrchestrationPath(relPath: string): boolean {
  const p = normalizeWorkspaceRelPath(relPath);
  if (!p) return true;
  if (p === '.nebula-created-at' || p.startsWith('.nebula-')) return true;
  if (p.startsWith('.git/') || p === '.git') return true;

  // Auto-provisioned secrets / D1 — confidential platform wiring, not app source.
  if (p === '.env' || p === '.env.d1' || p.startsWith('.env.')) return true;
  if (p === 'nebula-d1.json' || p === 'nebula-project-secrets.d1.json') return true;
  if (/^nebula-project-secrets(\.|$)/i.test(p)) return true;

  // Platform preview shells (App Preview uses public/index.html as the product entry).
  if (/(^|\/)nebula-basic-preview\.html$/i.test(p)) return true;
  if (/(^|\/)nebula-ui-gen-preview\.html$/i.test(p)) return true;

  const exact = new Set([
    'master-plan.json',
    'project-execution-rules.md',
    'environment-setup.md',
    'Nebula Architecture Spec.md',
    'SKILL.md',
    'nebula-ui-studio.md',
    'ui-studio.md',
    'conversation-log.md',
    'project-workflow.md',
    'CHANGELOG-methodology.md',
    'inference-first-rules.md',
    'recovery-orchestration.md',
  ]);
  if (exact.has(p)) return true;

  const prefixes = [
    'generated-ui/',
    'nebulla-version-history/',
    'nebulla-ide/',
    'nebula-project/',
    'nebulla-project/',
    'nebula-ui-studio/',
    'nebulla-sysh-ui-sysh-studio/',
    '.cursor/',
    'conversation-logs/',
    'dist/',
    'build/',
    'coverage/',
    'recovery-inventory-',
  ];
  for (const pre of prefixes) {
    if (p.startsWith(pre)) return true;
  }
  if (/^recovery-inventory-.*\.md$/i.test(p)) return true;
  return false;
}

/** Paths the user may browse/edit as their app product. */
export function isUserAppProductPath(relPath: string): boolean {
  const p = normalizeWorkspaceRelPath(relPath);
  if (!p || p.includes('..')) return false;
  if (p.startsWith('node_modules/') || p.includes('/node_modules/')) return false;
  if (p.startsWith('.git/')) return false;
  return !isNebulaOrchestrationPath(p);
}
