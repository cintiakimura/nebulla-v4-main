/**
 * UI Gen v2 fallback ladder: missing structure/ and color conflict must not
 * block preview write or mocked Foundation Go/apply.
 * Run: npm run test:ui-gen-fallback
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runUiGenerationCycleV2, shouldApplyUiToPreview } from '../lib/uiGenerationEngine/index.ts';
import {
  applyTokensToModel,
  colorsConflict,
  shouldWriteUiPreview,
} from '../lib/uiGenerationEngine/v2/previewCompose.ts';
import { defaultTokens } from '../lib/uiGenerationEngine/v2/designTokens.ts';
import type { V2EditorModel } from '../lib/uiGenerationEngine/v2/types.ts';
import { foundationCodingAllowedAfterResearch } from '../src/lib/uiMockupGate.ts';

function section(name: string) {
  console.log(`\n✓ ${name}`);
}

delete process.env.FIGMA_LIVE_ON_GENERATE;
delete process.env.FIGMA_API_KEY;
delete process.env.FIGMA_REFERENCE_FILE_KEYS;
delete process.env.FIGMA_REFERENCE_BUCKETS;
process.env.FIGMA_PREVIEW_SKIN = 'kit';

section('helpers: Ready vs write vs Go');
{
  assert.equal(shouldApplyUiToPreview('weak'), false);
  assert.equal(shouldApplyUiToPreview('pass'), true);
  assert.equal(shouldWriteUiPreview({ gate: 'weak', uiStatus: 'partial' }), true);
  assert.equal(shouldWriteUiPreview({ gate: 'pass', uiStatus: 'ready' }), true);
  assert.equal(foundationCodingAllowedAfterResearch(true), true);
  assert.equal(foundationCodingAllowedAfterResearch(false), false);
}

section('color conflict — tokens overlay keeps nodes');
{
  const kit = defaultTokens('medium');
  const named = { ...kit, bg: '#0C0A09', text: '#FAFAF9', surface: '#1C1917', primary: '#2DD4BF' };
  assert.equal(colorsConflict(kit, named), true);
  const model = {
    pages: {
      home: {
        rootId: 'root',
        nodes: {
          root: {
            id: 'root',
            type: 'container',
            role: 'screen',
            children: ['top', 'card_1', 'card_2', 'cta'],
            style: { backgroundColor: kit.bg, color: kit.text },
          },
          top: {
            id: 'top',
            type: 'container',
            role: 'top_bar',
            children: [],
            style: { backgroundColor: kit.surface, color: kit.text },
          },
          card_1: {
            id: 'card_1',
            type: 'container',
            role: 'card',
            children: [],
            style: { backgroundColor: kit.surface, color: kit.text },
          },
          card_2: {
            id: 'card_2',
            type: 'container',
            role: 'card',
            children: [],
            style: { backgroundColor: kit.surface, color: kit.text },
          },
          cta: {
            id: 'cta',
            type: 'button',
            role: 'button_primary',
            text: 'Start',
            children: [],
            style: { backgroundColor: kit.primary, color: '#FFFFFF' },
          },
        },
      },
    },
  } as unknown as V2EditorModel;
  const before = Object.keys(model.pages.home.nodes).sort();
  const after = applyTokensToModel(model, named);
  assert.deepEqual(Object.keys(after.pages.home.nodes).sort(), before);
  assert.equal(after.pages.home.nodes.cta.type, 'button');
  assert.equal(foundationCodingAllowedAfterResearch(true), true);
}

section('missing structure/ — still writes preview, does not block apply/Go');
{
  const prevIsolate = process.env.FIGMA_LIBRARY_ISOLATE;
  const prevRoot = process.env.FIGMA_LIBRARY_ROOT;
  process.env.FIGMA_LIBRARY_ISOLATE = '1';
  process.env.FIGMA_LIBRARY_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'nebulla-empty-figma-'));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nebulla-ui-fallback-'));
  const masterPlanPath = path.join(tmp, 'master-plan.json');
  fs.writeFileSync(
    masterPlanPath,
    JSON.stringify(
      {
        '1. Goal of the app':
          'TaskFlow — a mobile productivity app for personal task lists and daily focus. Project type: mobile app.',
        '2. Tech and Research':
          'React + Tailwind. Offline-first lists. Evidence: common task apps use bottom tabs + list rows.',
        '3. Features and KPIs':
          '- Create tasks\n- Mark complete\n- Streak KPI\n- Primary CTA: Start task',
        '4. Pages and navigation':
          '- **Home** (`/home`) — daily list and start task\n- **List** (`/list`) — all tasks',
        '5. UI/UX design':
          'Dark mode navy (#0C0A09), teal primary (#0F766E), medium density, bottom tabs, spacious cards, strong CTA.',
      },
      null,
      2,
    ),
    'utf8',
  );
  try {
    const result = await runUiGenerationCycleV2({
      workspaceRoot: tmp,
      masterPlanPath,
      projectName: 'TaskFlow',
      pageName: 'Home',
    });
    const metaPath = path.join(tmp, 'nebulla-project', 'ui-generation-v2-meta.json');
    assert.equal(fs.existsSync(metaPath), true, 'writes preview meta');
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as {
      ui_status?: string;
      quality_gate_result?: string;
      template_id?: string;
      skin_mode?: string;
      palette_id?: string;
      preview_applied?: boolean;
      figma?: { figma_status?: string };
    };
    assert.equal(result.ok, true);
    assert.equal(result.previewApplied, true);
    assert.equal(meta.ui_status, 'partial');
    assert.notEqual(meta.quality_gate_result, 'pass');
    assert.ok(meta.template_id);
    assert.ok(meta.skin_mode === 'kit' || meta.skin_mode === 'tokens');
    assert.ok(meta.palette_id);
    assert.equal(shouldApplyUiToPreview(meta.quality_gate_result), false, 'not Ready');
    assert.equal(
      shouldWriteUiPreview({ gate: meta.quality_gate_result, uiStatus: meta.ui_status }),
      true,
    );
    assert.equal(foundationCodingAllowedAfterResearch(true), true);
    const applyAllowed = shouldWriteUiPreview({
      gate: meta.quality_gate_result,
      uiStatus: meta.ui_status,
    });
    assert.equal(applyAllowed, true, 'mocked apply-preview not blocked');
  } finally {
    if (prevIsolate === undefined) delete process.env.FIGMA_LIBRARY_ISOLATE;
    else process.env.FIGMA_LIBRARY_ISOLATE = prevIsolate;
    if (prevRoot === undefined) delete process.env.FIGMA_LIBRARY_ROOT;
    else process.env.FIGMA_LIBRARY_ROOT = prevRoot;
  }
}

console.log('\ntest-ui-gen-fallback: ok');
