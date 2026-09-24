/**
 * Conversation close gate: summary → confirm → plan.
 * Run: npx tsx scripts/test-chat-brainstorm-close.ts
 */
import assert from 'node:assert/strict';
import {
  BRAINSTORM_CLOSE_CONFIRMED_PREFIX,
  buildBrainstormCloseConfirmedBootstrap,
  clearBrainstormCloseState,
  closeSummaryAsksUiIfEmpty,
  closeSummaryNamesDocumentWorkflow,
  isCloseAddMoreReply,
  isCloseConfirmReply,
  isCloseCorrectReply,
  isCloseEnoughReply,
  isSkipSummaryReply,
  looksLikeCloseOffer,
  resolveBrainstormCloseTurn,
} from '../src/lib/chatBrainstormClose.ts';
import {
  buildFastPrototypeBootstrap,
  isHiddenBootstrapUserMessage,
} from '../src/lib/ideChatBootstrap.ts';
import { chatModeSystemAppendix } from '../src/lib/grokChatArtifacts.ts';

const summary = [
  "I think we've got what we need. Here's what I heard — tell me if this is right.",
  'Goal: get something across town today faster than going yourself or using the post office.',
  'Who: sender, rider, receiver.',
  'Features: request a pickup, match a nearby rider, track until drop-off. Wallet and cash are one settle-the-trip job.',
  'Dependencies: we build matching and tracking; maps is a default you can add a key later; pay is a user choice later.',
  "UI: we'll pick a direction after this, unless you care now.",
].join(' ');

assert.equal(looksLikeCloseOffer(summary), true);
assert.equal(looksLikeCloseOffer('If I understood correctly, this exists so delivery works. Is that right?'), false);
assert.equal(looksLikeCloseOffer(`${summary}\n<START_MASTERPLAN>x</END_MASTERPLAN>`), false);

assert.equal(isCloseConfirmReply('yes'), true);
assert.equal(isCloseConfirmReply('faz isso'), true);
assert.equal(isCloseConfirmReply('looks good'), true);
assert.equal(isCloseEnoughReply('No'), true);
assert.equal(isCloseEnoughReply('no.'), true);
assert.equal(isCloseEnoughReply("that's everything"), true);
assert.equal(isCloseEnoughReply("that’s the heart"), true);
assert.equal(isCloseConfirmReply('No'), true);
assert.equal(isCloseConfirmReply("that's everything"), true);
assert.equal(isCloseCorrectReply('no, it’s same-day lab samples only'), true);
assert.equal(isCloseEnoughReply('no, it’s same-day lab samples only'), false);
assert.equal(isCloseAddMoreReply('wait, also tracking'), true);
assert.equal(isSkipSummaryReply('just build it'), true);

const prior = [{ role: 'assistant', content: summary }];

{
  clearBrainstormCloseState('t-yes');
  const r = resolveBrainstormCloseTurn('yes', prior, 't-yes');
  assert.equal(r.kind, 'confirmed');
  assert.ok(r.summary && r.summary.includes('across town'));
}

{
  clearBrainstormCloseState('t-correct');
  const r = resolveBrainstormCloseTurn('no, it’s same-day lab samples only', prior, 't-correct');
  assert.equal(r.kind, 'correct');
}

{
  clearBrainstormCloseState('t-add');
  const r = resolveBrainstormCloseTurn('wait, also tracking', prior, 't-add');
  assert.equal(r.kind, 'add-more');
}

{
  clearBrainstormCloseState('t-skip');
  const first = resolveBrainstormCloseTurn('just build it', prior, 't-skip');
  assert.equal(first.kind, 'skip-lock');
  const second = resolveBrainstormCloseTurn('just build it', prior, 't-skip');
  assert.equal(second.kind, 'confirmed');
}

{
  clearBrainstormCloseState('t-vague');
  const r = resolveBrainstormCloseTurn('just build it', [], 't-vague');
  assert.equal(r.kind, 'skip-lock');
}

{
  clearBrainstormCloseState('t-yes-bare');
  const r = resolveBrainstormCloseTurn('yes', [], 't-yes-bare');
  assert.equal(r.kind, 'loop');
}

{
  clearBrainstormCloseState('t-no-close');
  const r = resolveBrainstormCloseTurn('No', prior, 't-no-close');
  assert.equal(r.kind, 'confirmed');
}

{
  clearBrainstormCloseState('t-everything');
  const r = resolveBrainstormCloseTurn("that's everything", prior, 't-everything');
  assert.equal(r.kind, 'confirmed');
}

{
  clearBrainstormCloseState('t-heart');
  const r = resolveBrainstormCloseTurn("that's the heart", prior, 't-heart');
  assert.equal(r.kind, 'confirmed');
}

{
  clearBrainstormCloseState('t-no-bare');
  const r = resolveBrainstormCloseTurn('No', [], 't-no-bare');
  assert.equal(r.kind, 'enough');
  assert.equal(r.summary, null);
}

const boot = buildBrainstormCloseConfirmedBootstrap(summary);
assert.ok(boot.startsWith(BRAINSTORM_CLOSE_CONFIRMED_PREFIX));
assert.match(boot, /CONFIRMED_SUMMARY/);
assert.match(boot, /THIS TURN = PLAN ONLY/);
assert.match(boot, /north star/);
assert.match(boot, /Do NOT emit START_CODING/);
assert.ok(isHiddenBootstrapUserMessage(boot));

const seed = buildFastPrototypeBootstrap('motorcycle delivery', 'Web App');
assert.match(seed, /THIS TURN FORBIDDEN/);
assert.match(seed, /Is that right/);
assert.match(seed, /I can build what you have in mind right now/);
assert.match(seed, /shape it together and land on something stronger/);
assert.match(seed, /Which sounds better/);
assert.match(seed, /Never ask what kind of project|Do NOT ask what kind of project|Do NOT inject Guided Discovery/i);
assert.equal(/What's the main thing your app should do/i.test(seed), false);
assert.match(seed, /Never ask what kind of project, paste design or none, or one core feature/i);
assert.match(seed, /Do NOT run Guided Discovery|Do NOT inject Guided Discovery/i);
assert.equal(/ENGINEER INTERVIEW/.test(seed), false);
assert.equal(/THIS TURN = PLAN ONLY/.test(seed), false);
assert.ok(!seed.startsWith(BRAINSTORM_CLOSE_CONFIRMED_PREFIX));

const loopAppendix = chatModeSystemAppendix({
  interactionMode: 'chat',
  codingHint: 'brainstorm-loop',
  discoveryRequired: true,
});
assert.match(loopAppendix, /THIS TURN FORBIDDEN/);
assert.match(loopAppendix, /CHAT_CLOSE/);
assert.match(loopAppendix, /Critical partner/);
assert.match(loopAppendix, /warning \+ option \+ a buildable solution/);
assert.match(loopAppendix, /Do not invent risk/);
assert.match(loopAppendix, /Never only echo/);
assert.match(loopAppendix, /inferred workflow/);
assert.match(loopAppendix, /If this is right, I'll lock it and build this product/);
assert.match(loopAppendix, /Do not ask "what else\?"/);
assert.match(loopAppendix, /that's everything/);
assert.match(loopAppendix, /I can build what you have in mind right now/);
assert.match(loopAppendix, /HIPAA only if they said health/);
assert.match(loopAppendix, /Guided Discovery OFF/);
assert.equal(/INITIAL ONBOARDING/.test(loopAppendix), false);
assert.equal(/ENGINEER INTERVIEW/.test(loopAppendix), false);
assert.equal(/v1 can mock this/.test(loopAppendix), false);
assert.equal(/2–4 feature ideas/.test(seed), false);
assert.match(seed, /inferred workflow/);
assert.match(seed, /lock it and build this product/);

const snapfillClose = [
  "I think we've got what we need. Here's what I heard — tell me if this is right.",
  'Goal: keep patient scans so the clinician can find them later.',
  'Who: clinician and patient.',
  'Features: capture, extract text, review, save into a per-client dossier and history so files live on-device.',
  'Dependencies: Tesseract locally unless they choose cloud OCR; no mock of extract or save.',
  'Walls: health images — local extract, they pick a compliance family.',
  'UI: web or mobile, and how dense should it feel?',
  "If this is right, I'll lock it and build this product.",
].join(' ');
assert.equal(looksLikeCloseOffer(snapfillClose), true);
assert.equal(closeSummaryNamesDocumentWorkflow(snapfillClose), true);
assert.equal(closeSummaryAsksUiIfEmpty(snapfillClose), true);
assert.equal(
  closeSummaryNamesDocumentWorkflow('Goal: three ideas. Mock OCR later. Shall we go?'),
  false,
);

const healthBeat =
  'Health images need care. We can extract locally on-device, or you pick a compliance family — either way we still build capture, review, and the dossier.';
assert.match(healthBeat, /warning|care|local|compliance/i);
assert.equal(/you can'?t build this|legal audit/i.test(healthBeat), false);

const confirmAppendix = chatModeSystemAppendix({
  interactionMode: 'agent',
  codingHint: 'brainstorm-close-confirmed',
  discoveryRequired: false,
  mode: 'architecture',
});
assert.match(confirmAppendix, /BRAINSTORM CLOSE CONFIRMED/);
assert.match(confirmAppendix, /PLAN ONLY/);
assert.match(confirmAppendix, /Do NOT emit START_CODING/);
assert.match(confirmAppendix, /§4 pages come from THIS goal|never leftover Dossiers/);

const enoughAppendix = chatModeSystemAppendix({
  interactionMode: 'chat',
  codingHint: 'brainstorm-enough-close',
  discoveryRequired: true,
});
assert.match(enoughAppendix, /BRAINSTORM ENOUGH|that's the heart|what else/);
assert.match(enoughAppendix, /Do NOT ask "what else\?"/);
assert.match(enoughAppendix, /empty required slots/);
assert.equal(/START_CODING on compliment/.test(enoughAppendix) || /THIS TURN FORBIDDEN/.test(enoughAppendix), true);

console.log('test-chat-brainstorm-close: ok');
