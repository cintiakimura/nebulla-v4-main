/**
 * User "go" / "start coding" must force Foundation even without assistant START_CODING tags.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  isAssistantBuildNowCloser,
  isAssistantCodingPromise,
  isAssistantRefineClaim,
  isGuidedFirstReplyShape,
  isPostCodeRefineRequest,
  isFoundationCloseGate,
  isShortCodingGoNudge,
  isUserExplicitCodingRequest,
  shouldUnlockMicAfterAssistantTurn,
} from '../src/lib/ideShortCodingNudge.ts';
import { isNewProductSeedAgainstCurrent } from '../lib/productGoalFingerprint.ts';
import { buildNextGoUserNote, EDIT_EXISTING_SLICE_INSTRUCTION } from '../src/lib/fastPrototypeNextSlice.ts';
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

assert.equal(isUserExplicitCodingRequest('hello', { firstUserMessage: true }), false);
assert.equal(isUserExplicitCodingRequest('hello', { firstUserMessage: false, closerReady: true }), true);
assert.equal(isUserExplicitCodingRequest('hellos', { closerReady: true }), true);
assert.equal(isUserExplicitCodingRequest('hellos', { firstUserMessage: true }), false);
assert.equal(isUserExplicitCodingRequest('go', { firstUserMessage: true }), true);
assert.equal(isUserExplicitCodingRequest('you can start', { firstUserMessage: true }), true);
assert.equal(isFoundationCloseGate('influencers and brands'), false);
assert.equal(isFoundationCloseGate('That’s a great idea. Is that right?'), false);
assert.equal(isFoundationCloseGate('go'), true);
assert.equal(isFoundationCloseGate('hellos'), true);
assert.equal(isFoundationCloseGate('you can start'), true);
assert.equal(isFoundationCloseGate("let's keep Bridgen and start"), true);
assert.equal(isUserExplicitCodingRequest('just build it', { firstUserMessage: true }), true);
assert.equal(isUserExplicitCodingRequest('yes', { closerReady: false }), false);
assert.equal(isUserExplicitCodingRequest('yes', { closerReady: true }), true);
assert.equal(isAssistantBuildNowCloser('Hello — I can build this now.'), true);
assert.equal(isAssistantCodingPromise('Hello — I can build this now.'), true);

const firstReply =
  "That's a great idea. If I understood correctly, this is what the app should do: kids practice reading in short sessions. Is that right? Do you already have the full idea in mind, or do you want to brainstorm and shape it together?";
assert.equal(isGuidedFirstReplyShape(firstReply), true);
assert.equal(isGuidedFirstReplyShape('So a reading app. Cool.'), false);
assert.equal(shouldUnlockMicAfterAssistantTurn(firstReply), true);
assert.equal(shouldUnlockMicAfterAssistantTurn('brainstorm'), false);
assert.equal(shouldUnlockMicAfterAssistantTurn('If I understood correctly, this is a courier app. Is that right?'), true);

const refineNav =
  'make it dark, fix the nav, keep mock';
assert.equal(isPostCodeRefineRequest(refineNav), true);
assert.equal(isNewProductSeedAgainstCurrent({ userText: refineNav, chipName: 'Quill Learn Kids' }), false);
assert.equal(
  isNewProductSeedAgainstCurrent({ userText: 'Bridgen', chipName: 'Quill Learn Kids', diskGoal: 'Quill Learn Kids' }),
  true,
);
const editNote = buildNextGoUserNote(true, refineNav);
assert.equal(editNote.startsWith(EDIT_EXISTING_SLICE_INSTRUCTION), true);
assert.equal(/scaffold a new app/i.test(editNote), true);

const longRefine =
  'keep mock auth and mockStore as they are. apply a dark theme across the home screen. ' +
  'fill the layout draft from the latest note. edit existing files only — globals.css, layout, and page components. ' +
  'Do not add a new framework, do not wipe routes, and do not rewrite package.json. '.repeat(3);
assert.ok(longRefine.length > 400);
assert.equal(isPostCodeRefineRequest(longRefine), true);
assert.equal(isUserExplicitCodingRequest(longRefine), true);

const applyingTheme =
  'Understood. Applying dark theme fixes, mobile-companion home update, layout draft fill, and css color pass on the existing files. ' +
  'I will patch globals and the home screen in place. '.repeat(12);
assert.ok(applyingTheme.length > 500);
assert.equal(isAssistantRefineClaim(applyingTheme), true);
assert.equal(isAssistantCodingPromise(applyingTheme), true);

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

{
  const chat = fs.readFileSync(path.join(process.cwd(), 'src/components/ide/AIChat.tsx'), 'utf8');
  assert.match(chat, /shouldUnlockMicAfterAssistantTurn/);
  assert.match(chat, /openTalkDesiredRef\.current = true/);
  assert.equal(/if\s*\(\s*\/brainstorm\/i\.test/.test(chat), false);
  assert.match(chat, /refineSameProduct/);
  assert.match(chat, /MIC_REENABLE_AFTER_TTS_MS/);
  const floor = fs.readFileSync(path.join(process.cwd(), 'lib/codingSkeleton.ts'), 'utf8');
  assert.match(floor, /dark calm default/);
  assert.match(floor, /Never concatenate leftover brands/);
}

console.log('\n✓ coding go trigger detection passed\n');
