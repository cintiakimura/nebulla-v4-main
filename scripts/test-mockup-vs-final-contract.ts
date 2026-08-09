/**
 * Mockup vs final UI contract smoke:
 * - coding prompts ban treating UI Studio mockup as spec
 * - post-code UI action is one-shot on UI-relevant apply (no loop)
 *
 * Run: npx tsx scripts/test-mockup-vs-final-contract.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MOCKUP_NON_AUTHORITATIVE_GO_BULLETS,
  MOCKUP_NON_AUTHORITATIVE_RULE,
} from '../lib/codingMockupContract.ts';
import { CODING_QUALITY_APPENDIX } from '../src/lib/grokChatArtifacts.ts';
import {
  extractUiRouteKeys,
  resolvePostCodeUiAction,
} from '../src/lib/postCodeUiRefresh.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

assert.match(MOCKUP_NON_AUTHORITATIVE_RULE, /Do not treat UI Studio mockup/);
assert.match(MOCKUP_NON_AUTHORITATIVE_RULE, /plan wins/i);
assert.match(MOCKUP_NON_AUTHORITATIVE_GO_BULLETS, /preview-model as the spec/);
assert.match(CODING_QUALITY_APPENDIX, /Do not treat UI Studio mockup/);
assert.match(CODING_QUALITY_APPENDIX, /silent dead buttons/i);
assert.match(CODING_QUALITY_APPENDIX, /Working app output/i);

{
  const goBullets = fs.readFileSync(
    path.join(root, 'lib/interactiveProductPreview.ts'),
    'utf8',
  );
  assert.match(goBullets, /WORKING APP OUTPUT/);
  assert.match(goBullets, /Silent no-op buttons are forbidden/);
  assert.match(goBullets, /public\/product-preview/);
}

const assistantPrompt = fs.readFileSync(
  path.join(root, 'src/lib/nebulaAssistantSystemPrompt.ts'),
  'utf8',
);
assert.match(assistantPrompt, /Mockup non-authoritative/);
assert.match(assistantPrompt, /Do not treat UI Studio mockup/);

const serverSrc = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
assert.match(serverSrc, /MOCKUP_NON_AUTHORITATIVE_GO_BULLETS/);
assert.match(serverSrc, /MOCKUP VS FINAL UI/);

assert.equal(
  resolvePostCodeUiAction({
    writtenPaths: ['lib/utils.ts'],
    alreadyRanPostCode: false,
  }),
  'skip_no_ui_paths',
);

assert.equal(
  resolvePostCodeUiAction({
    writtenPaths: ['app/page.tsx', 'app/layout.tsx'],
    alreadyRanPostCode: false,
  }),
  'regen_post_code',
);

assert.deepEqual(extractUiRouteKeys(['app/page.tsx', 'app/layout.tsx']), [
  'app',
  'app/layout.tsx',
]);

assert.equal(
  resolvePostCodeUiAction({
    writtenPaths: ['app/page.tsx'],
    alreadyRanPostCode: true,
    previouslyCoveredKeys: extractUiRouteKeys(['app/page.tsx']),
  }),
  'sync_preview_only',
);

assert.equal(
  resolvePostCodeUiAction({
    writtenPaths: ['src/components/Home.tsx'],
    alreadyRanPostCode: true,
    force: true,
  }),
  'regen_post_code',
);

// Primary slice after Foundation: new routes → another Studio refresh
assert.equal(
  resolvePostCodeUiAction({
    writtenPaths: [
      'app/globals.css',
      'app/kid/page.tsx',
      'app/kid/tutor/page.tsx',
      'app/kid/rewards/page.tsx',
    ],
    alreadyRanPostCode: true,
    previouslyCoveredKeys: ['app', 'app/layout'],
  }),
  'regen_post_code',
);

assert.equal(
  resolvePostCodeUiAction({
    writtenPaths: ['app/kid/page.tsx'],
    alreadyRanPostCode: true,
    previouslyCoveredKeys: ['app/kid'],
  }),
  'sync_preview_only',
);

const uiLogic = fs.readFileSync(
  path.join(root, 'nebulla-project/ui-generation-logic-v2.md'),
  'utf8',
);
assert.match(uiLogic, /## 1\.1 Mockup vs final UI/);
assert.match(uiLogic, /plan wins/);
assert.match(uiLogic, /Preview authority/);

const inference = fs.readFileSync(
  path.join(root, 'nebula-project/inference-first-rules.md'),
  'utf8',
);
assert.match(inference, /Post-code UI refresh/);

const cycle = fs.readFileSync(
  path.join(root, 'lib/uiGenerationEngine/v2/runUiGenerationCycleV2.ts'),
  'utf8',
);
assert.match(cycle, /phase: resolvedUiPhase/);
assert.match(cycle, /uiPhase/);

console.log('\n✓ mockup vs final UI contract passed\n');
