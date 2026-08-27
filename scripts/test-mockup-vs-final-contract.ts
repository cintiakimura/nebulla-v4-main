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
assert.match(serverSrc, /previewHtmlNeedsProductHeal/);
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
    writtenPaths: ['nebula-project/ui-brief.md'],
    alreadyRanPostCode: false,
  }),
  'skip_no_ui_paths',
);

assert.equal(
  resolvePostCodeUiAction({
    writtenPaths: ['app/page.tsx', 'app/layout.tsx'],
    alreadyRanPostCode: false,
    finalUiCount: 0,
  }),
  'run_final_ui',
);

assert.deepEqual(extractUiRouteKeys(['app/page.tsx', 'app/layout.tsx']), [
  'app',
  'app/layout.tsx',
]);

assert.equal(
  resolvePostCodeUiAction({
    writtenPaths: ['app/page.tsx'],
    alreadyRanPostCode: true,
    finalUiCount: 1,
    sliceLabel: 'Foundation',
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
  'run_final_ui',
);

assert.equal(
  resolvePostCodeUiAction({
    writtenPaths: [
      'app/globals.css',
      'app/kid/page.tsx',
      'app/kid/tutor/page.tsx',
      'app/kid/rewards/page.tsx',
    ],
    alreadyRanPostCode: true,
    finalUiCount: 1,
    sliceLabel: 'Primary',
    previouslyCoveredKeys: ['app', 'app/layout'],
  }),
  'sync_preview_only',
);

assert.equal(
  resolvePostCodeUiAction({
    writtenPaths: ['app/parent/dashboard/page.tsx'],
    alreadyRanPostCode: true,
    finalUiCount: 1,
    sliceLabel: 'Polish',
  }),
  'run_final_ui',
);

assert.equal(
  resolvePostCodeUiAction({
    writtenPaths: ['app/page.tsx'],
    alreadyRanPostCode: true,
    finalUiCount: 2,
    sliceLabel: 'Polish',
  }),
  'sync_preview_only',
);

{
  const engine = fs.readFileSync(path.join(root, 'src/lib/uiStudioBetaEngine.ts'), 'utf8');
  assert.match(engine, /App Preview is ready/);
  assert.equal(/switch Studio/.test(engine), false);
  assert.equal(/dispatchOpenUiStudioBeta\(\)/.test(engine.slice(engine.indexOf('sync_preview_only'))), false);
  const catalog = fs.readFileSync(path.join(root, 'src/lib/i18n/ideCatalog.ts'), 'utf8');
  assert.match(catalog, /Sync preview and project map/);
  assert.equal(/Refresh mind map & open UI Studio/.test(catalog), false);
  const canvas = fs.readFileSync(
    path.join(root, 'src/components/ide/shell/previewTools/BuildPreviewCanvas.tsx'),
    'utf8',
  );
  assert.match(canvas, /refreshWaitState/);
  assert.equal(/setShowMockup\(true\);\s*\n\s*bump\(\);/.test(canvas), false);
}

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
assert.match(inference, /Final UI \(post-apply restyle/);

const cycle = fs.readFileSync(
  path.join(root, 'lib/uiGenerationEngine/v2/runUiGenerationCycleV2.ts'),
  'utf8',
);
assert.match(cycle, /phase: resolvedUiPhase/);
assert.match(cycle, /uiPhase/);

console.log('\n✓ mockup vs final UI contract passed\n');
