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

const fast = buildFastPrototypeBootstrap(
  'A mobile education app for kids to practice reading',
  'Mobile App',
);
assert.ok(fast.startsWith(FAST_PROTOTYPE_BOOTSTRAP_PREFIX));
assert.ok(fast.includes('inference-first-rules'));
assert.ok(fast.includes('category-classification.md'));
assert.ok(fast.includes('competitor-research.md'));
assert.ok(fast.includes('Do not skip or reorder'));
assert.ok(isHiddenBootstrapUserMessage(fast));
assert.ok(isHiddenBootstrapUserMessage(buildDiscoveryBootstrap('Web App')));

console.log('test-fast-prototype-mode: ok');
