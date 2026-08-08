/**
 * MVP stack: no Supabase unless plan asks; artifact sync timeout constant.
 * Run: npx tsx scripts/test-mvp-stack-contract.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  filterUnsolicitedBaaSBlocks,
  MVP_STACK_GO_BULLETS,
  planOrNoteAllowsExternalBaaS,
  shouldSkipUnsolicitedBaaSFile,
} from '../lib/mvpStackContract.ts';
import { SECURITY_BASELINE_DRAFT } from '../lib/securityBaselinePropose.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

assert.equal(planOrNoteAllowsExternalBaaS('Expo mobile education app'), false);
assert.equal(planOrNoteAllowsExternalBaaS('Use Supabase Auth + RLS'), true);

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

assert.match(MVP_STACK_GO_BULLETS, /NOT Supabase/);
assert.match(SECURITY_BASELINE_DRAFT, /do \*\*not\*\* invent Supabase/i);

const goPrompt = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
assert.match(goPrompt, /MVP_STACK_GO_BULLETS/);
assert.match(goPrompt, /filterUnsolicitedBaaSBlocks/);

const syncSrc = fs.readFileSync(path.join(root, 'src/lib/ideArtifactSync.ts'), 'utf8');
assert.match(syncSrc, /ARTIFACT_SYNC_TIMEOUT_MS/);
assert.match(syncSrc, /Artifact sync timed out/);

console.log('\n✓ mvp stack + artifact sync contract passed\n');
