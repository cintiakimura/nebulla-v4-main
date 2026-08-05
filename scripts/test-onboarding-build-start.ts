/**
 * Unit checks for Discovery final-check → coding trigger.
 * Run: npx tsx scripts/test-onboarding-build-start.ts
 */
import assert from 'node:assert/strict';
import {
  assistantAskedFinalDiscovery,
  detectOnboardingBuildStart,
  isOnboardingCompletionReply,
} from '../src/lib/ideWorkspaceChatContext';

const exactFinal =
  "I believe I have all the information I need to start building this for you. Is there anything else you'd like to add?";
const paraphraseFinal =
  "I believe I have everything I need. Is there anything else you'd like to add before I start building?";
const shortFinal = "Is there anything else you'd like to add?";

assert.equal(assistantAskedFinalDiscovery(exactFinal), true);
assert.equal(assistantAskedFinalDiscovery(paraphraseFinal), true);
assert.equal(assistantAskedFinalDiscovery(shortFinal), true);
assert.equal(assistantAskedFinalDiscovery('What is the main goal of your app?'), false);

for (const reply of [
  'no',
  'nothing more to add',
  'I have nothing more to add',
  'there is nothing more to add',
  "that's all",
  'go ahead and build',
]) {
  assert.equal(isOnboardingCompletionReply(reply), true, reply);
}

assert.equal(isOnboardingCompletionReply('yes please build a rocket ship with 20 features'), false);

const priorExact = [{ role: 'assistant', content: exactFinal }];
assert.equal(detectOnboardingBuildStart('I have nothing more to add', priorExact), true);

const priorParaphrase = [{ role: 'assistant', content: paraphraseFinal }];
assert.equal(detectOnboardingBuildStart('nothing more to add', priorParaphrase), true);

// CTA / status after final question must not break detection
const priorWithCta = [
  { role: 'assistant', content: exactFinal },
  {
    role: 'assistant',
    content: 'Switch to Agent to start coding?',
  },
];
assert.equal(detectOnboardingBuildStart('no', priorWithCta), true);

assert.equal(
  detectOnboardingBuildStart('I have nothing more to add', [
    { role: 'assistant', content: 'What type of project are you building?' },
  ]),
  false,
);

console.log('test-onboarding-build-start: ok');
