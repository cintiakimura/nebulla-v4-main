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
assert.equal(
  isUserExplicitCodingRequest(`${'Please explain how routing works. '.repeat(20)}thanks`),
  false,
);
assert.equal(isUserExplicitCodingRequest('build next'), true);
assert.equal(isUserExplicitCodingRequest('next slice'), true);
assert.equal(
  isUserExplicitCodingRequest('you can start coding, skip security baselines if necessary'),
  true,
);
assert.equal(isUserExplicitCodingRequest('what is the Master Plan?'), false);

const explicitStartCodingPaste = `START_CODING — continue building.

This is an explicit coding request, not a chat discussion.

Do not reply with a promise like “Sure, moving ahead” or “Starting the next slice” unless you also emit START_CODING and file blocks, and the product launches Go Code.

Rules:
- Agent mode, not Chat lock.
- One slice only. If Code has no app/ or pages/ product routes (only index.html / postcss / tailwind / README), this is Foundation — layout, globals, root page, and the first real routes from Master Plan §4 (teacher / child / parent as needed). Do not jump to Primary. Do not rewrite the whole §4 app.
- If Foundation routes already exist, implement the NEXT incomplete primary slice only (Build → Debug → Next). Prefer app/, src/, components/, pages/. Not master-plan or ui-brief only.
- Ignore mockup pixels. Follow Master Plan + ui-brief. Mockup waiting is not a stop if I asked to code — label mockup deferred.
- Do not start a second Grok chat job to confirm. Kick Go / apply.
- Apply is POST file writes to the workspace. Stop after this slice. Do not auto-start the next slice.
- If you cannot code, say Stopped with a real reason (research / ui-brief / timeout / empty output / no product routes / key) — do not say you are coding.`;
assert.ok(explicitStartCodingPaste.length > 400);
assert.equal(isUserExplicitCodingRequest(explicitStartCodingPaste), true);
assert.equal(detectBuildModeIntent(explicitStartCodingPaste), true);

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
