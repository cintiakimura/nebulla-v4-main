/**
 * Compact bug-database pattern hints for App Status / NDM debugging turns.
 * Derived from nebulla-project/full-bug-database.md — NOT a full-file inject.
 */

const MAX_APPENDIX_CHARS = 1800;

type BugHint = {
  id: string;
  pattern: RegExp;
  category: string;
  tips: string[];
};

const HINTS: BugHint[] = [
  {
    id: 'runtime-undef',
    pattern: /cannot read propert|undefined is not|null is not|is not a function/i,
    category: 'Runtime Errors',
    tips: [
      'Guard null/undefined before property access.',
      'Confirm the value exists at the call site (props, API data, refs).',
      'Smallest fix only — no large refactors.',
    ],
  },
  {
    id: 'module-not-found',
    pattern: /module not found|cannot find module|failed to resolve|enoent/i,
    category: 'Import / path errors',
    tips: [
      'Check import path case and relative path.',
      'Confirm the file exists in the workspace.',
      'Verify package.json dependency if it is an npm module.',
    ],
  },
  {
    id: 'hydration',
    pattern: /hydrat|minified react error #\d+/i,
    category: 'React / Frontend (hydration)',
    tips: [
      'Ensure server and client first render match.',
      'Move browser-only APIs (window/localStorage) into effects.',
      'Avoid non-deterministic values during SSR/first paint.',
    ],
  },
  {
    id: 'http-status',
    pattern: /\b(4\d\d|5\d\d)\b|failed to fetch|networkerror|→\s*[45]\d\d/i,
    category: 'HTTP 4xx / 5xx / Network',
    tips: [
      'fetch does not throw on 404/500 — check response.ok.',
      'Confirm client path matches a real server route.',
      'Surface status + short message; do not swallow errors silently.',
    ],
  },
  {
    id: 'api-mismatch',
    pattern: /api route|404.*\/api|\/api\/.*→\s*404/i,
    category: 'API route mismatch',
    tips: [
      'Grep client fetch paths and server.ts handlers together.',
      'Fix path or add the missing route — smallest change.',
    ],
  },
  {
    id: 'env-config',
    pattern: /process\.env|undefined.*api.?key|configurationerror|missing env/i,
    category: 'Environment / Config',
    tips: [
      'Validate required env at startup or before the call.',
      'Do not hardcode secrets; check .env is loaded for the process.',
    ],
  },
  {
    id: 'async',
    pattern: /unhandled promise|await|async|race condition/i,
    category: 'Async / promises',
    tips: [
      'Add try/catch or .catch around async work.',
      'Handle loading and error UI states.',
    ],
  },
  {
    id: 'syntax',
    pattern: /syntaxerror|unexpected token|indentationerror/i,
    category: 'Syntax Errors',
    tips: [
      'Fix brackets/quotes at the reported line.',
      'Re-run the failing file only — avoid drive-by formatting.',
    ],
  },
  {
    id: 'deps',
    pattern: /cannot find package|peer dep|ersion conflict|ersolve.*dependency/i,
    category: 'Dependency conflicts',
    tips: [
      'Check package.json and lockfile for the missing package.',
      'Install the missing dependency; avoid upgrading unrelated packages.',
    ],
  },
  {
    id: 'cors',
    pattern: /cors|access-control-allow-origin/i,
    category: 'API / Network (CORS)',
    tips: [
      'Ensure server CORS allows the preview origin.',
      'Prefer same-origin API routes when possible.',
    ],
  },
  {
    id: 'preview-load',
    pattern:
      /preview.*(failed|load)|bootstrap failed|iframe failed|no index\.html|files were not applied|go code (failed|error)/i,
    category: 'Build / preview load',
    tips: [
      'Confirm bootstrap HTML/entry exists.',
      'Check for compile / apply errors blocking the preview shell.',
      'After Fix: reload Preview; App Status should clear if fingerprints do not reappear.',
    ],
  },
  {
    id: 'auth',
    pattern: /\b401\b|\b403\b|unauthorized|forbidden/i,
    category: 'Authentication',
    tips: [
      'Confirm session/cookie or token is present for the request.',
      'Do not weaken auth — fix the call site or missing credentials path.',
    ],
  },
];

/**
 * Match technical messages → short English appendix for the system prompt.
 */
export function matchBugDatabaseSnippets(technicalMessages: string[]): string {
  const joined = technicalMessages.filter(Boolean).join('\n');
  if (!joined.trim()) return '';

  const matched: BugHint[] = [];
  for (const hint of HINTS) {
    if (hint.pattern.test(joined)) matched.push(hint);
    if (matched.length >= 4) break;
  }
  if (matched.length === 0) return '';

  const lines: string[] = [
    'BUG_DATABASE_HINTS (matched patterns — prefer these remedies; still follow NDM):',
  ];
  for (const h of matched) {
    lines.push(`- ${h.category}:`);
    for (const tip of h.tips.slice(0, 3)) {
      lines.push(`  • ${tip}`);
    }
  }
  let out = lines.join('\n');
  if (out.length > MAX_APPENDIX_CHARS) {
    out = `${out.slice(0, MAX_APPENDIX_CHARS)}…`;
  }
  return out;
}
