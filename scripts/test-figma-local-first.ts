/**
 * Local-first Figma reference retrieval + structure application.
 * Run: npm run test:figma-local-first
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ensureSlotsForStructurePlan,
  parseStructureLayoutPlan,
} from '../lib/uiGenerationEngine/v2/applyStructureHints.ts';
import {
  isFigmaLiveOnGenerate,
  parseReferenceBuckets,
  resolveProbeKeys,
  retrieveFigmaReferences,
} from '../lib/uiGenerationEngine/v2/figmaReferences.ts';
import { renderTemplateModel } from '../lib/uiGenerationEngine/v2/renderTemplateModel.ts';
import { getTemplateById } from '../lib/uiGenerationEngine/v2/selectTemplate.ts';
import { validateV2Quality } from '../lib/uiGenerationEngine/v2/qualityGate.ts';
import { buildDesignTokens } from '../lib/uiGenerationEngine/v2/designTokens.ts';
import type { PageClassification } from '../lib/uiGenerationEngine/v2/types.ts';

const MOBILE_KEY = 'ZEbJpC67UQyeeynt1UR8gT';
const LANDING_KEY = 'P6lA9sHTHVbnmUfoYbV9Ir';
const AUTH_KEY = 'MaFREMBRF3vQ8BhtqA2ZpK';
import { fileURLToPath } from 'node:url';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const mobileClass: PageClassification = {
  device: 'mobile',
  page_type: 'home',
  product_function: 'general',
  navigation_mode: 'bottom_tabs',
  industry: 'education',
  density: 'medium',
  confidence: 'high',
  notes: 'test',
};

const seedState = {
  device: 'mobile' as const,
  page_type: 'home' as const,
  function: 'general' as const,
  navigation_type: 'tabs' as const,
  industry_class: 'education' as const,
  visual_tone: 'friendly',
  density: 'medium' as const,
};

function section(name: string) {
  console.log(`\n✓ ${name}`);
}

const originalFetch = globalThis.fetch;
let fetchCalls: string[] = [];

function installFetchSpy(handler?: (url: string) => Promise<Response>) {
  fetchCalls = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    );
    fetchCalls.push(url);
    if (handler) return handler(url);
    throw new Error(`Unexpected fetch in local-first test: ${url}`);
  }) as typeof fetch;
}

function restoreFetch() {
  globalThis.fetch = originalFetch;
}

function writeLeanDoc(
  cwd: string,
  fileKey: string,
  kind: 'mobile' | 'landing' | 'auth',
  where: 'structure' | 'raw' = 'structure',
) {
  const dir = path.join(cwd, 'nebulla-project', 'figma-library', where, fileKey);
  fs.mkdirSync(dir, { recursive: true });
  const doc =
    kind === 'auth'
      ? {
          name: 'Auth kit',
          document: {
            name: 'Document',
            type: 'DOCUMENT',
            children: [
              {
                name: 'iPhone Auth Login',
                type: 'FRAME',
                layoutMode: 'VERTICAL',
                itemSpacing: 14,
                cornerRadius: 12,
                children: [
                  { name: 'Header Auth Title', type: 'FRAME', layoutMode: 'VERTICAL' },
                  {
                    name: 'Form Card',
                    type: 'FRAME',
                    layoutMode: 'VERTICAL',
                    itemSpacing: 12,
                    children: [
                      { name: 'Email Field', type: 'FRAME', layoutMode: 'HORIZONTAL' },
                      { name: 'Password Field', type: 'FRAME', layoutMode: 'HORIZONTAL' },
                      { name: 'Primary CTA Button', type: 'FRAME', layoutMode: 'HORIZONTAL' },
                    ],
                  },
                ],
              },
            ],
          },
        }
      : kind === 'landing'
        ? {
            name: 'Landing',
            document: {
              name: 'Document',
              type: 'DOCUMENT',
              children: [
                {
                  name: 'Desktop Landing Hero',
                  type: 'FRAME',
                  layoutMode: 'VERTICAL',
                  itemSpacing: 24,
                  children: [
                    { name: 'Nav Header', type: 'FRAME', layoutMode: 'HORIZONTAL' },
                    { name: 'Hero CTA', type: 'FRAME', layoutMode: 'VERTICAL', itemSpacing: 16 },
                    {
                      name: 'Feature Card Group',
                      type: 'FRAME',
                      layoutMode: 'HORIZONTAL',
                      itemSpacing: 16,
                    },
                  ],
                },
              ],
            },
          }
        : {
            name: 'Mobile kit',
            document: {
              name: 'Document',
              type: 'DOCUMENT',
              children: [
                {
                  name: 'iPhone Home',
                  type: 'FRAME',
                  layoutMode: 'VERTICAL',
                  itemSpacing: 16,
                  cornerRadius: 12,
                  children: [
                    { name: 'Header Nav', type: 'FRAME', layoutMode: 'HORIZONTAL' },
                    {
                      name: 'Card List',
                      type: 'FRAME',
                      layoutMode: 'VERTICAL',
                      itemSpacing: 8,
                    },
                    { name: 'Primary CTA Button', type: 'FRAME', layoutMode: 'HORIZONTAL' },
                  ],
                },
              ],
            },
          };
  fs.writeFileSync(path.join(dir, 'document.json'), JSON.stringify(doc), 'utf8');
}

const prevCwd = process.cwd();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nebulla-figma-local-'));
process.chdir(tmp);

const prevEnv = {
  FIGMA_API_KEY: process.env.FIGMA_API_KEY,
  FIGMA_LIVE_ON_GENERATE: process.env.FIGMA_LIVE_ON_GENERATE,
  FIGMA_REFERENCE_FILE_KEYS: process.env.FIGMA_REFERENCE_FILE_KEYS,
  FIGMA_REFERENCE_BUCKETS: process.env.FIGMA_REFERENCE_BUCKETS,
  FIGMA_REFERENCE_MAX_FILES: process.env.FIGMA_REFERENCE_MAX_FILES,
};

try {
  section('isFigmaLiveOnGenerate defaults off');
  delete process.env.FIGMA_LIVE_ON_GENERATE;
  assert.equal(isFigmaLiveOnGenerate(), false);

  section('6.1 Offline structure → offline success, no live');
  writeLeanDoc(tmp, MOBILE_KEY, 'mobile', 'structure');
  process.env.FIGMA_REFERENCE_FILE_KEYS = MOBILE_KEY;
  process.env.FIGMA_REFERENCE_BUCKETS = `mobile=${MOBILE_KEY}`;
  delete process.env.FIGMA_LIVE_ON_GENERATE;
  process.env.FIGMA_API_KEY = 'figd_unused';
  installFetchSpy();
  {
    const rec = await retrieveFigmaReferences({
      classification: mobileClass,
      templateId: 'mobile_home_hero_cards',
      seedState,
    });
    assert.equal(rec.figma_status, 'offline');
    assert.equal(rec.figma_used, 'yes');
    assert.ok(rec.selection_mode.startsWith('offline:'));
    assert.equal(fetchCalls.length, 0);
  }

  section('6.2 Auth classification → auth bucket offline preferred');
  writeLeanDoc(tmp, AUTH_KEY, 'auth', 'structure');
  process.env.FIGMA_REFERENCE_FILE_KEYS = `${MOBILE_KEY},${AUTH_KEY}`;
  process.env.FIGMA_REFERENCE_BUCKETS = `mobile=${MOBILE_KEY},auth=${AUTH_KEY}`;
  installFetchSpy();
  {
    const authClass: PageClassification = {
      ...mobileClass,
      page_type: 'auth',
      navigation_mode: 'none',
    };
    const rec = await retrieveFigmaReferences({
      classification: authClass,
      templateId: 'mobile_auth_form',
      seedState: { ...seedState, page_type: 'auth', navigation_type: 'none' },
    });
    assert.equal(rec.figma_status, 'offline');
    assert.ok(rec.preferred_bucket === 'auth');
    assert.ok(rec.selected_refs.some((r) => r.id.includes(AUTH_KEY)));
    assert.equal(fetchCalls.length, 0);
  }

  section('6.3 Landing does not use mobile-only kit when buckets exist');
  writeLeanDoc(tmp, LANDING_KEY, 'landing', 'structure');
  process.env.FIGMA_REFERENCE_BUCKETS = `mobile=${MOBILE_KEY},landing=${LANDING_KEY}`;
  process.env.FIGMA_REFERENCE_FILE_KEYS = `${MOBILE_KEY},${LANDING_KEY}`;
  {
    const landingClass: PageClassification = {
      device: 'landing',
      page_type: 'landing',
      product_function: 'general',
      navigation_mode: 'none',
      industry: 'saas',
      density: 'spacious',
      confidence: 'high',
      notes: '',
    };
    const buckets = parseReferenceBuckets(process.env.FIGMA_REFERENCE_BUCKETS);
    const probe = resolveProbeKeys(landingClass, [MOBILE_KEY, LANDING_KEY], buckets);
    assert.deepEqual(probe.keys, [LANDING_KEY]);
    assert.ok(!probe.keys.includes(MOBILE_KEY));
    installFetchSpy();
    const rec = await retrieveFigmaReferences({
      classification: landingClass,
      templateId: 'landing_hero_features_cta',
      seedState: {
        device: 'web',
        page_type: 'landing',
        function: 'general' as const,
        navigation_type: 'none' as const,
        industry_class: 'other' as const,
        visual_tone: '',
        density: 'spacious' as const,
      },
    });
    assert.equal(rec.figma_status, 'offline');
    assert.ok(rec.selected_refs.some((r) => r.id.includes(LANDING_KEY)));
    assert.ok(!rec.selected_refs.some((r) => r.id.includes(MOBILE_KEY)));
    assert.equal(fetchCalls.length, 0);
  }

  section('6.4 Empty offline + empty catalog → seed; honest; no crash');
  const emptyTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nebulla-figma-empty-'));
  process.chdir(emptyTmp);
  process.env.FIGMA_REFERENCE_FILE_KEYS = 'MissingKeyAAAAAAAAAAAA';
  process.env.FIGMA_REFERENCE_BUCKETS = 'mobile=MissingKeyAAAAAAAAAAAA';
  delete process.env.FIGMA_LIVE_ON_GENERATE;
  installFetchSpy();
  {
    const rec = await retrieveFigmaReferences({
      classification: mobileClass,
      templateId: 'mobile_home_hero_cards',
      seedState,
    });
    assert.notEqual(rec.figma_status, 'success');
    assert.notEqual(rec.figma_status, 'offline');
    assert.equal(rec.figma_used, 'no');
    assert.ok(rec.selection_mode.includes('seed') || rec.figma_status === 'weak_matches');
    assert.equal(fetchCalls.length, 0);
  }

  section('6.5 Auth/mobile render has title + content + CTA after structure plan');
  process.chdir(tmp);
  {
    const template = getTemplateById('mobile_auth_form')!;
    const hints = [
      'frame "Form Card" uses VERTICAL auto-layout',
      'spacing rhythm ≈ 14px (Form Card)',
      'auth: title, subtitle, email/password fields, primary button',
    ];
    const plan = parseStructureLayoutPlan(hints, 'auth', 'mobile_auth_form');
    let slots = ensureSlotsForStructurePlan({}, plan, 'auth', 'Kids Read');
    const tokens = buildDesignTokens('', '', 'medium');
    let model = renderTemplateModel({
      template,
      classification: { ...mobileClass, page_type: 'auth', navigation_mode: 'none' },
      tokens,
      slots,
      figmaStatus: 'offline',
      structureHints: hints,
    });
    let gate = validateV2Quality({
      model,
      template,
      tokens,
      slots,
      figmaStatus: 'offline',
      pageType: 'auth',
      selectionMode: 'offline:bucket:auth',
    });
    if (gate.gate !== 'pass') {
      slots = ensureSlotsForStructurePlan(slots, plan, 'auth', 'Kids Read');
      model = renderTemplateModel({
        template,
        classification: { ...mobileClass, page_type: 'auth', navigation_mode: 'none' },
        tokens,
        slots,
        figmaStatus: 'offline',
        structureHints: hints,
      });
      gate = validateV2Quality({
        model,
        template,
        tokens,
        slots,
        figmaStatus: 'offline',
        pageType: 'auth',
        selectionMode: 'offline:bucket:auth',
      });
    }
    assert.ok(slots.hero_title || slots.nav_title);
    assert.ok(slots.primary_cta);
    assert.ok(slots.field_1_label && slots.field_2_label);
    const nodes = Object.values(Object.values(model.pages)[0].nodes);
    assert.ok(nodes.some((n) => n.type === 'button'));
    assert.ok(nodes.filter((n) => n.type === 'container' || n.type === 'box').length >= 2);
    assert.ok(gate.gate === 'pass' || gate.gate === 'repair', `gate=${gate.gate} ${gate.issues}`);
  }

  section('6.1b Repo structure/ shortlist exists for ops');
  for (const k of [MOBILE_KEY, LANDING_KEY, AUTH_KEY]) {
    const p = path.join(REPO, 'nebulla-project', 'figma-library', 'structure', k, 'document.json');
    assert.ok(fs.existsSync(p), `missing committed structure ${k}`);
  }

  section('7.3 Live enabled + 429 → local/seed fallback');
  process.chdir(emptyTmp);
  process.env.FIGMA_LIVE_ON_GENERATE = '1';
  process.env.FIGMA_API_KEY = 'figd_test';
  process.env.FIGMA_REFERENCE_MAX_FILES = '2';
  installFetchSpy(async (url) => {
    if (url.includes('api.figma.com')) return new Response('rate limited', { status: 429 });
    throw new Error(`unexpected ${url}`);
  });
  {
    const rec = await retrieveFigmaReferences({
      classification: mobileClass,
      templateId: 'mobile_home_hero_cards',
      seedState,
    });
    assert.equal(rec.figma_status, 'rate_limited');
    assert.equal(rec.figma_used, 'no');
    assert.equal(fetchCalls.filter((u) => u.includes('/v1/files/')).length, 1);
  }

  console.log('\nAll figma local-first tests passed.\n');
} finally {
  restoreFetch();
  process.chdir(prevCwd);
  for (const [k, v] of Object.entries(prevEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}
