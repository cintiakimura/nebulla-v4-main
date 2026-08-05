/**
 * UI mockup gate — plan + ui-brief before coding.
 * Run: npx tsx scripts/test-ui-mockup-gate.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canStartUiMockup } from '../src/lib/uiMockupGate';
import { isMasterPlanReadyForUiMockup } from '../lib/masterPlanCompleteness';
import {
  filterGrokContentToArchitectureFiles,
  isArchitectureArtifactPath,
} from '../src/lib/nebulaGrokCodingPipeline';

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

console.log('test-ui-mockup-gate: ok');
