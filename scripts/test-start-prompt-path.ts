/**
 * New Project / Start prompt helpers.
 * Run: npx tsx scripts/test-start-prompt-path.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inferProductName, logoInitials, looksLikeGoalStubName, shortNameFromIdea } from '../src/lib/projectNameFromIdea';
import {
  buildProductIdentity,
  patchMasterPlanProductName,
  writeProductIdentity,
} from '../lib/productIdentity';
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

{
  const goal =
    'Build a privacy-first learning companion for kids that helps them practice reading every day.';
  const name = inferProductName(goal, 'Mobile App');
  const words = name.split(/\s+/).filter(Boolean);
  assert.ok(words.length >= 2 && words.length <= 4, `brand should be 2–4 words, got "${name}"`);
  assert.ok(words.every((w) => /^[A-Z]/.test(w)), `Title Case expected, got "${name}"`);
  assert.ok(!looksLikeGoalStubName(name, goal), `inferred name leaked the goal: ${name}`);
  assert.ok(!/privacy-first|companion|^build\b/i.test(name), `stopword leaked into "${name}"`);
  assert.notEqual(name.toLowerCase(), shortNameFromIdea(goal).toLowerCase());
  assert.ok(!goal.toLowerCase().startsWith(name.toLowerCase()));
  const initials = logoInitials(name);
  assert.equal(initials.length, 2);
  assert.match(initials, /^[A-Z]{2}$/);
  const identity = buildProductIdentity(goal, 'Mobile App');
  assert.equal(identity.logoInitials.length, 2);
  assert.ok(identity.logoHint);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nebulla-identity-'));
  const goalSection = 'Project Type: Mobile App\n\nKids practice reading with a private companion.\n';
  fs.writeFileSync(
    path.join(dir, 'master-plan.json'),
    JSON.stringify(
      {
        '1. Goal of the app': goalSection,
        '5. UI/UX design': '- **Project:** Chopped Brief — mobile education\n- **Mood:** calm',
      },
      null,
      2,
    ),
    'utf8',
  );
  writeProductIdentity(dir, identity);
  const plan = JSON.parse(fs.readFileSync(path.join(dir, 'master-plan.json'), 'utf8')) as Record<string, string>;
  assert.equal(plan['1. Goal of the app'], goalSection);
  assert.match(plan['5. UI/UX design'], new RegExp(identity.projectName));
  const renamed = patchMasterPlanProductName(plan, {
    ...identity,
    projectName: 'Harbor Path',
    logoInitials: 'HP',
  });
  assert.equal(renamed.plan['1. Goal of the app'], goalSection);
  assert.match(renamed.plan['5. UI/UX design'], /Harbor Path/);
  fs.rmSync(dir, { recursive: true, force: true });
}

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

// Structure-ready plan missing security → mockup OK; discovery complete (SEC is warn-only MVP).
const eduThinSec = {
  ...good,
  '1. Goal of the app':
    'Reading practice app for kids and teachers. Students practice; teachers track progress. In: practice. Out: marketplace.',
  '2. Tech and Research':
    'Project Type: Mobile App. Competitors: Epic Homer ABCmouse Khan Kids Duolingo. Patterns: large taps, progress stars. Evidence: No supporting studies found for this feature.',
};
assert.equal(planNeedsSecurityBaseline(eduThinSec), true);
assert.equal(isMasterPlanReadyForUiMockup(eduThinSec), true);
assert.equal(isMasterPlanCompleteForDiscovery(eduThinSec), true);

const merged = mergeSecurityBaselineIntoSection2(String(eduThinSec['2. Tech and Research']));
assert.ok(merged && /security baseline/i.test(merged));
const withSec = { ...eduThinSec, '2. Tech and Research': merged! };
assert.equal(planNeedsSecurityBaseline(withSec), false);
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
