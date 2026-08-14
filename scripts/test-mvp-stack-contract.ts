/**
 * MVP stack: no Supabase unless plan asks; artifact sync timeout constant.
 * Run: npx tsx scripts/test-mvp-stack-contract.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  filterUnsolicitedBaaSBlocks,
  MVP_STACK_GO_BULLETS,
  planOrNoteAllowsExternalBaaS,
  shouldSkipUnsolicitedBaaSFile,
  sweepUnsolicitedBaaSFromWorkspace,
} from '../lib/mvpStackContract.ts';
import { SECURITY_BASELINE_DRAFT } from '../lib/securityBaselinePropose.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

assert.equal(planOrNoteAllowsExternalBaaS('Expo mobile education app'), false);
assert.equal(planOrNoteAllowsExternalBaaS('Use Supabase Auth + RLS'), true);
assert.equal(
  planOrNoteAllowsExternalBaaS(SECURITY_BASELINE_DRAFT),
  false,
  'security baseline prohibition must not count as choosing Supabase',
);
assert.equal(
  planOrNoteAllowsExternalBaaS(MVP_STACK_GO_BULLETS),
  false,
  'Go stack bullets mentioning NOT Supabase must not allow the vendor',
);
assert.equal(
  planOrNoteAllowsExternalBaaS(
    `${SECURITY_BASELINE_DRAFT}\n\nKids reading MVP. Stack: Expo + mock auth.`,
  ),
  false,
);

assert.equal(
  shouldSkipUnsolicitedBaaSFile(
    'src/lib/supabase.ts',
    "import { createClient } from '@supabase/supabase-js'",
    SECURITY_BASELINE_DRAFT,
  ),
  true,
);

assert.equal(
  shouldSkipUnsolicitedBaaSFile(
    'lib/supabase.ts',
    "import { createClient } from '@supabase/supabase-js'",
    'kids reading MVP',
  ),
  true,
);
assert.equal(
  shouldSkipUnsolicitedBaaSFile(
    'lib/supabase.ts',
    "import { createClient } from '@supabase/supabase-js'",
    'Stack: Supabase + Expo',
  ),
  false,
);

const filtered = filterUnsolicitedBaaSBlocks(
  [
    {
      relativePath: 'app/kid/home.tsx',
      body: 'export default function Home(){return null}',
    },
    {
      relativePath: 'lib/supabase.ts',
      body: "import { createClient } from '@supabase/supabase-js'\nexport const supabase = createClient('https://x.supabase.co','k')",
    },
    {
      relativePath: 'supabase/migrations/001_rls_policies.sql',
      body: 'create policy...',
    },
  ],
  'Mobile education app — no vendor named',
);
assert.equal(filtered.kept.length, 1);
assert.equal(filtered.kept[0].relativePath, 'app/kid/home.tsx');
assert.ok(filtered.skipped.includes('lib/supabase.ts'));
assert.ok(filtered.skipped.some((p) => p.startsWith('supabase/')));
assert.match(String(filtered.reason), /Skipped unsolicited/);

{
  const baselineFiltered = filterUnsolicitedBaaSBlocks(
    [
      {
        relativePath: 'src/lib/supabase.ts',
        body: "import { createClient } from '@supabase/supabase-js'\nexport const supabase = createClient('https://x.supabase.co','k')",
      },
      {
        relativePath: 'app/page.tsx',
        body: 'export default function Page(){return null}',
      },
    ],
    SECURITY_BASELINE_DRAFT,
  );
  assert.equal(baselineFiltered.kept.length, 1);
  assert.ok(baselineFiltered.skipped.includes('src/lib/supabase.ts'));
}

assert.equal(
  shouldSkipUnsolicitedBaaSFile(
    'src/lib/db.ts',
    "import { createClient } from '@supabase/supabase-js'\nexport const db = createClient('https://x.supabase.co','k')",
    'kids reading MVP',
  ),
  true,
);
assert.equal(
  shouldSkipUnsolicitedBaaSFile(
    'package.json',
    '{"dependencies":{"@supabase/supabase-js":"2.0.0"}}',
    'kids reading MVP',
  ),
  false,
);

{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'go-baas-sweep-'));
  try {
    const srcLib = path.join(tmp, 'src', 'lib');
    fs.mkdirSync(srcLib, { recursive: true });
    fs.writeFileSync(path.join(srcLib, 'supabase.ts'), 'export const supabase = 1\n');
    const removed = sweepUnsolicitedBaaSFromWorkspace(tmp, SECURITY_BASELINE_DRAFT);
    assert.ok(removed.includes('src/lib/supabase.ts'));
    assert.equal(fs.existsSync(path.join(srcLib, 'supabase.ts')), false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

assert.match(MVP_STACK_GO_BULLETS, /NOT Supabase/);
assert.match(SECURITY_BASELINE_DRAFT, /do \*\*not\*\* invent Supabase/i);

const goPrompt = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
assert.match(goPrompt, /MVP_STACK_GO_BULLETS/);
assert.match(goPrompt, /filterUnsolicitedBaaSBlocks/);
assert.equal(
  /sweepUnsolicitedBaaSFromWorkspace/.test(goPrompt),
  false,
  'apply gate drops new vendor files only — do not auto-delete existing workspace files',
);

const syncSrc = fs.readFileSync(path.join(root, 'src/lib/ideArtifactSync.ts'), 'utf8');
assert.match(syncSrc, /ARTIFACT_SYNC_TIMEOUT_MS/);
assert.match(syncSrc, /Artifact sync timed out/);
assert.match(syncSrc, /withHardTimeout/);
assert.match(syncSrc, /Artifact sync timed out\/skipped/);

console.log('\n✓ mvp stack + artifact sync contract passed\n');
