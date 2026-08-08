/**
 * Local-first Figma reference retrieval (Generate path).
 * Run: npm run test:figma-local-first
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  isFigmaLiveOnGenerate,
  retrieveFigmaReferences,
} from '../lib/uiGenerationEngine/v2/figmaReferences.ts';
import type { PageClassification } from '../lib/uiGenerationEngine/v2/types.ts';

const MOBILE_KEY = 'ZEbJpC67UQyeeynt1UR8gT';

const classification: PageClassification = {
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
  function: 'general',
  navigation_type: 'bottom_tabs',
  industry_class: 'education',
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
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    fetchCalls.push(url);
    if (handler) return handler(url);
    throw new Error(`Unexpected fetch in local-first test: ${url}`);
  }) as typeof fetch;
}

function restoreFetch() {
  globalThis.fetch = originalFetch;
}

function ensureOfflineRaw(cwd: string, fileKey: string) {
  const dir = path.join(cwd, 'nebulla-project', 'figma-library', 'raw', fileKey);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'document.json'),
    JSON.stringify({
      name: 'Test Mobile Kit',
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
              { name: 'Card List', type: 'FRAME', layoutMode: 'VERTICAL', itemSpacing: 8 },
              { name: 'Primary CTA Button', type: 'FRAME', layoutMode: 'HORIZONTAL' },
            ],
          },
        ],
      },
    }),
    'utf8',
  );
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
  assert.equal(isFigmaLiveOnGenerate('1'), true);
  assert.equal(isFigmaLiveOnGenerate('true'), true);

  section('7.1 Offline raw → usable offline success without api.figma.com');
  ensureOfflineRaw(tmp, MOBILE_KEY);
  process.env.FIGMA_REFERENCE_FILE_KEYS = MOBILE_KEY;
  process.env.FIGMA_REFERENCE_BUCKETS = `mobile=${MOBILE_KEY}`;
  delete process.env.FIGMA_LIVE_ON_GENERATE;
  process.env.FIGMA_API_KEY = 'figd_test_token_should_not_be_used';
  installFetchSpy();
  {
    const rec = await retrieveFigmaReferences({
      classification,
      templateId: 'mobile_home_hero_cards',
      seedState,
    });
    assert.equal(rec.figma_status, 'offline');
    assert.equal(rec.figma_used, 'yes');
    assert.equal(rec.fallback_used, 'no');
    assert.ok(rec.selection_mode.startsWith('offline:'));
    assert.ok(rec.structure_hints.length > 0);
    assert.equal(fetchCalls.length, 0, `expected zero fetch, got ${fetchCalls.join(', ')}`);
  }

  section('7.2 FIGMA_LIVE_ON_GENERATE unset → zero live calls (no offline)');
  const emptyTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nebulla-figma-empty-'));
  process.chdir(emptyTmp);
  process.env.FIGMA_REFERENCE_FILE_KEYS = 'MissingKeyAAAAAAAAAAAA';
  process.env.FIGMA_REFERENCE_BUCKETS = 'mobile=MissingKeyAAAAAAAAAAAA';
  delete process.env.FIGMA_LIVE_ON_GENERATE;
  process.env.FIGMA_API_KEY = 'figd_test_token_should_not_be_used';
  installFetchSpy();
  {
    const rec = await retrieveFigmaReferences({
      classification,
      templateId: 'mobile_home_hero_cards',
      seedState,
    });
    assert.notEqual(rec.figma_status, 'success');
    assert.notEqual(rec.figma_status, 'offline');
    assert.equal(rec.figma_used, 'no');
    assert.equal(rec.fallback_used, 'yes');
    assert.equal(fetchCalls.length, 0, `expected zero live calls, got ${fetchCalls.join(', ')}`);
  }

  section('7.3 Live enabled + 429 → seed fallback, no throw');
  process.env.FIGMA_LIVE_ON_GENERATE = '1';
  process.env.FIGMA_API_KEY = 'figd_test_token';
  process.env.FIGMA_REFERENCE_MAX_FILES = '2';
  installFetchSpy(async (url) => {
    if (url.includes('api.figma.com')) {
      return new Response('rate limited', { status: 429 });
    }
    throw new Error(`unexpected url ${url}`);
  });
  {
    const rec = await retrieveFigmaReferences({
      classification,
      templateId: 'mobile_home_hero_cards',
      seedState,
    });
    assert.equal(rec.figma_status, 'rate_limited');
    assert.equal(rec.figma_used, 'no');
    assert.equal(rec.fallback_used, 'yes');
    assert.ok(fetchCalls.some((u) => u.includes('api.figma.com/v1/files/')));
    // Hard stop after first 429 — at most one file probe (no /me required)
    const fileProbes = fetchCalls.filter((u) => u.includes('/v1/files/'));
    assert.ok(fileProbes.length <= 2);
    assert.equal(fileProbes.length, 1, 'stop further live probes on 429');
  }

  section('7.4 Seed-only never reports live Figma success');
  delete process.env.FIGMA_LIVE_ON_GENERATE;
  delete process.env.FIGMA_API_KEY;
  installFetchSpy();
  {
    const rec = await retrieveFigmaReferences({
      classification,
      templateId: 'mobile_home_hero_cards',
      seedState,
    });
    assert.notEqual(rec.figma_status, 'success');
    assert.equal(rec.figma_used, 'no');
    assert.ok(rec.selection_mode.includes('seed') || rec.figma_status === 'weak_matches');
    assert.equal(fetchCalls.length, 0);
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
