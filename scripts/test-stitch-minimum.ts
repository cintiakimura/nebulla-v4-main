/**
 * Stitch-minimum enforcement: binding + gate + render.
 * Run: npm run test:stitch-minimum
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runUiGenerationCycleV2 } from '../lib/uiGenerationEngine/index.ts';
import { mapSlots, sanitizeSlotsForPageType } from '../lib/uiGenerationEngine/v2/mapSlots.ts';
import { stitchMinimumIssues } from '../lib/uiGenerationEngine/v2/applyStructureHints.ts';
import { validateV2Quality, repairSlots } from '../lib/uiGenerationEngine/v2/qualityGate.ts';
import { renderTemplateModel } from '../lib/uiGenerationEngine/v2/renderTemplateModel.ts';
import { getTemplateById } from '../lib/uiGenerationEngine/v2/selectTemplate.ts';
import { buildDesignTokens } from '../lib/uiGenerationEngine/v2/designTokens.ts';
import { shouldApplyUiToPreview } from '../lib/uiGenerationEngine/applyPreviewShell.ts';
import type { PageClassification } from '../lib/uiGenerationEngine/v2/types.ts';

function section(name: string) {
  console.log(`\n✓ ${name}`);
}

const homeClass: PageClassification = {
  device: 'mobile',
  page_type: 'home',
  product_function: 'course',
  navigation_mode: 'bottom_tabs',
  industry: 'education',
  density: 'medium',
  confidence: 'high',
  notes: '',
};

section('Home mapSlots never binds Email/Password');
{
  const template = getTemplateById('mobile_home_hero_cards')!;
  const slots = mapSlots({
    template,
    classification: homeClass,
    pageName: 'Kid Home',
    pagePurpose: 'Practice reading',
    projectName: 'Kids Read',
    primaryActions: ['Start practice'],
    secondaryActions: [],
    headings: [],
    buttonLabels: [],
    features: ['Teachers track progress', 'Daily reading practice'],
  });
  assert.equal(slots.field_1_label, undefined);
  assert.equal(slots.field_2_label, undefined);
  assert.ok(!Object.values(slots).some((v) => /^email$/i.test(String(v || ''))));
  assert.ok(slots.primary_cta);
  assert.ok(slots.card_1_title || slots.metric_1_title);
}

section('sanitize strips leaked auth fields on home');
{
  const cleaned = sanitizeSlotsForPageType(
    { hero_title: 'Home', field_1_label: 'Email', card_1_title: 'Email' },
    'home',
  );
  assert.equal(cleaned.field_1_label, undefined);
  assert.equal(cleaned.card_1_title, undefined);
}

section('Gate fails 2-box Email-on-Home fixture');
{
  const template = getTemplateById('mobile_home_hero_cards')!;
  const tokens = buildDesignTokens('teal primary', [], 'medium');
  const badSlots = {
    hero_title: 'Home',
    hero_subtitle: 'Web App',
    primary_cta: 'Continue',
    field_1_label: 'Email',
    field_2_label: 'Password',
  };
  const model = {
    pages: {
      Home: {
        rootId: 'r',
        nodes: {
          r: {
            id: 'r',
            role: 'screen',
            type: 'container' as const,
            children: ['a', 'b'],
            style: {
              backgroundColor: tokens.bg,
              color: tokens.text,
              paddingTop: 0,
              paddingBottom: 0,
              paddingLeft: 0,
              paddingRight: 0,
              marginTop: 0,
              marginBottom: 0,
              marginLeft: 0,
              marginRight: 0,
              borderRadius: 0,
              borderWidth: 0,
              borderColor: tokens.border,
              gap: 0,
              width: 'auto' as const,
              height: 'auto' as const,
              fontSize: 14,
              fontWeight: 400,
              textAlign: 'left' as const,
              opacity: 1,
            },
          },
          a: {
            id: 'a',
            role: 'box',
            type: 'container' as const,
            children: [],
            style: {
              backgroundColor: tokens.surface,
              color: tokens.text,
              paddingTop: 0,
              paddingBottom: 0,
              paddingLeft: 0,
              paddingRight: 0,
              marginTop: 0,
              marginBottom: 0,
              marginLeft: 0,
              marginRight: 0,
              borderRadius: 0,
              borderWidth: 0,
              borderColor: tokens.border,
              gap: 0,
              width: 'auto' as const,
              height: 'auto' as const,
              fontSize: 14,
              fontWeight: 400,
              textAlign: 'left' as const,
              opacity: 1,
            },
          },
          b: {
            id: 'b',
            role: 'box',
            type: 'container' as const,
            children: [],
            style: {
              backgroundColor: tokens.surface,
              color: tokens.text,
              paddingTop: 0,
              paddingBottom: 0,
              paddingLeft: 0,
              paddingRight: 0,
              marginTop: 0,
              marginBottom: 0,
              marginLeft: 0,
              marginRight: 0,
              borderRadius: 0,
              borderWidth: 0,
              borderColor: tokens.border,
              gap: 0,
              width: 'auto' as const,
              height: 'auto' as const,
              fontSize: 14,
              fontWeight: 400,
              textAlign: 'left' as const,
              opacity: 1,
            },
          },
        },
      },
    },
    meta: { engine: 'v2' as const, template_id: template.id, tokens, slots: badSlots, figma_status: 'offline' as const },
  };
  const stitch = stitchMinimumIssues({
    slots: badSlots,
    nodeCount: 3,
    containerCount: 2,
    buttonCount: 0,
    pageType: 'home',
    needsPrimaryCta: true,
    navigationMode: 'bottom_tabs',
    hasIdentityRegion: false,
    hasNavRegion: false,
    templateId: template.id,
  });
  assert.ok(stitch.some((i) => /auth fields|wrong field|sparse|CTA|identity|nav/i.test(i)));
  const gate = validateV2Quality({
    model,
    template,
    tokens,
    slots: badSlots,
    figmaStatus: 'offline',
    pageType: 'home',
    navigationMode: 'bottom_tabs',
    selectionMode: 'offline:bucket:mobile',
  });
  assert.notEqual(gate.gate, 'pass');
  assert.equal(shouldApplyUiToPreview(gate.gate), false);
}

section('Repair + render Home reaches Stitch-minimum pass');
{
  const template = getTemplateById('mobile_home_hero_cards')!;
  const tokens = buildDesignTokens('Clean teal primary (#0F766E), light bg', [], 'medium');
  tokens.primary = '#0F766E';
  tokens.bg = '#F8FAFC';
  tokens.surface = '#FFFFFF';
  tokens.text = '#0F172A';
  tokens.mutedText = '#64748B';
  tokens.border = '#E2E8F0';
  let slots = mapSlots({
    template,
    classification: homeClass,
    pageName: 'Home',
    pagePurpose: 'Kids practice reading',
    projectName: 'Kids Read',
    primaryActions: ['Start practice'],
    secondaryActions: ['See all'],
    headings: [],
    buttonLabels: [],
    features: ['Today’s lesson', 'Practice round', 'Teacher progress'],
  });
  slots = repairSlots(slots, 'home');
  const model = renderTemplateModel({
    template,
    classification: homeClass,
    tokens,
    slots,
    figmaStatus: 'offline',
    structureHints: ['frame "Content Blocks" uses VERTICAL auto-layout'],
  });
  const gate = validateV2Quality({
    model,
    template,
    tokens,
    slots,
    figmaStatus: 'offline',
    pageType: 'home',
    navigationMode: 'bottom_tabs',
    selectionMode: 'offline:bucket:mobile',
  });
  assert.equal(gate.gate, 'pass', gate.issues.join('; '));
  assert.equal(shouldApplyUiToPreview(gate.gate), true);
  const nodes = Object.values(Object.values(model.pages)[0].nodes);
  assert.ok(nodes.some((n) => /top_bar|identity/i.test(`${n.role} ${n.id}`)));
  assert.ok(nodes.some((n) => n.type === 'button'));
  assert.ok(nodes.some((n) => /bottom_tabs|nav-tab/i.test(`${n.role} ${n.id}`)));
}

section('Golden kids-reading cycle: no Email on Home; gate pass or honest weak');
{
  delete process.env.FIGMA_LIVE_ON_GENERATE;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nebulla-stitch-'));
  const masterPlanPath = path.join(tmp, 'master-plan.json');
  fs.writeFileSync(
    masterPlanPath,
    JSON.stringify(
      {
        '1. Goal of the app':
          'A mobile education app for kids to practice reading; teachers track progress. Project type: mobile app.',
        '2. Tech and Research': 'React Native style mobile. Evidence: education apps use bottom tabs.',
        '3. Features and KPIs':
          '- Daily reading practice\n- Teacher progress tracking\n- Streak KPI\n- Primary CTA: Start practice',
        '4. Pages and navigation':
          '- **Home** (`/`)\n- **Practice** (`/practice`)\n- **Progress** (`/progress`)',
        '5. UI/UX design':
          'Friendly teal primary (#0F766E), light bg, medium density, bottom tabs, spacious cards, strong CTA.',
      },
      null,
      2,
    ),
    'utf8',
  );
  const result = await runUiGenerationCycleV2({
    workspaceRoot: tmp,
    masterPlanPath,
    projectName: 'Kids Read',
    pageName: 'Home',
  });
  const slots = (result as { slots?: Record<string, string> }).slots;
  const metaPath = path.join(tmp, 'nebulla-project', 'ui-generation-v2-meta.json');
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as {
    slots?: Record<string, string>;
    quality_gate_result?: string;
    figma?: { figma_status?: string };
    pattern_mode?: string;
  };
  const s = meta.slots || slots || {};
  assert.ok(!s.field_1_label, 'Home must not have field_1_label');
  assert.ok(!Object.values(s).some((v) => /^email$/i.test(String(v || ''))), 'no Email label on Home');
  assert.equal(meta.quality_gate_result, 'pass', `expected pass, got ${meta.quality_gate_result}`);
  assert.equal(result.previewApplied, true);
  assert.ok(!/^email$/i.test(String(s.hero_subtitle || '')));
  console.log(
    `  → gate=${meta.quality_gate_result} figma=${meta.figma?.figma_status} pattern=${meta.pattern_mode}`,
  );
}

console.log('\nAll stitch-minimum tests passed.\n');
