/**
 * MVP stack: Render-only; no Supabase unless the user/plan explicitly names it.
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
  UNSOLICITED_BAAS_SKIP_REASON,
} from '../lib/mvpStackContract.ts';
import { SECURITY_BASELINE_DRAFT } from '../lib/securityBaselinePropose.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

assert.equal(planOrNoteAllowsExternalBaaS('Expo mobile education app'), false);
assert.equal(planOrNoteAllowsExternalBaaS('Use Supabase Auth + RLS'), true);
assert.equal(planOrNoteAllowsExternalBaaS('I want Supabase'), true);
assert.equal(
  planOrNoteAllowsExternalBaaS(SECURITY_BASELINE_DRAFT),
  false,
  'security baseline must not count as choosing a hosted BaaS',
);
assert.equal(
  planOrNoteAllowsExternalBaaS(MVP_STACK_GO_BULLETS),
  false,
  'Go stack bullets must not count as choosing a hosted BaaS',
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
    'src/utils/supabase-client.ts',
    'export const url = process.env.SUPABASE_URL',
    'kids reading MVP',
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
assert.equal(
  shouldSkipUnsolicitedBaaSFile(
    'lib/supabase.ts',
    "import { createClient } from '@supabase/supabase-js'",
    'I want Supabase for auth',
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
assert.equal(filtered.reason, UNSOLICITED_BAAS_SKIP_REASON);

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

{
  const pkg = filterUnsolicitedBaaSBlocks(
    [
      {
        relativePath: 'package.json',
        body: JSON.stringify({
          dependencies: { react: '19.0.0', '@supabase/supabase-js': '2.0.0' },
        }),
      },
    ],
    'kids reading MVP',
  );
  assert.equal(pkg.kept.length, 1);
  assert.equal(pkg.kept[0].relativePath, 'package.json');
  assert.equal(/@supabase/.test(pkg.kept[0].body), false);
  assert.match(pkg.kept[0].body, /"react"/);
  assert.equal(pkg.reason, UNSOLICITED_BAAS_SKIP_REASON);
}

{
  const allowed = filterUnsolicitedBaaSBlocks(
    [
      {
        relativePath: 'lib/supabase.ts',
        body: "import { createClient } from '@supabase/supabase-js'",
      },
    ],
    'Please use Supabase Auth',
  );
  assert.equal(allowed.kept.length, 1);
  assert.equal(allowed.skipped.length, 0);
}

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

assert.match(MVP_STACK_GO_BULLETS, /Render-only/);
assert.match(MVP_STACK_GO_BULLETS, /Render PostgreSQL/);
assert.equal(/add Supabase/i.test(MVP_STACK_GO_BULLETS), false);
assert.equal(/supabase/i.test(SECURITY_BASELINE_DRAFT), false, 'baseline must not mention Supabase');
assert.match(SECURITY_BASELINE_DRAFT, /in-app RLS|authorization checks|in-app/i);

const goPrompt = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
assert.match(goPrompt, /MVP_STACK_GO_BULLETS/);
assert.match(goPrompt, /filterUnsolicitedBaaSBlocks/);
assert.equal(
  /sweepUnsolicitedBaaSFromWorkspace/.test(goPrompt),
  false,
  'apply gate drops new vendor files only — do not auto-delete existing workspace files',
);
assert.equal(/add Supabase/i.test(goPrompt), false);

const codingAppendix = fs.readFileSync(path.join(root, 'src/lib/grokChatArtifacts.ts'), 'utf8');
const assistant = fs.readFileSync(path.join(root, 'src/lib/nebulaAssistantSystemPrompt.ts'), 'utf8');
assert.equal(/add Supabase/i.test(codingAppendix), false);
assert.equal(/add @supabase/i.test(codingAppendix), false);
assert.equal(/add Supabase/i.test(assistant), false);
assert.match(assistant, /Render PostgreSQL/);
assert.match(codingAppendix, /Render-only stack|mock\/local role gates on Render/);

const rootPkg = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
assert.equal(/@supabase/.test(rootPkg), false);

const pipeline = fs.readFileSync(path.join(root, 'src/lib/nebulaGrokCodingPipeline.ts'), 'utf8');
assert.match(pipeline, /UNSOLICITED_BAAS_SKIP_REASON/);

const syncSrc = fs.readFileSync(path.join(root, 'src/lib/ideArtifactSync.ts'), 'utf8');
assert.match(syncSrc, /ARTIFACT_SYNC_TIMEOUT_MS/);
assert.match(syncSrc, /Artifact sync timed out/);
assert.match(syncSrc, /withHardTimeout/);
assert.match(syncSrc, /Artifact sync timed out\/skipped/);

console.log('\n✓ mvp stack + artifact sync contract passed\n');
