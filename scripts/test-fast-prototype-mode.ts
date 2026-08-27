/**
 * Fast Prototype start-mode + intent detection (additive to Guided).
 * Run: npx tsx scripts/test-fast-prototype-mode.ts
 */
import assert from 'node:assert/strict';
import {
  detectFastPrototypeIntent,
  isIdeStartMode,
  normalizeStartMode,
} from '../src/lib/ideStartMode';
import {
  buildDiscoveryBootstrap,
  buildFastPrototypeBootstrap,
  buildFastPrototypeContinueBootstrap,
  buildIdeaDiscoveryBootstrap,
  FAST_PROTOTYPE_BOOTSTRAP_PREFIX,
  IDEA_DISCOVERY_BOOTSTRAP_PREFIX,
  isHiddenBootstrapUserMessage,
} from '../src/lib/ideChatBootstrap';

assert.equal(normalizeStartMode('fast_prototype'), 'fast_prototype');
assert.equal(normalizeStartMode('guided'), 'guided');
assert.equal(normalizeStartMode('nope'), 'fast_prototype'); // default = inference-first
assert.equal(normalizeStartMode(undefined), 'fast_prototype');
assert.equal(isIdeStartMode('fast_prototype'), true);
assert.equal(isIdeStartMode('guided'), true);
assert.equal(isIdeStartMode('agent'), false);

assert.equal(
  detectFastPrototypeIntent('Fast prototype: marketplace for local tutors'),
  true,
);
assert.equal(
  detectFastPrototypeIntent(
    'Build a mobile education app for kids to practice reading every day',
  ),
  true,
);
assert.equal(
  detectFastPrototypeIntent(
    'Education app for kids to practice reading; teachers track progress',
  ),
  true,
);
assert.equal(detectFastPrototypeIntent('fix this bug in login'), false);
assert.equal(
  detectFastPrototypeIntent('Build a mobile education app for kids', {
    hasAppStatusPayload: true,
  }),
  false,
);
assert.equal(
  detectFastPrototypeIntent('Build a mobile education app for kids', {
    masterPlanComplete: true,
  }),
  false,
);

const guided = buildIdeaDiscoveryBootstrap('A tutoring marketplace', 'Web App');
assert.ok(guided.startsWith(IDEA_DISCOVERY_BOOTSTRAP_PREFIX));
assert.ok(!guided.includes('FAST PROTOTYPE'));
assert.ok(guided.includes('Do NOT emit <START_MASTERPLAN>'));

const denseBrief = [
  'Web app that tutors kids with ADHD.',
  'Roles: student, teacher, parent.',
  'Privacy: no public profiles; adult consent required.',
  'Tone: calm coach, never shame. Gamification: short streaks only.',
  'Flows: practice session, teacher dashboard, progress.',
  'Study: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC1234567/',
].join(' ');
const dense = buildFastPrototypeBootstrap(denseBrief, 'Web App');
assert.ok(dense.includes('User goal / brief:'));
assert.ok(dense.includes(denseBrief.slice(0, 40)));
assert.equal(/Ask exactly ONE question: the main goal/i.test(dense), false);
assert.equal(/What's the main thing your app should do/i.test(dense), false);

const fast = buildFastPrototypeBootstrap(
  'A mobile education app for kids to practice reading',
  'Mobile App',
);
assert.ok(fast.startsWith(FAST_PROTOTYPE_BOOTSTRAP_PREFIX));
assert.ok(fast.includes('inference-first-rules'));
assert.ok(fast.includes('category-classification.md'));
assert.ok(fast.includes('competitor-research.md'));
assert.ok(fast.includes('THIS TURN = PLAN ONLY'));
assert.ok(fast.includes('Do NOT emit START_CODING'));
assert.ok(fast.includes('Always fill §1 Goal'));
assert.ok(fast.includes('Never paste the raw user prompt'));
assert.equal(/copy\/expand the user brief/i.test(fast), false);
assert.ok(fast.includes('Web Search'));
assert.ok(fast.includes('Do not skip research'));
assert.equal(/Do not skip or reorder/.test(fast), false);
assert.equal(/Then emit START_CODING/.test(fast), false);
assert.equal(/skip-with-reason/i.test(fast), false);
assert.equal(/5\.1–5\.3 Competitor list/i.test(fast), false);
assert.ok(fast.includes('UI Gen v2'));
assert.ok(fast.includes('Foundation Go'));
assert.ok(isHiddenBootstrapUserMessage(fast));
assert.ok(isHiddenBootstrapUserMessage(buildDiscoveryBootstrap('Web App')));

const cont = buildFastPrototypeContinueBootstrap(
  'FAST PROTOTYPE MODE. User goal / brief:\n"""\nKids reading tutor with practice and parent progress.\nhttps://example.com/study\n"""\n',
);
assert.ok(isHiddenBootstrapUserMessage(cont));
assert.ok(cont.includes('START_MASTERPLAN'));
assert.match(cont, /Kids reading tutor/i);
assert.equal(/https?:\/\//.test(cont), false);

console.log('test-fast-prototype-mode: ok');
