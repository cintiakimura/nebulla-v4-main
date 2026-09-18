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
import { CHAT_SCOREBOARD_APPENDIX, chatModeSystemAppendix } from '../src/lib/grokChatArtifacts';

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
assert.ok(guided.includes('<START_MASTERPLAN>'));
assert.ok(guided.includes('THIS TURN FORBIDDEN'));

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
assert.ok(fast.includes('chat-conversation-loop.md'));
assert.ok(fast.includes('chat-information-checklist.md'));
assert.ok(fast.includes('emptiest required slot'));
assert.ok(fast.includes('THIS TURN FORBIDDEN'));
assert.ok(fast.includes('<START_MASTERPLAN>'));
assert.ok(fast.includes('Do NOT run the engineer interview'));
assert.ok(fast.includes('job-brief.md'));
assert.equal(/THIS TURN = PLAN ONLY/.test(fast), false);
assert.equal(/ENGINEER INTERVIEW/.test(fast), false);
assert.equal(/HARD OUTPUT THIS TURN/.test(fast), false);
assert.equal(/Web Search/i.test(fast), false);
assert.equal(/Do not skip research/i.test(fast), false);
assert.equal(/Then emit START_CODING/.test(fast), false);
assert.ok(isHiddenBootstrapUserMessage(fast));
assert.ok(isHiddenBootstrapUserMessage(buildDiscoveryBootstrap('Web App')));

const cont = buildFastPrototypeContinueBootstrap(
  'FAST PROTOTYPE MODE. User goal / brief:\n"""\nKids reading tutor with practice and parent progress.\nhttps://example.com/study\n"""\n',
);
assert.ok(isHiddenBootstrapUserMessage(cont));
assert.ok(cont.includes('conversation loop') || cont.includes('chat-conversation-loop'));
assert.equal(/HARD retry/.test(cont), false);
assert.match(cont, /Kids reading tutor/i);
assert.equal(/https?:\/\//.test(cont), false);

assert.match(CHAT_SCOREBOARD_APPENDIX, /Slot 1/);
assert.match(CHAT_SCOREBOARD_APPENDIX, /emptiest required slot/);
assert.match(CHAT_SCOREBOARD_APPENDIX, /OFFER the close/);
{
  const appendix = chatModeSystemAppendix({
    interactionMode: 'chat',
    codingHint: 'brainstorm-loop',
    discoveryRequired: true,
  });
  assert.match(appendix, /CHAT_SCOREBOARD/);
  assert.match(appendix, /THIS TURN FORBIDDEN/);
  assert.equal(/HARD OUTPUT THIS TURN/.test(appendix), false);
}

console.log('test-fast-prototype-mode: ok');
