/**
 * User "go" / "start coding" must force Foundation even without assistant START_CODING tags.
 */
import assert from 'node:assert/strict';
import {
  isAssistantCodingPromise,
  isShortCodingGoNudge,
  isUserExplicitCodingRequest,
} from '../src/lib/ideShortCodingNudge.ts';
import { detectBuildModeIntent } from '../src/lib/ideWorkspaceChatContext.ts';

assert.equal(isUserExplicitCodingRequest('go'), true);
assert.equal(isUserExplicitCodingRequest('Go.'), true);
assert.equal(isUserExplicitCodingRequest('start coding'), true);
assert.equal(isUserExplicitCodingRequest('continue building'), true);
assert.equal(isUserExplicitCodingRequest('continue building the app'), true);
assert.equal(isUserExplicitCodingRequest('keep building'), true);
assert.equal(isUserExplicitCodingRequest('continue'), true);
assert.equal(isUserExplicitCodingRequest('continue please'), true);
assert.equal(isUserExplicitCodingRequest('please continue'), true);
assert.equal(isUserExplicitCodingRequest('can you finish the development please'), true);
assert.equal(isUserExplicitCodingRequest('finish the development please'), true);
assert.equal(isUserExplicitCodingRequest('keep going'), true);
assert.equal(isUserExplicitCodingRequest('finish the Master Plan'), false);
assert.equal(isUserExplicitCodingRequest('continue the interview'), false);
assert.equal(isUserExplicitCodingRequest('build next'), true);
assert.equal(isUserExplicitCodingRequest('next slice'), true);
assert.equal(
  isUserExplicitCodingRequest('you can start coding, skip security baselines if necessary'),
  true,
);
assert.equal(isUserExplicitCodingRequest('what is the Master Plan?'), false);

assert.equal(detectBuildModeIntent('go'), true);
assert.equal(detectBuildModeIntent('start coding now'), true);
assert.equal(detectBuildModeIntent('continue building'), true);
assert.equal(detectBuildModeIntent('continue please'), true);
assert.equal(detectBuildModeIntent('can you finish the development please'), true);
assert.equal(detectBuildModeIntent('hello'), false);

assert.equal(
  isAssistantCodingPromise('Starting the Foundation coding slice now.'),
  true,
);
assert.equal(
  isAssistantCodingPromise('Understood—proceeding with coding and skipping the security baseline.'),
  true,
);
assert.equal(
  isAssistantCodingPromise(
    'Next slice landing: the reading exercise screen. Checking it in the preview now.',
  ),
  true,
);
assert.equal(isAssistantCodingPromise('Here is a summary of the plan.'), false);
assert.equal(
  isAssistantCodingPromise(
    'Got it. Starting the next slice: teacher homework upload flow with camera support and mock AI review.',
  ),
  true,
);
assert.equal(
  isAssistantCodingPromise(
    'Sure, moving ahead with the remaining slices to complete the core flows: teacher upload, child camera session, and both dashboards.',
  ),
  true,
);

assert.equal(isShortCodingGoNudge('Starting the Foundation coding slice now.'), true);

console.log('\n✓ coding go trigger detection passed\n');
