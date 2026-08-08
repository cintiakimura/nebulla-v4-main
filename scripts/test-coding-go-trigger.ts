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
assert.equal(
  isUserExplicitCodingRequest('you can start coding, skip security baselines if necessary'),
  true,
);
assert.equal(isUserExplicitCodingRequest('what is the Master Plan?'), false);

assert.equal(detectBuildModeIntent('go'), true);
assert.equal(detectBuildModeIntent('start coding now'), true);
assert.equal(detectBuildModeIntent('hello'), false);

assert.equal(
  isAssistantCodingPromise('Starting the Foundation coding slice now.'),
  true,
);
assert.equal(
  isAssistantCodingPromise('Understood—proceeding with coding and skipping the security baseline.'),
  true,
);
assert.equal(isAssistantCodingPromise('Here is a summary of the plan.'), false);

assert.equal(isShortCodingGoNudge('Starting the Foundation coding slice now.'), true);

console.log('\n✓ coding go trigger detection passed\n');
