/**
 * UI mockup gate — plan + ui-brief before coding.
 * Run: npx tsx scripts/test-ui-mockup-gate.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canStartUiMockup, readinessBlocksAutoFoundation, statusLooksReadyForSkip } from '../src/lib/uiMockupGate';
import { isMasterPlanReadyForUiMockup } from '../lib/masterPlanCompleteness';
import {
  filterGrokContentToArchitectureFiles,
  filterGrokContentToAppCodeFiles,
  hasOnlyArchitectureFileBlocks,
  isArchitectureArtifactPath,
  isCodingIntent,
} from '../src/lib/nebulaGrokCodingPipeline';
import { isLoadableStudioModel } from '../lib/uiMockupArtifactHonesty';
import {
  clearFalseRegenBudgetIfEmptyMockup,
  writeCyclePolicy,
  defaultCyclePolicy,
  readCyclePolicy,
} from '../lib/uiGenerationEngine/cyclePolicy';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const completePlan = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '../nebula-project/fixtures/master-plan/good-crud-auth.json'),
    'utf8',
  ),
) as Record<string, unknown>;

assert.equal(isMasterPlanReadyForUiMockup(completePlan), true);
assert.equal(
  canStartUiMockup({ masterPlan: completePlan, uiBriefLength: 200, inferenceFirst: true }),
  true,
);

assert.equal(
  canStartUiMockup({ masterPlan: completePlan, uiBriefLength: 10, inferenceFirst: true }),
  false,
);

assert.equal(
  canStartUiMockup({
    masterPlan: { '1. Goal of the app': 'x' },
    uiBriefLength: 200,
    inferenceFirst: true,
  }),
  false,
);

assert.equal(
  canStartUiMockup({
    masterPlan: completePlan,
    uiBriefLength: 200,
    blocked: true,
  }),
  false,
);

assert.equal(
  readinessBlocksAutoFoundation({
    ok: false,
    planComplete: false,
    uiBriefLength: 10,
    reasons: ['ui-brief.md missing or too short'],
  }),
  true,
);
assert.equal(
  readinessBlocksAutoFoundation({
    ok: true,
    planComplete: true,
    uiBriefLength: 200,
    reasons: [],
  }),
  false,
);

assert.equal(
  canStartUiMockup({
    masterPlan: completePlan,
    uiBriefLength: 200,
    uiBriefPageCount: 3,
    researchOk: false,
    inferenceFirst: true,
  }),
  false,
);
assert.equal(
  readinessBlocksAutoFoundation({
    ok: false,
    planComplete: true,
    uiBriefLength: 200,
    uiBriefPageCount: 3,
    researchOk: false,
    reasons: ['research not complete (need ≥5 real competitors + rankings)'],
  }),
  true,
);

assert.equal(isArchitectureArtifactPath('nebula-ui-studio/ui-brief.md'), true);
assert.equal(isArchitectureArtifactPath('nebula-project/competitor-research.md'), true);
assert.equal(isArchitectureArtifactPath('app/page.tsx'), false);

const mixed = [
  '```file:nebula-ui-studio/ui-brief.md',
  '# Brief',
  '```',
  '',
  '```file:app/page.tsx',
  'export default function Page() { return null }',
  '```',
].join('\n');
const archOnly = filterGrokContentToArchitectureFiles(mixed);
assert.ok(archOnly.includes('ui-brief.md'));
assert.ok(!archOnly.includes('app/page.tsx'));

const appOnly = filterGrokContentToAppCodeFiles(mixed);
assert.ok(appOnly.includes('app/page.tsx'));
assert.ok(!appOnly.includes('ui-brief.md'));

const archPlusStart = [
  '```file:nebula-ui-studio/ui-brief.md',
  '# Brief',
  '```',
  '',
  'START_CODING',
].join('\n');
assert.equal(hasOnlyArchitectureFileBlocks(archPlusStart), true);
assert.equal(Boolean(filterGrokContentToAppCodeFiles(archPlusStart)), false);
assert.equal(isCodingIntent(archPlusStart), true);

assert.equal(isLoadableStudioModel(null), false);
assert.equal(
  isLoadableStudioModel({
    pages: {
      Home: {
        nodes: { t: { text: 'Waiting for UI generation' } },
      },
    },
  }),
  false,
);
assert.equal(
  isLoadableStudioModel({
    pages: {
      Home: {
        nodes: { t: { text: 'Teacher login' } },
      },
    },
  }),
  true,
);

// Dark + cyan alone must not reject a real product mockup (false “already empty”).
assert.equal(
  isLoadableStudioModel({
    pages: {
      Home: {
        nodes: {
          root: {
            text: 'Start practice',
            style: { backgroundColor: '#080A14', color: '#00D4D4' },
          },
        },
      },
    },
  }),
  true,
);
assert.equal(
  isLoadableStudioModel({
    pages: {
      Home: {
        nodes: {
          root: {
            text: 'Nebulla Workspace Cosmic Night',
            style: { backgroundColor: '#080A14', color: '#00D4D4' },
          },
        },
      },
    },
  }),
  false,
);

assert.equal(statusLooksReadyForSkip({ has_loadable_model: true }), true);
assert.equal(
  statusLooksReadyForSkip({
    has_loadable_model: false,
    user_visible_stage: 'Ready in preview',
    final_status: 'generated',
  }),
  false,
  'leftover Ready stage must not skip generate',
);
assert.equal(statusLooksReadyForSkip({ final_status: 'accepted' }), false);

{
  const engine = fs.readFileSync(
    path.join(__dirname, '../src/lib/uiStudioBetaEngine.ts'),
    'utf8',
  );
  assert.match(engine, /statusLooksReadyForSkip\(existing\)/);
  assert.match(engine, /GENERATE_TIMEOUT_MS = 180_000/);
  assert.equal(/continuing Foundation anyway/.test(engine), false);
  assert.match(engine, /Foundation will not start/);
  assert.equal(
    /final === 'generated' \|\| final === 'refined'/.test(engine),
    false,
    'skip must not use leftover final_status as Ready',
  );
  const gate = fs.readFileSync(path.join(__dirname, '../src/lib/uiMockupGate.ts'), 'utf8');
  const codingGate = gate.slice(gate.indexOf('export async function canStartFoundationCoding'));
  assert.equal(
    /wasUiMockupStageStarted\(\)/.test(codingGate),
    false,
    'Foundation must not treat session mockup flags as success',
  );
  assert.match(
    codingGate,
    /researchSkipped === true \|\| body\.researchOk === true/,
    'Gate R fail-closed: mockup skip must not start Foundation',
  );
  const blockIdx = codingGate.indexOf('if (!researchAllowsGo)');
  const skipReturn = codingGate.indexOf("reason: 'explicit_skip'");
  assert.ok(blockIdx >= 0 && skipReturn > blockIdx);
}

{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nebulla-cycle-'));
  writeCyclePolicy(
    tmp,
    defaultCyclePolicy({
      regeneration_count: 3,
      final_status: 'failed',
      user_visible_stage: 'Preference recovery needed',
    }),
  );
  const cleared = clearFalseRegenBudgetIfEmptyMockup(tmp);
  assert.equal(cleared.regeneration_count, 0);
  assert.equal(cleared.final_status, 'pending');
  assert.equal(readCyclePolicy(tmp).regeneration_count, 0);
}

console.log('test-ui-mockup-gate: ok');
