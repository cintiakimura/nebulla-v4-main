/**
 * UI Generation v2 smoke (seed-first, no Figma).
 * Run: npm run test:ui-gen
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  applyUiGenerationToPreviewShell,
  runUiGenerationCycleV2,
  shouldApplyUiToPreview,
} from '../lib/uiGenerationEngine/index.ts';
import { selectTemplate } from '../lib/uiGenerationEngine/v2/selectTemplate.ts';
import { classifyPage } from '../lib/uiGenerationEngine/v2/classifyPage.ts';
import {
  parseReferenceBuckets,
  preferredBucketForClassification,
  resolveProbeKeys,
} from '../lib/uiGenerationEngine/v2/figmaReferences.ts';

function section(name: string) {
  console.log(`\n✓ ${name}`);
}

// Clear Figma for this process — seed path must work without it.
delete process.env.FIGMA_API_KEY;
delete process.env.FIGMA_REFERENCE_FILE_KEYS;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nebulla-ui-gen-'));
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
        '- **Home** (`/`)\n- **Tasks** (`/tasks`)\n- **Settings** (`/settings`)',
      '5. UI/UX design':
        'Clean teal primary (#0F766E), light bg, medium density, bottom tabs, spacious cards, strong CTA.',
    },
    null,
    2,
  ),
  'utf8',
);

section('selectTemplate: tasks vs ecommerce differ');
{
  const tasks = selectTemplate(
    classifyPage({
      projectType: 'mobile app',
      goal: 'task productivity mobile',
      features: 'tasks checklist',
      uiux: 'mobile tabs',
      pageName: 'Tasks',
      pagePurpose: 'task list today',
      filePaths: ['app/(tabs)/tasks.tsx'],
      fileRoutes: ['/tasks'],
      hasBottomNav: true,
    }),
  );
  const shop = selectTemplate(
    classifyPage({
      projectType: 'mobile ecommerce',
      goal: 'ecommerce marketplace mobile shop',
      features: 'cart products booking',
      uiux: 'mobile cards',
      pageName: 'Home',
      pagePurpose: 'featured storefront',
      filePaths: ['app/(tabs)/index.tsx'],
      fileRoutes: ['/'],
      hasBottomNav: true,
    }),
  );
  assert.notEqual(tasks.id, shop.id, 'tasks and ecommerce templates should differ');
}

section('runUiGenerationCycleV2 without Figma / without Grok key');
{
  const result = await runUiGenerationCycleV2({
    workspaceRoot: tmp,
    masterPlanPath,
    projectName: 'TaskFlow',
    pageName: 'Home',
    // no apiKeyOverride — seed path must still work
  });

  assert.ok(result.editorModel?.pages, 'editor model pages present');
  const page = Object.values(result.editorModel!.pages)[0];
  assert.ok(page && Object.keys(page.nodes || {}).length >= 4, 'nodes present');

  assert.equal(result.patternMode, 'seed');
  assert.equal(result.figma_fallback_used, true);
  assert.ok(
    ['pass', 'repair', 'weak'].includes(result.quality_gate_result || ''),
    `gate must be pass|repair|weak, got ${result.quality_gate_result}`,
  );

  const metaPath = path.join(tmp, 'nebulla-project', 'ui-generation-v2-meta.json');
  assert.ok(fs.existsSync(metaPath), 'v2 meta written');
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as {
    pattern_mode?: string;
    figma?: { figma_status?: string; fallback_used?: string };
    slots?: Record<string, string>;
    quality_gate_result?: string;
  };
  assert.equal(meta.pattern_mode, 'seed');
  assert.notEqual(meta.figma?.figma_status, 'success');
  assert.equal(meta.figma?.fallback_used, 'yes');

  const title = meta.slots?.hero_title || meta.slots?.nav_title || '';
  const cta = meta.slots?.primary_cta || '';
  assert.ok(title && !/^\/[a-z0-9/_-]+$/i.test(title), 'title not a route dump');
  assert.ok(cta && !/^\/[a-z0-9/_-]+$/i.test(cta), 'cta not a route dump');

  if (shouldApplyUiToPreview(result.quality_gate_result)) {
    assert.equal(result.ok, true);
    assert.equal(result.previewApplied, true);
    assert.ok(fs.existsSync(path.join(tmp, 'index.html')), 'index.html written on pass/repair');
    const html = fs.readFileSync(path.join(tmp, 'index.html'), 'utf8');
    assert.ok(html.includes(title.slice(0, Math.min(12, title.length))) || html.includes(cta));
  } else {
    assert.equal(result.ok, false);
    assert.notEqual(result.previewApplied, true);
  }
}

section('shouldApplyUiToPreview helper');
{
  assert.equal(shouldApplyUiToPreview('pass'), true);
  assert.equal(shouldApplyUiToPreview('repair'), true);
  assert.equal(shouldApplyUiToPreview('weak'), false);
}

section('Figma C.3 buckets: hit / miss / csv (never wrong mobile on landing)');
{
  const landingClass = classifyPage({
    projectType: 'Landing Page',
    goal: 'marketing waitlist landing',
    features: 'hero cta pricing',
    uiux: 'bold marketing',
    pageName: 'Home',
    pagePurpose: 'landing hero',
    filePaths: ['app/page.tsx'],
    fileRoutes: ['/'],
  });
  assert.equal(preferredBucketForClassification(landingClass), 'landing');

  const buckets = parseReferenceBuckets(
    'mobile=MOBILEKEY111,landing=LANDINGKEY222,dashboard=DASHKEY333',
  );
  const hit = resolveProbeKeys(landingClass, ['MOBILEKEY111', 'LANDINGKEY222'], buckets);
  assert.equal(hit.selection_mode, 'bucket:landing');
  assert.deepEqual(hit.keys, ['LANDINGKEY222']);

  const missBuckets = parseReferenceBuckets('mobile=MOBILEKEY111');
  const miss = resolveProbeKeys(landingClass, ['MOBILEKEY111', 'OTHERKEY'], missBuckets);
  assert.equal(miss.selection_mode, 'bucket_miss:landing');
  assert.equal(miss.keys.length, 0, 'strict landing must not probe mobile CSV when buckets exist');

  const noBuckets = resolveProbeKeys(landingClass, ['MOBILEKEY111', 'ZEbJpC67UQyeeynt1UR8gT'], new Map());
  assert.equal(noBuckets.selection_mode, 'csv');
  assert.notEqual(noBuckets.keys[0], 'ZEbJpC67UQyeeynt1UR8gT', 'known mobile key deprioritized for landing');

  const dashClass = classifyPage({
    projectType: 'Web App',
    goal: 'saas dashboard analytics',
    features: 'metrics charts',
    uiux: 'sidebar dense',
    pageName: 'Dashboard',
    pagePurpose: 'overview metrics',
    filePaths: ['app/dashboard/page.tsx'],
    fileRoutes: ['/dashboard'],
  });
  assert.equal(preferredBucketForClassification(dashClass), 'dashboard');
  const dashMiss = resolveProbeKeys(dashClass, ['MOBILEKEY111'], parseReferenceBuckets('mobile=MOBILEKEY111'));
  assert.equal(dashMiss.selection_mode, 'bucket_miss:dashboard');
}

section('selectTemplate: landing / marketing prefer landing family');
{
  const landing = selectTemplate(
    classifyPage({
      projectType: 'Landing Page',
      goal: 'product marketing site',
      features: 'hero features cta',
      uiux: 'marketing',
      pageName: 'Home',
      pagePurpose: 'convert visitors',
      filePaths: ['app/page.tsx'],
      fileRoutes: ['/'],
    }),
  );
  assert.ok(landing.id.startsWith('landing_'), `expected landing_* got ${landing.id}`);
}

section('applyPreviewShell writes only when called (pass path)');
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nebulla-preview-apply-'));
  const written = applyUiGenerationToPreviewShell({
    workspaceRoot: root,
    projectName: 'Demo',
    templateId: 'mobile_list_actions',
    tokens: {
      bg: '#FAFAF9',
      surface: '#FFFFFF',
      primary: '#0F766E',
      accent: '#14B8A6',
      text: '#1C1917',
      mutedText: '#78716C',
      border: '#E7E5E4',
      radius: 12,
      gap: 12,
      pad: 16,
      shadow: 'none',
      tone: 'clean',
    },
    slots: {
      hero_title: 'My Tasks',
      hero_subtitle: 'Today',
      primary_cta: 'Start task',
      item_1_title: 'Inbox zero',
      item_1_meta: '3 left',
    },
    patternMode: 'seed',
  });
  assert.deepEqual(written, ['index.html', 'public/nebula-ui-gen-preview.html']);
  assert.ok(fs.readFileSync(path.join(root, 'index.html'), 'utf8').includes('My Tasks'));
  fs.rmSync(root, { recursive: true, force: true });
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log('\nAll UI gen smoke checks passed.');
