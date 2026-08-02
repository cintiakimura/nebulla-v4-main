/**
 * UI Generation v2 smoke (seed-first, no Figma).
 * Run: npm run test:ui-gen
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  applyBriefRefinePatch,
  applyRematchPick,
  applyUiGenerationToPreviewShell,
  catalogRootFromCwd,
  compileDesignBrief,
  listProfilesFs,
  matchResources,
  parseBriefRefinePatch,
  parseRematchSuggestion,
  rankResourceCandidates,
  runUiGenerationCycleV2,
  shouldAttemptRematch,
  shouldApplyUiToPreview,
  validateV2Quality,
} from '../lib/uiGenerationEngine/index.ts';
import { selectTemplate, TEMPLATE_DEFS } from '../lib/uiGenerationEngine/v2/selectTemplate.ts';
import { classifyPage } from '../lib/uiGenerationEngine/v2/classifyPage.ts';
import {
  parseReferenceBuckets,
  preferredBucketForClassification,
  resolveProbeKeys,
} from '../lib/uiGenerationEngine/v2/figmaReferences.ts';
import type { DesignBrief } from '../lib/uiGenerationEngine/resources/types.ts';

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

section('compileDesignBrief: roles from §5 + gaps when thin');
{
  const classification = classifyPage({
    projectType: 'mobile app',
    goal: 'task productivity',
    features: 'tasks',
    uiux: 'Clean teal primary (#0F766E), light bg, medium density, strong CTA.',
    pageName: 'Home',
    pagePurpose: 'home',
    filePaths: ['app/(tabs)/index.tsx'],
    fileRoutes: ['/'],
    hasBottomNav: true,
  });
  const brief = compileDesignBrief({
    uiuxSection:
      'Clean teal primary (#0F766E), light bg, medium density, bottom tabs, spacious cards, strong CTA.',
    uiBriefMarkdown: '# UI Brief\n\n## Home\nPrimary CTA: Start task\n',
    classification,
    projectName: 'TaskFlow',
  });
  assert.ok(brief.color_roles.primary.hex, 'primary role hex');
  assert.ok(brief.color_roles.primary.usage.includes('CTA'), 'primary usage rule');
  assert.ok(brief.spacing_radius.gap > 0, 'spacing gap');
  assert.ok(brief.a11y_minimums.length >= 1, 'a11y minimums');
  assert.equal(brief.source, 'master_plan_s5+ui_brief');

  const thin = compileDesignBrief({
    uiuxSection: 'ok',
    classification,
  });
  assert.ok(thin.gaps.some((g) => /§5|thin/i.test(g)), 'honest gaps when §5 thin');
  assert.ok(thin.color_roles.primary.hex, 'still seed-capable with defaults');
}

section('matchResources: landing never picks mobile-only; scores required');
{
  const profiles = await listProfilesFs(catalogRootFromCwd(process.cwd()));
  assert.ok(profiles.length >= 5, `expected FS pilot profiles, got ${profiles.length}`);

  const landingClass = classifyPage({
    projectType: 'Landing Page',
    goal: 'marketing waitlist landing',
    features: 'hero cta pricing',
    uiux: 'bold spacious marketing clean professional',
    pageName: 'Home',
    pagePurpose: 'landing hero',
    filePaths: ['app/page.tsx'],
    fileRoutes: ['/'],
  });
  const brief = compileDesignBrief({
    uiuxSection: 'Bold spacious marketing, clean professional, primary CTA hero.',
    classification: landingClass,
  });
  const match = matchResources({ profiles, brief, classification: landingClass });
  assert.ok(match.reasons.length > 0, 'match must include scored reasons');
  assert.ok(typeof match.score === 'number', 'score required');
  if (match.selection_mode === 'scored_match' || match.selection_mode === 'below_threshold') {
    assert.ok(match.id, 'top candidate id when any pass filters');
    assert.notEqual(match.profile?.platform, 'mobile', 'landing must not select mobile profile');
  }
  const mobileOnly = profiles.filter((p) => p.platform === 'mobile');
  assert.ok(mobileOnly.length > 0, 'catalog has mobile profiles for filter test');
  const filteredOut = !mobileOnly.some((p) => p.id === match.id);
  assert.ok(filteredOut || match.selection_mode === 'no_candidates', 'winner is not a mobile profile');
}

section('qualityGate: brief-aware rules (≥2)');
{
  const template = TEMPLATE_DEFS.mobile_home_hero_cards;
  const brief: DesignBrief = {
    overview: {
      personality: ['clean'],
      density: 'medium',
      density_philosophy: 'Balanced',
    },
    color_roles: {
      primary: { hex: '#0F766E', usage: 'CTA only' },
      surface: { hex: '#FFFFFF', usage: 'cards' },
      on_surface: { hex: '#1C1917', usage: 'text' },
      muted: { hex: '#78716C', usage: 'meta' },
      background: { hex: '#FAFAF9', usage: 'bg' },
      border: { hex: '#E7E5E4', usage: 'border' },
    },
    typography_roles: { display: '', title: '', body: '', label: '' },
    spacing_radius: { gap: 12, pad: 16, radius: 12 },
    component_rules: [],
    dos: [],
    donts: [],
    a11y_minimums: ['contrast'],
    gaps: [],
    source: 'master_plan_s5+ui_brief',
  };
  const tokens = {
    bg: '#FAFAF9',
    surface: '#FFFFFF',
    primary: '#0F766E',
    accent: '#14B8A6',
    text: '#1C1917',
    mutedText: '#78716C',
    border: '#E7E5E4',
    radius: 12,
    gap: 24,
    pad: 16,
    shadow: 'none' as const,
    tone: 'clean' as const,
  };
  const badModel = {
    version: 1 as const,
    pages: {
      home: {
        id: 'home',
        name: 'Home',
        nodes: {
          t1: {
            id: 't1',
            type: 'text' as const,
            name: 'a',
            style: { color: '#0F766E' },
          },
          t2: {
            id: 't2',
            type: 'text' as const,
            name: 'b',
            style: { color: '#0F766E' },
          },
          t3: {
            id: 't3',
            type: 'text' as const,
            name: 'c',
            style: { color: '#0F766E' },
          },
          b1: {
            id: 'b1',
            type: 'button' as const,
            name: 'cta',
            style: { backgroundColor: '#CCCCCC' },
          },
        },
      },
    },
    meta: { figma_status: 'skipped' as const },
  };
  const gated = validateV2Quality({
    model: badModel as never,
    template,
    tokens,
    slots: { hero_title: 'Hi', primary_cta: 'Go' },
    figmaStatus: 'skipped',
    pageType: 'home',
    designBrief: brief,
  });
  const joined = gated.issues.join(' | ');
  assert.ok(/primary color role not applied/i.test(joined), 'rule: primary on CTA');
  assert.ok(/overused on body text/i.test(joined) || /density\/spacing mismatch/i.test(joined), 'rule: body or density');
  assert.ok(gated.gate === 'repair' || gated.gate === 'weak', 'brief violations fail gate');
  assert.equal(shouldApplyUiToPreview('weak'), false, 'weak still blocks Preview');
}

section('v2 meta exposes resource_match');
{
  const metaPath = path.join(tmp, 'nebulla-project', 'ui-generation-v2-meta.json');
  if (fs.existsSync(metaPath)) {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as {
      resource_match?: { selection_mode?: string; reasons?: unknown[]; grok_rematch?: boolean };
      design_brief_summary?: { primary?: string; grok_refined?: boolean };
    };
    assert.ok(meta.resource_match?.selection_mode, 'resource_match.selection_mode');
    assert.ok(Array.isArray(meta.resource_match?.reasons), 'resource_match.reasons');
    assert.ok(meta.design_brief_summary?.primary, 'design_brief_summary');
    assert.equal(meta.design_brief_summary?.grok_refined, false, 'no key → no grok refine');
    assert.equal(meta.resource_match?.grok_rematch, false, 'no key → no grok rematch');
  }
}

section('Phase G: brief refine parse rejects layout invent; rematch shortlist-only');
{
  const classification = classifyPage({
    projectType: 'Landing Page',
    goal: 'marketing waitlist',
    features: 'hero cta',
    uiux: 'spacious clean bold',
    pageName: 'Home',
    pagePurpose: 'landing',
    filePaths: ['app/page.tsx'],
    fileRoutes: ['/'],
  });
  const brief = compileDesignBrief({
    uiuxSection: 'Spacious clean bold marketing, teal primary CTA.',
    classification,
  });
  const okPatch = parseBriefRefinePatch(
    JSON.stringify({
      personality: ['clean', 'bold'],
      density: 'spacious',
      dos: ['Keep hero CTA above the fold'],
      primary_usage: 'Hero CTA fill only',
    }),
  );
  assert.ok(okPatch, 'valid refine patch');
  const merged = applyBriefRefinePatch(brief, okPatch!);
  assert.ok(merged.overview.personality.includes('bold'));
  assert.ok(merged.donts.some((d) => /freeform/i.test(d)), 'reinforce no layout invent');

  const badLayout = parseBriefRefinePatch(
    JSON.stringify({
      personality: ['clean'],
      layout: { regions: ['absolute-chaos'] },
      template_id: 'invented_freeform',
    }),
  );
  assert.equal(badLayout, null, 'reject layout invention payload');

  const profiles = await listProfilesFs(catalogRootFromCwd(process.cwd()));
  const ranked = rankResourceCandidates({ profiles, brief: merged, classification });
  assert.ok(ranked.length >= 1, 'ranked shortlist');
  const allowed = new Set(ranked.map((r) => r.profile.id));
  const forged = parseRematchSuggestion(
    JSON.stringify({ profile_id: 'totally-invented-id', reason: 'pretty' }),
    allowed,
  );
  assert.equal(forged, null, 'reject invented profile id');
  const pickId = ranked[0].profile.id;
  const good = parseRematchSuggestion(
    JSON.stringify({ profile_id: pickId, reason: 'Best density + landing fit' }),
    allowed,
  );
  assert.ok(good, 'accept shortlist id');
  const applied = applyRematchPick(ranked, pickId, good!.reason);
  assert.ok(applied?.selection_mode === 'scored_match');
  assert.ok(applied?.reasons.some((r) => r.criterion === 'grok_rematch'));

  const lowMatch = matchResources({
    profiles,
    brief: merged,
    classification,
    minScore: 99,
  });
  assert.equal(lowMatch.selection_mode, 'below_threshold');
  assert.equal(shouldAttemptRematch(lowMatch, classification), true);
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log('\nAll UI gen smoke checks passed.');
