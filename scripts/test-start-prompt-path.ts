/**
 * New Project / Start prompt helpers.
 * Run: npx tsx scripts/test-start-prompt-path.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { shortNameFromIdea } from '../src/lib/projectNameFromIdea';
import {
  isMasterPlanCompleteForDiscovery,
  isMasterPlanReadyForUiMockup,
} from '../lib/masterPlanCompleteness';
import { canStartUiMockup } from '../src/lib/uiMockupGate';
import { buildFastPrototypeBootstrap, isHiddenBootstrapUserMessage } from '../src/lib/ideChatBootstrap';
import {
  mergeSecurityBaselineIntoSection2,
  planNeedsSecurityBaseline,
} from '../lib/securityBaselinePropose';

assert.equal(shortNameFromIdea('Build a mobile education app for kids'), 'mobile education app for kids');
assert.equal(shortNameFromIdea('Create an app for teachers'), 'app for teachers');
assert.equal(shortNameFromIdea('build me an responsiven webapp for kids'), 'responsiven webapp for kids');
assert.equal(
  shortNameFromIdea(
    'build me an responsiven (webapp and mobile app running on browser) app that create an app to tutor kids with ADHD where the teacher can upload homework',
  ),
  'tutor kids with ADHD',
);
assert.ok(shortNameFromIdea('!!!').length > 0);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const good = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '../nebula-project/fixtures/master-plan/good-crud-auth.json'),
    'utf8',
  ),
) as Record<string, unknown>;

assert.equal(isMasterPlanReadyForUiMockup(good), true);
assert.equal(isMasterPlanCompleteForDiscovery(good), true);
assert.equal(canStartUiMockup({ masterPlan: good, uiBriefLength: 200 }), true);

// Structure-ready plan missing security → mockup OK, discovery-complete false
const eduThinSec = {
  ...good,
  '1. Goal of the app':
    'Reading practice app for kids and teachers. Students practice; teachers track progress. In: practice. Out: marketplace.',
  '2. Tech and Research':
    'Project Type: Mobile App. Competitors: Epic Homer ABCmouse Khan Kids Duolingo. Patterns: large taps, progress stars. Evidence: No supporting studies found for this feature.',
};
assert.equal(planNeedsSecurityBaseline(eduThinSec), true);
assert.equal(isMasterPlanReadyForUiMockup(eduThinSec), true);
assert.equal(isMasterPlanCompleteForDiscovery(eduThinSec), false);

const merged = mergeSecurityBaselineIntoSection2(String(eduThinSec['2. Tech and Research']));
assert.ok(merged && /security baseline/i.test(merged));
const withSec = { ...eduThinSec, '2. Tech and Research': merged! };
assert.equal(isMasterPlanCompleteForDiscovery(withSec), true);

const boot = buildFastPrototypeBootstrap(
  'Build a mobile education app for kids to practice reading',
  'Mobile App',
);
assert.ok(isHiddenBootstrapUserMessage(boot));
assert.ok(boot.includes('Security baseline'));
assert.ok(boot.includes('primary_actions'));
assert.ok(boot.includes('UI Gen v2'));

console.log('test-start-prompt-path: ok');
